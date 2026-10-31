/* Closeout requirements from the current user request, section 二:
 * “公式区域 ROI 放大 2 倍 + 二值化 + 去噪”
 * “后处理加可疑标记” and “识别原文 / 校正后并排 diff，一键采纳”.
 * This module implements only those explicitly requested acceptance changes.
 */
let ocrCandidate = '';
let ocrRoiCount = 0;
let ocrQuality = null;
// Engine scores are a warning heuristic, not calibrated accuracy or handwriting detection.
function assessOcrQuality(data) {
  const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence) ? data.confidence : null;
  const words = (data.words || []).filter(word => word.text?.trim() && typeof word.confidence === 'number' && Number.isFinite(word.confidence));
  const weakRatio = words.length ? words.filter(word => word.confidence < 50).length / words.length : 0;
  const empty = !String(data.text || '').trim();
  return { confidence, empty, low: empty || (confidence !== null && confidence < 60) || (words.length >= 5 && weakRatio > .5) };
}

function keepOcrImageOnly() {
  if (!saveImageSnapshot || saveBusy || processingBusy) return;
  const subject = document.getElementById('formSubject')?.value;
  const topic = document.getElementById('formTopic')?.value;
  const cause = document.getElementById('formCause')?.value;
  const answer = document.getElementById('formAnswer')?.value;
  const paperName = document.getElementById('formPaperName')?.value;
  const questionNo = document.getElementById('formQuestionNo')?.value;
  capturedImage = saveImageSnapshot;
  lastOcrRaw = ''; ocrCandidate = ''; ocrRoiCount = 0; ocrQuality = null;
  openSaveModal('', subject, true);
  if (topic) document.getElementById('formTopic').value = topic;
  if (cause) document.getElementById('formCause').value = cause;
  if (answer) document.getElementById('formAnswer').value = answer;
  if (paperName) document.getElementById('formPaperName').value = paperName;
  if (questionNo) document.getElementById('formQuestionNo').value = questionNo;
  showToast('已移除识别文字，原图保留；可直接保存');
}
function isMathLine(text) {
  return /[=<>≥≤√∫²³^]|\b[xyz][2-9?]\b|\b[UV]\s*\(|函数|积分|根号|分式/.test(text);
}

async function mathLineCandidates(snapshot, data, worker) {
  const lines = data.lines || [], candidates = lines.map(line => line.text.trim());
  const selected = lines.map((line, index) => ({ line, index }))
    .filter(({ line }) => isMathLine(line.text) && line.bbox).slice(0, 8);
  ocrRoiCount = selected.length;
  if (!selected.length) return data.text || '';
  const image = new Image(); image.src = snapshot; await image.decode();
  for (const { line, index } of selected) {
    const box = line.bbox;
    const x = Math.max(0, box.x0 - 10), y = Math.max(0, box.y0 - 10);
    const width = Math.min(image.naturalWidth - x, box.x1 - x + 10);
    const height = Math.min(image.naturalHeight - y, box.y1 - y + 10);
    if (width <= 0 || height <= 0) continue;
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Uint8Array(canvas.width * canvas.height), histogram = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4;
      gray[i] = Math.round(pixels.data[p] * .299 + pixels.data[p + 1] * .587 + pixels.data[p + 2] * .114);
      histogram[gray[i]]++; total += gray[i];
    }
    let count = 0, sum = 0, variance = -1, threshold = 127;
    for (let t = 0; t < 256; t++) {
      count += histogram[t]; sum += t * histogram[t];
      const remaining = gray.length - count;
      if (!count || !remaining) continue;
      const delta = sum / count - (total - sum) / remaining;
      const score = count * remaining * delta * delta;
      if (score > variance) { variance = score; threshold = t; }
    }
    const binary = gray.map(value => value <= threshold ? 0 : 255), w = canvas.width;
    for (let i = 0; i < binary.length; i++) {
      let value = binary[i];
      if (i > w && i < binary.length - w && i % w > 0 && i % w < w - 1 && !value &&
          binary[i - 1] && binary[i + 1] && binary[i - w] && binary[i + w]) value = 255;
      pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = value;
    }
    ctx.putImageData(pixels, 0, 0);
    const result = await worker.recognize(canvas, { tessedit_pageseg_mode: '7' });
    if (result.data.text.trim() && result.data.confidence >= (line.confidence || 0)) candidates[index] = result.data.text.trim();
  }
  return candidates.join('\n');
}

function mathSuspicions(text) {
  const ranges = []; let offset = 0;
  for (const line of text.split('\n')) {
    if (isMathLine(line) || /[√∫≥≤]|\b[UV]\b/.test(line)) {
      const rules = [
        [/[≥><≤]/g, '请核对 ≥ / > 或 ≤ / <'], [/[√V]/g, '请核对 √ / V'],
        [/[∫一]/g, '请核对 ∫ / 一'], [/[xyz](?:[²³]|\s*[23?])/gi, '请核对上标 x² / x2'],
        [/\bU\b|[1U](?=\s*[\/／])/g, '请核对分子 1 / U'], [/f\s*\(\s*[W9]/g, '请核对函数变量']
      ];
      for (const [pattern, message] of rules) for (const match of line.matchAll(pattern)) ranges.push({ start: offset + match.index, end: offset + match.index + match[0].length, message });
      if ((line.match(/[（(]/g) || []).length !== (line.match(/[）)]/g) || []).length) ranges.push({ start: offset, end: offset + line.length, message: '括号可能缺失' });
      if (/积分/.test(line) && !/∫/.test(line)) ranges.push({ start: offset, end: offset + line.length, message: '积分号可能漏识别' });
    }
    offset += line.length + 1;
  }
  return ranges;
}

function ocrDiffMarkup(text, comparison, original = false) {
  const warnings = mathSuspicions(text), rows = text.split('\n'), other = comparison.split('\n'); let offset = 0;
  return rows.map((line, index) => {
    const compared = other[index] || ''; let prefix = 0, suffix = 0;
    while (prefix < Math.min(line.length, compared.length) && line[prefix] === compared[prefix]) prefix++;
    while (suffix < Math.min(line.length, compared.length) - prefix && line[line.length - suffix - 1] === compared[compared.length - suffix - 1]) suffix++;
    const html = line.split('').map((char, column) => {
      const warning = warnings.find(x => offset + column >= x.start && offset + column < x.end);
      let value = escapeHtml(char);
      if (column >= prefix && column < line.length - suffix) value = `<span class="diff-${original ? 'old' : 'new'}">${value}</span>`;
      return warning ? `<mark title="此处请对照原图：${escapeHtml(warning.message)}">${value}</mark>` : value;
    }).join(''); offset += line.length + 1; return html;
  }).join('\n');
}

function updateOcrDiff() {
  const field = document.getElementById('formText'), original = document.getElementById('ocrOriginal');
  if (!field || !original) return;
  const checked = document.getElementById('ocrTextConfirmed'); if (checked) checked.checked = false;
  original.innerHTML = ocrDiffMarkup(lastOcrRaw, field.value, true);
  document.getElementById('ocrCorrected').innerHTML = ocrDiffMarkup(field.value, lastOcrRaw);
  const count = mathSuspicions(field.value).length;
  document.getElementById('ocrWarning').textContent = count ? `标记了 ${count} 处可能混淆的符号，不代表只有这些错误。请对照原图核对。` : '未命中常见符号规则，不代表识别正确。请对照原图核对。';
}
function acceptOcrCandidate() {
  const field = document.getElementById('formText'); field.value = normalizeOcrText(ocrCandidate || lastOcrRaw);
  const checked = document.getElementById('ocrTextConfirmed'); if (checked) checked.checked = false;
  updateOcrDiff(); field.focus();
}

function ocrReviewEditor(text) {
  const vision = navigator.onLine && settings.useAiOcr && settings.aiKey && canUseAi();
  return `<div class="ocr-quality-note ${ocrQuality?.low ? 'low' : ''}" role="status"><strong>${ocrQuality?.low ? '这次识别结果不可靠' : '识别文字需要核对'}</strong><p>离线识别主要适合清晰印刷体，手写公式、下标和表格可能出现大量错误。符号替换不能还原题意。</p><button type="button" class="btn outline" onclick="keepOcrImageOnly()">清除识别文字，仅保留图片</button></div>
    <label class="field-label" for="formText">核对并编辑文字（可只保存图片）</label>
    <textarea id="formText" rows="5" oninput="updateOcrDiff()">${escapeHtml(text)}</textarea>
    <div class="formula-tools">${['²','³','≥','≤','√','∫','1','(',')','/'].map(x => `<button type="button" class="chip" onclick="insertFormula('${x}')">${x}</button>`).join('')}</div>
    ${ocrQuality?.low ? '<label class="ocr-confirm"><input id="ocrTextConfirmed" type="checkbox">我已对照原图核对，保存当前文字</label>' : ''}
    <details class="ocr-comparison"><summary>展开识别原文与当前编辑对比</summary><p id="ocrWarning" class="field-help"></p><div class="ocr-diff-grid"><section><h4>识别原文（未核对）</h4><pre id="ocrOriginal"></pre></section><section><h4>当前编辑</h4><pre id="ocrCorrected"></pre></section></div></details>
    <details class="ocr-suggestion"><summary>查看处理建议（${ocrRoiCount} 行公式局部增强）</summary><pre id="ocrSuggestion">${escapeHtml(ocrCandidate || normalizeOcrText(text))}</pre></details>
    <div class="ocr-review-actions"><button type="button" class="btn outline" onclick="acceptOcrCandidate()">使用处理建议，仍需核对</button>${vision ? '<button type="button" class="text-btn" onclick="requestVisionReview()">AI 视觉复核</button>' : ''}</div>`;
}

async function requestVisionReview() {
  if (!navigator.onLine || !settings.useAiOcr || !settings.aiKey || !canUseAi() || !saveImageSnapshot || processingBusy) return;
  processingBusy = true;
  showProcessing('AI 视觉复核', '将当前题图发送到你配置的接口');
  try {
    ocrCandidate = await callVisionOcr(saveImageSnapshot);
    document.getElementById('ocrSuggestion').textContent = normalizeOcrText(ocrCandidate);
    document.querySelector('.ocr-suggestion').open = true;
    showToast('复核结果已放在建议区，请核对后采纳');
  } catch (error) { notifyFailure(error); }
  finally { hideProcessing(); processingBusy = false; }
}
