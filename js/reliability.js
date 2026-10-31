/* Small shared guards for the existing app. No runtime dependencies. */
function canUseAi() {
  try {
    aiConfig();
    return true;
  } catch (_) { return false; }
}

function openImageOnly() {
  if (!capturedImage || ocrBusy) return;
  lastOcrRaw = ''; saveImageSnapshot = capturedImage;
  openSaveModal('', '', true);
}

function openAiSettings() {
  navigateTo('profile');
  const panel = document.getElementById('aiSettings');
  panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function fetchWithTimeout(url, options = {}, milliseconds = 12000) {
  if (!navigator.onLine) throw new Error('当前离线');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Consume the body before clearing the timeout (headers alone are not enough).
    const bytes = await response.arrayBuffer();
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('连接超时，请稍后重试');
    throw error;
  } finally { clearTimeout(timer); }
}

function safeImageUrl(value) {
  // Imported images must be self-contained raster data; never execute SVG/HTML or remote trackers.
  return typeof value === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)
    ? value : '';
}

function imageHtml(value) { return escapeHtml(safeImageUrl(value)); }

async function compressImage(value, maxEdge = 1800, maxBytes = 900000) {
  if (!safeImageUrl(value)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  const img = new Image();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('图片读取超时')), 12000);
    img.onload = () => { clearTimeout(timer); resolve(); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('图片无法读取')); };
    img.src = value;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let result = canvas.toDataURL('image/jpeg', 0.88);
  for (const quality of [0.78, 0.66, 0.54]) {
    if (result.length * 0.75 <= maxBytes) break;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length * 0.75 > maxBytes) throw new Error('图片过大，请先裁剪到一道题');
  return result;
}

function normalizeSettings(input, strict = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (strict) throw new Error('settings 必须是对象');
    input = {};
  }
  const result = { ...DEFAULT_SETTINGS, subjects: [...DEFAULT_SETTINGS.subjects] };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in input)) continue;
    const value = input[key];
    if (key === 'subjects') {
      if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || !SUBJECTS.includes(x))) {
        if (strict) throw new Error('settings.subjects 必须是有效科目数组');
      } else result.subjects = [...new Set(value)];
    } else if (typeof value === typeof DEFAULT_SETTINGS[key]) result[key] = value;
    else if (strict) throw new Error('设置字段类型错误：' + key);
  }
  result.dailyGoal = Math.max(0, Math.min(20, Number(result.dailyGoal) || 0));
  result.ocrLang = ['chi_sim+eng', 'chi_sim', 'eng'].includes(result.ocrLang) ? result.ocrLang : 'chi_sim+eng';
  return result;
}

function normalizeRecords(items) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('错题须为数组，最多 10000 条');
  const ids = new Set();
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string' || !item.text.trim()) {
      throw new Error(`第 ${index + 1} 条题目内容无效，未导入任何数据`);
    }
    const record = { text: item.text, subject: '数学', topic: '未分类', paperName: '', questionNo: '', cause: '', answer: '', image: '',
      status: 'new', reviewCount: 0, analysis: null, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: null,
      nextReviewAt: null, lastReviewedAt: null };
    for (const key of ['text', 'subject', 'topic', 'paperName', 'questionNo', 'cause', 'answer', 'source', 'lastAttempt', 'ocrRaw']) {
      if (item[key] != null && typeof item[key] !== 'string') throw new Error(`第 ${index + 1} 条 ${key} 类型错误`);
      if (typeof item[key] === 'string') record[key] = item[key];
    }
    for (const key of ['createdAt', 'updatedAt', 'nextReviewAt', 'lastReviewedAt']) {
      if (item[key] != null) {
        if (typeof item[key] !== 'string' || !Number.isFinite(Date.parse(item[key]))) throw new Error(`第 ${index + 1} 条日期无效`);
        record[key] = new Date(item[key]).toISOString();
      }
    }
    record.updatedAt ||= record.createdAt;
    if (record.paperName.length > 120 || record.questionNo.length > 30) throw new Error('试卷名称或题号过长，未导入任何数据');
    if (item.id != null) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id)) throw new Error('错题 ID 无效或重复');
      ids.add(item.id); record.id = item.id;
    }
    record.syncId = typeof item.syncId === 'string' && item.syncId.length <= 250 ? item.syncId :
      'legacy:' + record.createdAt + ':' + (record.id || '') + ':' + record.subject + ':' + record.text.slice(0, 100);
    record.status = ['new', 'reviewing', 'mastered'].includes(item.status) ? item.status : 'new';
    record.reviewCount = Number.isInteger(item.reviewCount) ? Math.max(0, Math.min(10000, item.reviewCount)) : 0;
    if (item.image) {
      if (!safeImageUrl(item.image) || item.image.length > 16000000) throw new Error('备份含无效或过大的图片');
      record.image = item.image;
    }
    if (item.analysis != null) {
      if (typeof item.analysis !== 'object' || Array.isArray(item.analysis)) throw new Error('复盘格式错误');
      const a = item.analysis;
      record.analysis = {};
      for (const key of ['analysis', 'solution', 'advice', 'generatedAt']) {
        if (a[key] != null && typeof a[key] !== 'string') throw new Error('复盘字段类型错误');
        record.analysis[key] = a[key] || '';
      }
      if (a.similar != null && (!Array.isArray(a.similar) || a.similar.some(x => typeof x !== 'string'))) throw new Error('练习题格式错误');
      record.analysis.similar = a.similar || [];
      record.analysis.similarDone = Array.isArray(a.similarDone) ? a.similarDone.filter(Number.isInteger) : [];
      record.analysis.source = a.source === 'ai' ? 'ai' : 'template';
    }
    if (item.attemptFeedback && typeof item.attemptFeedback.text === 'string') {
      record.attemptFeedback = { text: item.attemptFeedback.text, source: item.attemptFeedback.source === 'ai' ? 'ai' : 'template' };
    }
    return record;
  });
}

function mergeRecords(local, incoming) {
  const result = normalizeRecords(local);
  let nextId = result.reduce((max, x) => Math.max(max, x.id || 0), 0) + 1;
  const keys = new Map(result.map((x, i) => [x.syncId, i]));
  for (const record of incoming) {
    const idx = keys.get(record.syncId);
    if (idx === undefined) {
      keys.set(record.syncId, result.length);
      result.push({ ...record, id: nextId++ });
    } else if (Date.parse(record.updatedAt) > Date.parse(result[idx].updatedAt)) {
      result[idx] = { ...record, id: result[idx].id };
    }
  }
  return result;
}

async function writeRecords(incoming, mode = 'merge') {
  // Read inside the write transaction so a concurrent save is never overwritten by an old snapshot.
  if (db) return db.transaction('rw', db.errors, async () => {
    const records = mode === 'merge' ? mergeRecords(await db.errors.toArray(), incoming) : incoming;
    if (mode === 'replace') await db.errors.clear();
    await db.errors.bulkPut(records);
  });
  const records = mode === 'merge' ? mergeRecords(lsLoadErrors(), incoming) : incoming.map((x, i) => ({ ...x, id: i + 1 }));
  lsSaveErrors(records);
}

function chooseImportMode(count) {
  return new Promise(resolve => {
    const dialog = document.getElementById('importDialog');
    document.getElementById('importSummary').textContent = `文件中有 ${count} 道题。本地已有 ${allErrors.length} 道。`;
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => resolve(dialog.returnValue || 'cancel'), { once: true });
    dialog.showModal();
  });
}

function notifyFailure(error) {
  const quota = /quota|space|disk/i.test(error?.name + ' ' + error?.message);
  showToast(quota ? '存储空间不足，未保存。请先导出备份并清理空间。' : '未完成：' + (error?.message || '请重试'));
}

function normalizeOcrText(raw) {
  // Only normalize explicit notation; never guess that a bare >, V or 一 is another symbol.
  return String(raw || '').replace(/\r\n?/g, '\n')
    .replace(/[Ａ-Ｚａ-ｚ０-９＋＝＜＞／]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/≧|>\s*=/g, '≥').replace(/≦|<\s*=/g, '≤')
    .replace(/([a-zA-Z)])\s*\^\s*([0-9]+)\b/g, (_, base, exponent) => base + [...exponent].map(n => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(n)]).join(''))
    .replace(/\\sqrt\s*\{([^{}]+)\}|\bsqrt\s*\(([^()]+)\)/g, (_, a, b) => '√(' + (a || b) + ')')
    .replace(/\\int\b|\bint(?=\s*[_({])/g, '∫')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/([\u3400-\u9fff])\s*[,，]\s*/g, '$1，')
    .replace(/([\u3400-\u9fff])\s*[:：]\s*/g, '$1：')
    .replace(/([\u3400-\u9fff])\s*[;；]\s*/g, '$1；')
    .replace(/([\u3400-\u9fff])\s*\.(?=\s|$)/g, '$1。')
    .replace(/([\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '$1')
    .replace(/[ \t]+\n/g, '\n').trim();
}

function insertFormula(symbol) {
  const field = document.getElementById('formText');
  if (!field) return;
  const start = field.selectionStart, end = field.selectionEnd;
  field.setRangeText(symbol, start, end, 'end');
  updateOcrDiff();
  field.focus();
}
