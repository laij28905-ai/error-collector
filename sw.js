/* Cache boundaries are part of the offline data contract. */
importScripts('./ocr-assets.js');
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = 'tf-shell:' + SCOPE + ':';
const CACHE_NAME = PREFIX + 'organize-v1';
const OCR_CACHE = 'tf-ocr:' + SCOPE + ':' + OCR_PACK.version;
const APP_SHELL = ['./', './index.html', './app.html', './styles.css', './js/app.js',
  './js/reliability.js', './js/ai-client.js', './js/ocr-review.js', './js/offline.js', './js/album-enhance.js', './js/crop-enhance.js',
  './vendor/dexie.min.js', './manifest.json', './ocr-assets.js'];
const absolute = path => new URL(path, self.registration.scope).href;

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok || response.type === 'opaque') throw new Error('资源下载失败：' + url);
    const bytes = await response.arrayBuffer();
    return { response, bytes };
  } finally { clearTimeout(timer); }
}

async function prepareOcr() {
  const cache = await caches.open(OCR_CACHE);
  for (const file of OCR_PACK.files) {
    const url = absolute(file.path);
    const old = await cache.match(url);
    if (old?.headers.get('X-OCR-SHA256') === file.sha256) continue;
    const { response, bytes } = await download(file.url);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(n => n.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error('离线包校验失败');
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding'); headers.delete('Content-Length');
    headers.set('X-OCR-SHA256', hash);
    await cache.put(url, new Response(bytes, { headers }));
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'OCR_PROGRESS' }));
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const file of APP_SHELL) {
      const { response, bytes } = await download(absolute(file));
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding'); headers.delete('Content-Length');
      await cache.put(absolute(file), new Response(bytes, { headers }));
    }
    // Install the small application shell first. OCR is an explicit optional download.
    // Initial install activates normally. Updates wait for an explicit action.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
let ocrPreparation = null;
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: 'organize-v1' });
  if (event.data?.type === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'PREPARE_OCR') {
    if (!ocrPreparation) ocrPreparation = prepareOcr().finally(() => { ocrPreparation = null; });
    event.waitUntil(ocrPreparation.then(() => event.source?.postMessage({ type: 'OCR_READY' }))
      .catch(() => event.source?.postMessage({ type: 'OCR_FAILED' })));
  }
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const file = OCR_PACK.files.find(x => absolute(x.path) === url.origin + url.pathname);
    if (file) {
      const cached = await (await caches.open(OCR_CACHE)).match(absolute(file.path));
      if (cached?.headers.get('X-OCR-SHA256') === file.sha256) return cached;
      return new Response('OCR pack not installed', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
    const shell = await caches.open(CACHE_NAME);
    // Recovery page must always come from the network, never an old shell fallback.
    if (url.pathname === new URL('./update.html', self.registration.scope).pathname) {
      try { return await fetch(request, { cache: 'no-store' }); }
      catch (_) { return new Response('Please reconnect to update. Your saved questions remain on this device.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}); }
    }
    const cached = await shell.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const { response, bytes } = await download(request.url);
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding'); headers.delete('Content-Length');
      return new Response(bytes, { status: response.status, headers });
    } catch (_) {
      if (request.mode === 'navigate') return await shell.match(absolute('./app.html')) || Response.error();
      return new Response('Offline resource unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
