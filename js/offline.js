let offlineRegistration = null;
let offlineReady = false;
let offlineChecking = false;
let updateRequested = false;
let offlinePreparing = false;

async function checkOfflinePack() {
  if (offlineChecking) return;
  offlineChecking = true;
  const status = document.getElementById('offlineStatus');
  const button = document.getElementById('prepareOffline');
  try {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) {
      throw new Error('请通过 localhost 或 HTTPS 打开，才能安装离线包');
    }
    const scope = new URL('./', location.href).pathname;
    const cache = await caches.open('tf-ocr:' + scope + ':' + OCR_PACK.version);
    let complete = 0, verifiedBytes = 0;
    for (const file of OCR_PACK.files) {
      const response = await cache.match(new URL(file.path, location.href).href);
      if (response?.headers.get('X-OCR-SHA256') === file.sha256) { complete++; verifiedBytes += file.bytes; }
    }
    offlineReady = complete === OCR_PACK.files.length && !!navigator.serviceWorker.controller;
    status.textContent = offlineReady ? '离线识别已就绪' : navigator.serviceWorker.controller ? (offlinePreparing ? `识别包准备中 ${complete}/${OCR_PACK.files.length}，可先保存图片` : '图片记录已就绪 · 文字识别可选') : '正在准备图片离线记录…';
    const total = OCR_PACK.files.reduce((sum, file) => sum + file.bytes, 0);
    document.getElementById('offlineProgress').value = Math.round(verifiedBytes / total * 100);
    document.getElementById('offlineBytes').textContent = `已校验 ${(verifiedBytes / 1000000).toFixed(1)} / ${(total / 1000000).toFixed(1)} MB；每个文件下载并校验完成后更新。`;
    button.textContent = offlinePreparing ? '下载中…' : complete ? '继续准备' : '下载识别包';
    button.disabled = offlinePreparing;
    button.classList.toggle('hidden', offlineReady);
    document.getElementById('offlinePanel').classList.toggle('ready', offlineReady);
    document.getElementById('offlineAddress').textContent = '当前地址：' + location.origin + scope;
  } catch (error) {
    offlineReady = false;
    status.textContent = error.message || '离线包不可用，请检查浏览器存储权限';
    button.classList.remove('hidden');
  } finally { offlineChecking = false; }
}

async function registerSW() {
  await checkOfflinePack();
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    offlineRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const watch = () => {
      const worker = offlineRegistration.installing;
      if (worker) worker.addEventListener('statechange', () => {
        checkOfflinePack();
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        if (worker.state === 'redundant') document.getElementById('offlineStatus').textContent = '离线包准备未完成，请保持联网后重试';
      });
    };
    offlineRegistration.addEventListener('updatefound', watch);
    watch();
    if (offlineRegistration.waiting) showUpdate();
    await checkOfflinePack();
  } catch (_) {
    document.getElementById('offlineStatus').textContent = '离线安装未完成，联网后可重试';
  }
}

async function prepareOffline() {
  if (offlinePreparing) return;
  const button = document.getElementById('prepareOffline');
  button.disabled = true;
  try {
    if (!navigator.onLine) { showToast('请先联网准备离线包'); return; }
    if (navigator.storage?.persist) await navigator.storage.persist();
    await registerSW();
    if (!offlineRegistration?.active) { showToast('图片离线记录正在准备，请稍后再下载识别包'); return; }
    offlinePreparing = true;
    offlineRegistration.active.postMessage({ type: 'PREPARE_OCR' });
    document.querySelector('.offline-info').open = true;
    await checkOfflinePack();
  } catch (_) { showToast('准备失败，请检查网络和剩余空间'); }
  finally { button.disabled = offlinePreparing; }
}

function showUpdate() { document.getElementById('updateNotice').classList.remove('hidden'); }
function applyUpdate() {
  if (document.getElementById('modalOverlay').classList.contains('show') || capturedImage || document.getElementById('manualText').value.trim()) {
    showToast('请先保存当前题目，再更新'); return;
  }
  if (offlineRegistration?.waiting) {
    updateRequested = true;
    offlineRegistration.waiting.postMessage({ type: 'APPLY_UPDATE' });
  }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload(); else checkOfflinePack();
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (['OCR_READY', 'OCR_FAILED'].includes(event.data?.type)) {
      offlinePreparing = false;
      if (event.data.type === 'OCR_FAILED') showToast('识别包下载未完成，已下载部分保留，可稍后重试；图片仍可保存');
    }
    if (['OCR_PROGRESS', 'OCR_READY', 'OCR_FAILED'].includes(event.data?.type)) checkOfflinePack();
  });
}
window.addEventListener('online', checkOfflinePack);
window.addEventListener('offline', checkOfflinePack);
