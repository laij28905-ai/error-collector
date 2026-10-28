/* OpenAI-compatible image chat. Presets are documented in docs/ai-setup.md. */
const AI_SERVICES = {
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', hint: '使用支持图片输入的模型，模型名称可修改。' },
  deepseek: { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', hint: '使用官方支持识图的 Flash 模型；其他型号请先测试。' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', hint: '填写 Google AI Studio 的 Key，使用 OpenAI 兼容地址。' },
  qwen: { endpoint: '', model: 'qwen3-vl-plus', hint: '请从百炼控制台复制与你的地域、业务空间匹配的 OpenAI 兼容地址。' },
  custom: { endpoint: '', model: '', hint: '支持 OpenAI Chat Completions 格式及 image_url 图片输入的服务。原生 Claude、Responses 等不同协议不能直接填写。' }
};
let aiTesting = false;

function aiBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /[{}]/.test(raw)) throw new Error('请填写实际接口地址，不能保留占位符');
  let url;
  try { url = new URL(raw); } catch (_) { throw new Error('接口地址无效'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('接口须使用 HTTPS；本机服务可用 HTTP');
  if (url.username || url.password || url.search || url.hash) throw new Error('接口地址不能包含账号、密钥或查询参数');
  return url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}

function aiConfig(input = settings) {
  const endpoint = aiBaseUrl(input.aiEndpoint);
  const model = String(input.aiModel || '').trim();
  const key = String(input.aiKey || '').trim();
  if (!model) throw new Error('请填写支持识图的模型名称');
  if (!key && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname)) throw new Error('请填写这家服务的 API Key');
  return { endpoint, model, key };
}

function aiUserContent(text, image) {
  if (!image) return String(text);
  const safe = safeImageUrl(image);
  if (!safe) throw new Error('题图无效，未发送请求');
  return [{ type: 'text', text: String(text) }, { type: 'image_url', image_url: { url: safe } }];
}

function aiResponseText(data) {
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) throw new Error('模型未能处理这道题，请核对题图后重试');
  const content = message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.filter(x => x.type === 'text' && typeof x.text === 'string').map(x => x.text).join('\n') : '';
  if (!text.trim()) throw new Error('模型没有返回有效内容，请检查型号或重试');
  if (data.choices[0].finish_reason === 'length') throw new Error('模型回答被截断，请裁剪到一道题后重试');
  return text.trim();
}

async function requestAi(messages, config = aiConfig()) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.key) headers.Authorization = 'Bearer ' + config.key;
  let response;
  try {
    response = await fetchWithTimeout(config.endpoint + '/chat/completions', {
      method: 'POST', headers, redirect: 'error',
      body: JSON.stringify({ model: config.model, messages, stream: false })
    }, 15000);
  } catch (error) {
    if (error instanceof TypeError) throw new Error('无法连接：请检查网络及服务是否允许浏览器直连（CORS）');
    throw error;
  }
  if (!response.ok) {
    const hints = { 400: '请求不被支持，请检查模型是否支持图片及接口格式', 401: 'API Key 无效或已过期', 403: '账号无权访问该模型或当前地区受限', 404: '接口地址或模型名称不存在', 413: '图片过大，请裁剪后重试', 422: '模型不支持当前图片或请求格式', 429: '请求受限，请检查余额、配额，或稍后重试' };
    throw new Error(hints[response.status] || `模型服务暂不可用（${response.status}）`);
  }
  let data;
  try { data = await response.json(); } catch (_) { throw new Error('接口没有返回有效 JSON，请检查兼容地址'); }
  return aiResponseText(data);
}

function aiFormConfig() {
  return aiConfig({ aiEndpoint: document.getElementById('aiEndpoint').value, aiModel: document.getElementById('aiModel').value, aiKey: document.getElementById('aiKey').value });
}
function resetAiTest(clearKey = false) {
  if (clearKey) document.getElementById('aiKey').value = '';
  document.getElementById('aiTestStatus').textContent = clearKey ? '接口已更换，请填写对应服务的 Key 后重新测试。' : '尚未验证当前配置的识图能力。';
}
function updateAiServiceHint() {
  const service = AI_SERVICES[document.getElementById('aiProvider').value] || AI_SERVICES.custom;
  document.getElementById('aiProviderHint').textContent = service.hint;
}
function chooseAiService() {
  const service = AI_SERVICES[document.getElementById('aiProvider').value] || AI_SERVICES.custom;
  document.getElementById('aiEndpoint').value = service.endpoint;
  document.getElementById('aiModel').value = service.model;
  resetAiTest(true); updateAiServiceHint();
}
function inferAiService(endpoint) {
  const base = String(endpoint || '').replace(/\/+$/, '');
  return Object.keys(AI_SERVICES).find(key => AI_SERVICES[key].endpoint && AI_SERVICES[key].endpoint === base) || 'custom';
}
function fillAiServiceForm() {
  document.getElementById('aiProvider').value = inferAiService(settings.aiEndpoint);
  updateAiServiceHint(); resetAiTest();
}

async function testAiVision() {
  if (aiTesting) return;
  const status = document.getElementById('aiTestStatus'), button = document.getElementById('testAiVision');
  aiTesting = true; button.disabled = true;
  try {
    const config = aiFormConfig();
    const numbers = crypto.getRandomValues(new Uint32Array(4));
    const expected = [...numbers].map(x => x % 10).join('');
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 140;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 140);
    ctx.fillStyle = '#000'; ctx.font = 'bold 72px sans-serif'; ctx.fillText(expected, 55, 95);
    status.textContent = '正在用本机生成的数字图片测试，不发送你的错题…';
    const text = await requestAi([{ role: 'user', content: aiUserContent('请只输出图片中的四位数字，不要解释。', canvas.toDataURL('image/png')) }], config);
    const now = aiFormConfig();
    if (JSON.stringify(now) !== JSON.stringify(config)) { resetAiTest(); return; }
    if (text.replace(/\s/g, '') !== expected) throw new Error('接口有响应，但未正确读出测试图片；请换识图模型后重试');
    status.textContent = '识图测试通过，可保存配置。此测试不代表解题准确率。';
  } catch (error) { status.textContent = error.message; }
  finally { aiTesting = false; button.disabled = false; }
}

async function runAiCapture() {
  if (!capturedImage || ocrBusy || processingBusy) return;
  if (!navigator.onLine) { showToast('当前离线，可用本地识别或先保存原图'); return; }
  if (!canUseAi()) { openAiSettings(); showToast('请先配置识图模型，再回到录入页'); return; }
  const snapshot = capturedImage;
  ocrBusy = true; processingBusy = true;
  try {
    showProcessing('AI 正在识图', '当前题图将发送到你配置的模型服务');
    const text = await callVisionOcr(snapshot);
    lastOcrRaw = text; ocrCandidate = normalizeOcrText(text); ocrRoiCount = 0;
    saveImageSnapshot = snapshot;
    openSaveModal(ocrCandidate, guessSubject(text));
  } catch (error) { notifyFailure(error); }
  finally { ocrBusy = false; processingBusy = false; hideProcessing(); }
}
