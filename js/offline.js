let offlineRegistration = null;
let offlineReady = false;
let offlineChecking = false;
let updateRequested = false;

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
    let complete = 0;
    for (const file of OCR_PACK.files) {
      const response = await cache.match(new URL(file.path, location.href).href);
      if (response?.headers.get('X-OCR-SHA256') === file.sha256) complete++;
    }
    offlineReady = complete === OCR_PACK.files.length && !!navigator.serviceWorker.controller;
    status.textContent = offlineReady ? '离线识别已就绪' : `离线包 ${complete}/${OCR_PACK.files.length} · 请保持联网`;
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
  const button = document.getElementById('prepareOffline');
  button.disabled = true;
  try {
    if (!navigator.onLine) { showToast('请先联网准备离线包'); return; }
    if (navigator.storage?.persist) await navigator.storage.persist();
    await registerSW();
    if (offlineRegistration?.active) offlineRegistration.active.postMessage({ type: 'PREPARE_OCR' });
    if (offlineRegistration) await offlineRegistration.update();
  } catch (_) { showToast('准备失败，请检查网络和剩余空间'); }
  finally { button.disabled = false; }
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
    if (['OCR_PROGRESS', 'OCR_READY', 'OCR_FAILED'].includes(event.data?.type)) checkOfflinePack();
  });
}
window.addEventListener('online', checkOfflinePack);
window.addEventListener('offline', checkOfflinePack);
