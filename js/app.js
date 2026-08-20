/* ============================================================
 * Team Future · 轻量化AI高中错题个性化学习助手 v2.0
 * ============================================================ */

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '政治', '地理'];

const KNOWLEDGE_MAP = {
  '数学': ['集合与逻辑', '函数与导数', '三角函数', '数列', '不等式', '平面向量', '复数', '立体几何', '解析几何', '概率与统计'],
  '语文': ['现代文阅读', '文言文阅读', '古诗词鉴赏', '语言文字运用', '写作'],
  '英语': ['阅读理解', '完形填空', '语法填空', '短文改错', '书面表达', '听力'],
  '物理': ['运动学', '力学', '牛顿定律', '曲线运动', '万有引力', '机械能', '动量', '静电场', '恒定电流', '磁场', '电磁感应', '热学', '光学'],
  '化学': ['化学计量', '离子反应', '氧化还原', '元素化合物', '物质结构', '化学反应速率', '化学平衡', '电解质溶液', '电化学', '有机化学', '实验化学'],
  '生物': ['细胞生物学', '遗传与进化', '稳态与调节', '生物与环境', '生物工程'],
  '历史': ['中国古代史', '中国近代史', '中国现代史', '世界古代史', '世界近代史', '世界现代史'],
  '政治': ['中国特色社会主义', '经济与社会', '政治与法治', '哲学与文化', '逻辑与思维'],
  '地理': ['自然地理', '人文地理', '区域地理', '地理信息技术']
};

const SUBJECT_CLASS = {
  '数学': 'subj-math', '语文': 'subj-chinese', '英语': 'subj-english',
  '物理': 'subj-physics', '化学': 'subj-chemistry', '生物': 'subj-biology',
  '历史': 'subj-history', '政治': 'subj-politics', '地理': 'subj-geography'
};

const SUBJECT_ICON = {
  '数学': '数', '语文': '语', '英语': '英', '物理': '物', '化学': '化',
  '生物': '生', '历史': '史', '政治': '政', '地理': '地'
};

const DEFAULT_SETTINGS = {
  subjects: ['数学', '物理', '化学', '生物', '英语'],
  aiEndpoint: 'https://api.openai.com/v1',
  aiModel: 'gpt-4o-mini',
  aiKey: '',
  ocrLang: 'chi_sim+eng',
  openCaptureOnLaunch: false,
  useAiOcr: false,
  ocrModel: 'gpt-4o-mini',
  syncToken: '',
  syncGistId: '',
  autoSync: false
};

const CAUSES = ['概念不清', '计算失误', '审题遗漏', '思路卡住', '时间不够', '其他'];
const INTERVALS = [1, 3, 7, 14, 30];
const LS_SETTINGS = 'tf-settings-v2';
const LS_ERRORS = 'tf-errors-v2';
const LS_STUDY_DAYS = 'tf-study-days-v2';

let db = null;
let useLocalFallback = false;
let allErrors = [];
let settings = Object.assign({}, DEFAULT_SETTINGS);
let currentPage = 'home';
let searchQuery = '';
let subjectFilter = 'all';
let statusFilter = 'all';
let capturedImage = null;
let cameraStream = null;
let videoEl = null;
let facingMode = 'environment';
let reviewQueue = [];
let reviewIndex = 0;
let reviewAnswerShown = false;
let editingId = null;
let currentDetailId = null;
let toastTimer = null;
let cropModalOpen = false;
let cropState = null;

/* ===================== 数据层 ===================== */

function lsLoadErrors() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_ERRORS) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function lsSaveErrors(arr) {
  localStorage.setItem(LS_ERRORS, JSON.stringify(arr));
}

async function initStorage() {
  try {
    if (typeof Dexie !== 'undefined') {
      db = new Dexie('TeamFutureErrorCollector');
      db.version(1).stores({
        errors: '++id, subject, status, nextReviewAt, createdAt'
      });
      return;
    }
  } catch (e) {
    console.warn('Dexie init failed', e);
  }
  useLocalFallback = true;
}

async function storeLoad() {
  if (db) {
    try {
      return await db.errors.orderBy('createdAt').reverse().toArray();
    } catch (e) {
      useLocalFallback = true;
    }
  }
  return lsLoadErrors().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function storeAdd(item) {
  if (db) return db.errors.add(item);
  const arr = lsLoadErrors();
  const maxId = arr.reduce((m, x) => Math.max(m, x.id || 0), 0);
  item.id = maxId + 1;
  arr.push(item);
  lsSaveErrors(arr);
  return item.id;
}

async function storeUpdate(id, changes) {
  if (db) {
    await db.errors.update(id, changes);
    return;
  }
  const arr = lsLoadErrors();
  const idx = arr.findIndex(x => x.id === id);
  if (idx >= 0) {
    arr[idx] = Object.assign({}, arr[idx], changes);
    lsSaveErrors(arr);
  }
}

async function storeDelete(id) {
  if (db) {
    await db.errors.delete(id);
    return;
  }
  lsSaveErrors(lsLoadErrors().filter(x => x.id !== id));
}

async function storeClear() {
  if (db) {
    await db.errors.clear();
    return;
  }
  lsSaveErrors([]);
}

async function storeBulkAdd(items) {
  if (db) {
    await db.errors.bulkAdd(items);
    return;
  }
  const arr = lsLoadErrors();
  arr.push(...items);
  lsSaveErrors(arr);
}

function loadSettings() {
  try {
    settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}'));
  } catch (e) {
    settings = Object.assign({}, DEFAULT_SETTINGS);
  }
}

function persistSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}

async function loadErrors() {
  allErrors = await storeLoad();
}

/* ===================== 初始化 ===================== */

document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  loadSettings();
  await loadErrors();
  fillSettingsForm();
  renderSubjectChips();
  renderStatusSeg();
  renderSubjectSettings();
  updateHome();
  updateNavBadge();
  const dueNow = allErrors.filter(e => e.status !== 'mastered' && (!e.nextReviewAt || new Date(e.nextReviewAt).getTime() <= Date.now())).length;
  if (dueNow > 0) setTimeout(() => showToast(`今天还有 ${dueNow} 道错题待复习`), 700);
  if (settings.autoSync && settings.syncToken && settings.syncGistId) {
    setTimeout(() => syncPull(true), 900);
  }
  bindEvents();
  registerSW();
  updateNet();
  applyInitialHash();
});

function bindEvents() {
  document.getElementById('fileInput').addEventListener('change', onFileSelected);
  document.getElementById('importInput').addEventListener('change', onImportSelected);
  window.addEventListener('paste', (e) => {
    if (currentPage !== 'capture') return;
    handleClipboardItems(e.clipboardData && e.clipboardData.items);
  });
  const overlay = document.getElementById('modalOverlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  window.addEventListener('hashchange', applyInitialHash);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function updateNet() {
  const badge = document.getElementById('netBadge');
  const online = navigator.onLine;
  badge.textContent = online ? '在线' : '离线';
  badge.classList.toggle('online', online);
  badge.classList.toggle('offline', !online);
}

/* ===================== 导航 ===================== */

function navigateTo(page) {
  if (page === currentPage) {
    if (page === 'review') initReview();
    return;
  }
  if (page !== 'capture' && cameraStream) stopCamera();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));

  const titles = { home: '错题助手', capture: '拍照录入', book: '错题本', review: '间隔复习', profile: '我的' };
  document.getElementById('headerTitle').textContent = titles[page] || '错题助手';
  document.getElementById('headerBack').classList.toggle('show', page === 'capture');

  currentPage = page;
  if (page === 'home') updateHome();
  if (page === 'book') renderErrorList();
  if (page === 'review') initReview();
  if (page === 'profile') {
    fillSettingsForm();
    renderSubjectSettings();
  }
  window.scrollTo({ top: 0 });
  if (location.hash !== '#' + page) {
    history.replaceState(null, '', '#' + page);
  }
}

function applyInitialHash() {
  const target = location.hash.replace('#', '');
  if (['home', 'capture', 'book', 'review', 'profile'].includes(target) && target !== currentPage) {
    return navigateTo(target);
  }
  if (settings.openCaptureOnLaunch) navigateTo('capture');
}

function goBack() {
  navigateTo('home');
}

function goCapture() {
  navigateTo('capture');
}

/* ===================== 首页 ===================== */

function setGreeting() {
  const h = new Date().getHours();
  const text = h < 6 ? '夜深了，也要早点休息' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  document.getElementById('homeGreeting').textContent = text + '，整理一道错题';
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
}

function updateHome() {
  setGreeting();
  updateStreak();
  const now = Date.now();
  const total = allErrors.length;
  const due = allErrors.filter(e => e.status !== 'mastered' && (!e.nextReviewAt || new Date(e.nextReviewAt).getTime() <= now)).length;
  const mastered = allErrors.filter(e => e.status === 'mastered').length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDue').textContent = due;
  document.getElementById('statMastered').textContent = mastered;
  renderWeakTopics();
  renderRecent();
}

function renderWeakTopics() {
  const container = document.getElementById('weakList');
  const counts = {};
  allErrors.forEach(e => {
    const key = e.topic || '未分类';
    counts[key] = (counts[key] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><div class="es-desc">录入错题后，这里会显示薄弱知识点</div></div>';
    return;
  }
  const max = Math.max(...top.map(x => x[1]));
  container.innerHTML = top.map(([name, count]) => `
    <div class="weak-item">
      <span class="weak-name">${escapeHtml(name)}</span>
      <div class="weak-bar"><i style="width:${Math.max(12, Math.round(count / max * 100))}%"></i></div>
      <span class="weak-count">${count}题</span>
    </div>
  `).join('');
}

function renderRecent() {
  const container = document.getElementById('recentList');
  if (allErrors.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:22px"><div class="es-desc">还没有错题，先拍一道吧</div></div>';
    return;
  }
  container.innerHTML = allErrors.slice(0, 4).map(e => `
    <button class="recent-item" onclick="openDetail(${e.id})">
      <span class="subject-avatar ${subjectClass(e.subject)}">${subjectIcon(e.subject)}</span>
      <span class="recent-info">
        <span class="recent-title">${escapeHtml(shortText(e.text, 24))}</span>
        <span class="recent-meta">${escapeHtml(e.subject)} · ${escapeHtml(e.topic || '未分类')}</span>
      </span>
      <span class="recent-time">${dateLabel(e.createdAt)}</span>
    </button>
  `).join('');
}

function updateNavBadge() {
  const now = Date.now();
  const due = allErrors.filter(e => e.status !== 'mastered' && (!e.nextReviewAt || new Date(e.nextReviewAt).getTime() <= now)).length;
  const badge = document.getElementById('navBadge');
  badge.textContent = due;
  badge.classList.toggle('hidden', due === 0);
}

function getStudyDays() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_STUDY_DAYS) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function updateStreak() {
  const badge = document.getElementById('streakBadge');
  if (!badge) return;
  badge.textContent = `🔥 ${getStreak()} 天`;
}

function getStreak() {
  const days = getStudyDays();
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  if (!days.includes(today) && !days.includes(yesterday)) {
    return 0;
  }
  let cursor = days.includes(today) ? today : yesterday;
  let streak = 0;
  while (days.includes(cursor)) {
    streak++;
    const prev = new Date(new Date(cursor + 'T00:00:00').getTime() - 86400000);
    cursor = dateKey(prev);
  }
  return streak;
}

function recordStudyDay() {
  const key = dateKey(new Date());
  const days = getStudyDays();
  if (!days.includes(key)) {
    days.push(key);
    localStorage.setItem(LS_STUDY_DAYS, JSON.stringify(days));
  }
  updateStreak();
}

function openWeeklyReport() {
  const weekStart = Date.now() - 6 * 86400000;
  const weekErrors = allErrors.filter(e => e.createdAt && new Date(e.createdAt).getTime() >= weekStart);
  const weekReviewed = allErrors.filter(e => e.lastReviewedAt && new Date(e.lastReviewedAt).getTime() >= weekStart).length;
  const weekMastered = allErrors.filter(e => e.status === 'mastered' && e.lastReviewedAt && new Date(e.lastReviewedAt).getTime() >= weekStart).length;
  const studyDays = getStudyDays().filter(k => k >= dateKey(new Date(weekStart))).length;

  const counts = {};
  weekErrors.forEach(e => {
    const key = e.topic || '未分类';
    counts[key] = (counts[key] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...top.map(x => x[1]));

  const weakRows = top.length
    ? top.map(([name, count]) => `
        <div class="report-row">
          <span>${escapeHtml(name)}</span>
          <div class="weak-bar"><i style="width:${Math.round(count / max * 100)}%"></i></div>
          <span class="weak-count">${count}题</span>
        </div>
      `).join('')
    : '<div class="report-note">本周还没有录入新错题</div>';

  const html = `
    <div class="report-block">
      <div class="report-row"><span>本周新增</span><div class="weak-bar"><i style="width:${Math.min(100, weekErrors.length * 10)}%"></i></div><span class="weak-count">${weekErrors.length}</span></div>
      <div class="report-row"><span>本周复习</span><div class="weak-bar"><i style="width:${Math.min(100, weekReviewed * 10)}%"></i></div><span class="weak-count">${weekReviewed}</span></div>
      <div class="report-row"><span>本周掌握</span><div class="weak-bar"><i style="width:${Math.min(100, weekMastered * 10)}%"></i></div><span class="weak-count">${weekMastered}</span></div>
      <div class="report-row"><span>学习天数</span><div class="weak-bar"><i style="width:${Math.min(100, studyDays * 15)}%"></i></div><span class="weak-count">${studyDays}天</span></div>
    </div>
    <div class="section-title" style="margin-top:16px"><span>本周新增知识点</span></div>
    <div class="report-block">${weakRows}</div>
    <div class="report-note">坚持每天复习，错题会慢慢变成你的提分资产。</div>
  `;
  openModal('本周学习报告', html);
}

/* ===================== 录入 / 拍照 ===================== */

async function startCamera() {
  const preview = document.getElementById('capturePreview');
  preview.innerHTML = '<video id="videoEl" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>';
  videoEl = document.getElementById('videoEl');
  const btn = document.getElementById('btnCamera');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1440 } }
    });
    videoEl.srcObject = cameraStream;
    btn.textContent = '📸 拍照';
    btn.onclick = takePhoto;
    document.getElementById('btnAlbum').classList.add('hidden');
  } catch (err) {
    if (facingMode === 'environment') {
      facingMode = 'user';
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl.srcObject = cameraStream;
        btn.textContent = '📸 拍照';
        btn.onclick = takePhoto;
        return;
      } catch (e2) {}
    }
    preview.innerHTML = '<div class="placeholder"><div class="pl-icon">📷</div><div class="pl-text">打不开相机，请选择相册图片</div></div>';
    showToast('打不开相机，试试相册');
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  videoEl = null;
}

function takePhoto() {
  if (!videoEl) return;
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth || 1280;
  canvas.height = videoEl.videoHeight || 960;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  capturedImage = canvas.toDataURL('image/jpeg', 0.85);
  stopCamera();
  showCapturedImage();
}

function uploadImage() {
  document.getElementById('fileInput').click();
}

function onFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  readFileAsImage(file);
  event.target.value = '';
}

function readFileAsImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    capturedImage = e.target.result;
    showCapturedImage();
  };
  reader.readAsDataURL(file);
}

function showCapturedImage() {
  document.getElementById('capturePreview').innerHTML = `<img src="${capturedImage}" alt="错题图片">`;
  document.getElementById('btnCamera').textContent = '📸 拍照';
  document.getElementById('btnCamera').onclick = startCamera;
  document.getElementById('btnAlbum').classList.remove('hidden');
  document.getElementById('btnCrop').classList.remove('hidden');
  document.getElementById('btnOcr').classList.remove('hidden');
  document.getElementById('btnRetake').classList.remove('hidden');
}

function retakeCapture() {
  capturedImage = null;
  stopCamera();
  document.getElementById('capturePreview').innerHTML = '<div class="placeholder"><div class="pl-icon">📷</div><div class="pl-text">拍照或选择图片</div></div>';
  document.getElementById('btnCamera').textContent = '📸 拍照';
  document.getElementById('btnCamera').onclick = startCamera;
  document.getElementById('btnCrop').classList.add('hidden');
  document.getElementById('btnOcr').classList.add('hidden');
  document.getElementById('btnRetake').classList.add('hidden');
  document.getElementById('manualEntry').classList.add('hidden');
}

async function pasteClipboardImage() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      await handleClipboardItems(items);
    } else {
      showToast('当前浏览器不支持读取剪贴板，请用相册');
    }
  } catch (err) {
    showToast('无法读取剪贴板，请用相册');
  }
}

async function handleClipboardItems(items) {
  if (!items) return;
  for (const item of Array.from(items)) {
    if (item.getAsFile) {
      const file = item.getAsFile();
      if (file && file.type && file.type.startsWith('image/')) {
        readFileAsImage(file);
        return;
      }
    }
    if (item.types && item.getType) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          if (blob) {
            readFileAsImage(blob);
            return;
          }
        }
      }
    }
  }
  showToast('剪贴板里没有图片');
}

function openCropModal() {
  if (!capturedImage) return;
  cropModalOpen = true;
  openModal('裁剪与校正', `
    <div class="crop-stage" id="cropStage">
      <img id="cropImg" src="${capturedImage}" alt="裁剪区域">
      <div class="crop-frame"></div>
    </div>
    <div class="crop-tools">
      <button class="btn" onclick="rotateCaptured('left')">&#8630; 左转</button>
      <button class="btn" onclick="rotateCaptured('right')">&#8631; 右转</button>
    </div>
    <div class="crop-tools">
      <span class="field-label" style="margin:0">缩放</span>
      <div class="crop-zoom"><input id="cropZoom" type="range" min="1" max="3" step="0.05" value="1" oninput="onCropZoom(this.value)"></div>
      <button class="btn teal" onclick="applyCrop()">完成</button>
    </div>
  `);
  setupCropDrag();
}

function setupCropDrag() {
  const stage = document.getElementById('cropStage');
  const img = document.getElementById('cropImg');
  if (!stage || !img) return;

  const stageW = stage.clientWidth;
  const stageH = stage.clientHeight;
  img.onload = () => {
    const naturalW = img.naturalWidth || stageW;
    const naturalH = img.naturalHeight || stageH;
    const baseScale = Math.max(stageW / naturalW, stageH / naturalH);
    cropState = {
      naturalW,
      naturalH,
      baseScale,
      zoom: 1,
      offX: 0,
      offY: 0,
      stageW,
      stageH
    };
    const dispW = naturalW * baseScale;
    const dispH = naturalH * baseScale;
    cropState.offX = (stageW - dispW) / 2;
    cropState.offY = (stageH - dispH) / 2;
    applyCropTransform();
    bindCropDrag();
  };
  if (img.complete) img.onload();
}

function applyCropTransform() {
  const st = cropState;
  const img = document.getElementById('cropImg');
  if (!st || !img) return;
  const scale = st.baseScale * st.zoom;
  img.style.width = Math.round(st.naturalW * scale) + 'px';
  img.style.height = Math.round(st.naturalH * scale) + 'px';
  img.style.left = Math.round(st.offX) + 'px';
  img.style.top = Math.round(st.offY) + 'px';
}

function bindCropDrag() {
  const stage = document.getElementById('cropStage');
  const img = document.getElementById('cropImg');
  if (!stage || !img) return;
  let startX = 0;
  let startY = 0;
  let startOffX = 0;
  let startOffY = 0;
  let dragging = false;

  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startOffX = cropState.offX;
    startOffY = cropState.offY;
    img.style.cursor = 'grabbing';
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cropState.offX = startOffX + (e.clientX - startX);
    cropState.offY = startOffY + (e.clientY - startY);
    clampCropOffset();
    applyCropTransform();
  });

  const stop = () => {
    dragging = false;
    img.style.cursor = 'grab';
  };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
}

function clampCropOffset() {
  const st = cropState;
  if (!st) return;
  const scale = st.baseScale * st.zoom;
  const dispW = st.naturalW * scale;
  const dispH = st.naturalH * scale;
  const frameX = st.stageW * 0.11;
  const frameY = st.stageH * 0.17;
  const frameW = st.stageW * 0.78;
  const frameH = st.stageH * 0.66;
  st.offX = Math.min(frameX, Math.max(frameX + frameW - dispW, st.offX));
  st.offY = Math.min(frameY, Math.max(frameY + frameH - dispH, st.offY));
}

function onCropZoom(value) {
  if (!cropState) return;
  const next = Number(value);
  const ratio = next / cropState.zoom;
  cropState.zoom = next;
  const frameX = cropState.stageW * 0.11;
  const frameY = cropState.stageH * 0.17;
  cropState.offX = frameX - (frameX - cropState.offX) * ratio;
  cropState.offY = frameY - (frameY - cropState.offY) * ratio;
  clampCropOffset();
  applyCropTransform();
}

function rotateCaptured(direction) {
  if (!capturedImage) return;
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = h;
    canvas.height = w;
    const ctx = canvas.getContext('2d');
    ctx.translate(h / 2, w / 2);
    ctx.rotate(direction === 'left' ? -Math.PI / 2 : Math.PI / 2);
    ctx.drawImage(img, -w / 2, -h / 2);
    capturedImage = canvas.toDataURL('image/jpeg', 0.92);
    const cropImg = document.getElementById('cropImg');
    if (cropModalOpen && cropImg) {
      cropImg.src = capturedImage;
      setupCropDrag();
    }
  };
  img.src = capturedImage;
}

function applyCrop() {
  const st = cropState;
  const img = document.getElementById('cropImg');
  if (!st || !img) return;
  const scale = st.baseScale * st.zoom;
  const frameX = st.stageW * 0.11;
  const frameY = st.stageH * 0.17;
  const frameW = st.stageW * 0.78;
  const frameH = st.stageH * 0.66;
  const srcX = (frameX - st.offX) / scale;
  const srcY = (frameY - st.offY) / scale;
  const srcW = frameW / scale;
  const srcH = frameH / scale;
  const outW = Math.max(600, Math.round(frameW * 2));
  const outH = Math.max(450, Math.round(outW * srcH / srcW));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  canvas.getContext('2d').drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
  capturedImage = canvas.toDataURL('image/jpeg', 0.92);
  cropModalOpen = false;
  cropState = null;
  closeModal();
  showCapturedImage();
  showToast('裁剪完成');
}

/* ===================== OCR ===================== */

function loadScript(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  function tryLoad(i) {
    if (i >= list.length) return Promise.reject(new Error('所有 CDN 均加载失败'));
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = list[i];
      s.onload = resolve;
      s.onerror = () => reject(new Error('加载失败'));
      document.head.appendChild(s);
    }).catch(() => tryLoad(i + 1));
  }
  return tryLoad(0);
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return loadScript([
    'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js'
  ]);
}

async function runOcr() {
  if (!capturedImage) {
    showToast('请先拍照或选择图片');
    return;
  }

  const canUseAi = settings.aiEndpoint && (settings.aiKey || /localhost|127\.0\.0\.1/.test(settings.aiEndpoint));
  if (settings.useAiOcr && canUseAi) {
    showProcessing('AI 视觉识别中', '正在分析图片文字');
    try {
      const aiText = await callVisionOcr(capturedImage);
      if (aiText) {
        hideProcessing();
        openSaveModal(aiText, guessSubject(aiText));
        return;
      }
      showToast('AI 未识别到文字，改用本地 OCR');
    } catch (err) {
      console.warn('AI OCR failed', err);
      showToast('AI 识别失败，改用本地 OCR');
    }
  }

  await runTesseractOcr();
}

async function callVisionOcr(dataUrl) {
  const base = String(settings.aiEndpoint || '').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (settings.aiKey) headers['Authorization'] = 'Bearer ' + settings.aiKey;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.ocrModel || settings.aiModel || DEFAULT_SETTINGS.ocrModel,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别这张高中错题图片中的全部题目文字。只输出识别到的文字，不要解释，不要添加答案。'
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ]
    })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return String(content || '').trim();
}

async function runTesseractOcr() {
  showProcessing('OCR 识别中', '首次使用需加载识别引擎');
  try {
    await loadTesseract();
    updateProcessing('识别文字中...', '');
    const result = await Tesseract.recognize(capturedImage, settings.ocrLang || 'chi_sim+eng', {
      logger: (m) => {
        const pct = m.progress ? Math.round(m.progress * 100) + '%' : '';
        if (m.status === 'loading tesseract core') updateProcessing('加载核心引擎...', pct);
        if (m.status === 'loading language traineddata') updateProcessing('下载语言包...', pct);
        if (m.status === 'recognizing text') updateProcessing('正在识别...', pct);
      }
    });
    hideProcessing();
    const text = (result.data.text || '').trim();
    if (!text) {
      showToast('未识别到文字，请手动输入');
      showManualEntry();
      return;
    }
    openSaveModal(text, guessSubject(text));
  } catch (err) {
    hideProcessing();
    showToast('OCR 失败：' + err.message);
    showManualEntry();
  }
}

function showManualEntry() {
  const el = document.getElementById('manualEntry');
  el.classList.remove('hidden');
  document.getElementById('manualText').focus();
}

function saveManualEntry() {
  const text = document.getElementById('manualText').value.trim();
  if (!text) {
    showToast('请输入题目内容');
    return;
  }
  openSaveModal(text, guessSubject(text));
}

function guessSubject(text) {
  const rules = {
    '数学': /函数|方程|导数|数列|三角|向量|不等式|概率|统计|几何|集合|复数|排列|组合|\bx\b|\by\b/i,
    '物理': /牛顿|力学|电场|磁场|电路|能量|动量|速度|加速度|摩擦力|浮力|压强|欧姆|电磁/i,
    '化学': /离子|氧化|还原|反应|溶液|浓度|摩尔|化合|分解|置换|有机|元素|原子|分子|化学键/i,
    '生物': /细胞|基因|遗传|DNA|RNA|染色体|光合|呼吸|生态|进化|酶|激素|免疫|神经/i,
    '英语': /read|write|listen|speak|grammar|vocabulary|translate|comprehension|essay/i,
    '语文': /阅读|写作|古诗|文言|成语|修辞|标点|病句|字音|字形/i,
    '历史': /朝代|革命|战争|封建|帝国|共和|民主|专制|改革|变法/i,
    '政治': /经济|政治|哲学|文化|法治|民主|市场|政府|制度|权利|义务/i,
    '地理': /气候|地形|河流|人口|城市|农业|工业|交通|板块|洋流|经纬/i
  };
  let best = '';
  let bestScore = 0;
  for (const [subject, re] of Object.entries(rules)) {
    const score = (text.match(new RegExp(re.source, 'g')) || []).length;
    if (score > bestScore) {
      bestScore = score;
      best = subject;
    }
  }
  return best;
}

/* ===================== 保存 / 编辑 ===================== */

function openSaveModal(text, guessedSubject) {
  editingId = null;
  const subject = guessedSubject || settings.subjects[0] || '数学';
  const topics = KNOWLEDGE_MAP[subject] || [];
  const html = `
    <div class="form-stack">
      <div>
        <label class="field-label">题目内容</label>
        <textarea id="formText" rows="6">${escapeHtml(text)}</textarea>
      </div>
      <div>
        <label class="field-label">科目</label>
        <select id="formSubject" onchange="fillTopicSelect(this.value)">
          ${SUBJECTS.map(s => `<option value="${s}" ${s === subject ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label">知识点</label>
        <select id="formTopic">
          <option value="">选择知识点</option>
          ${topics.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label">错因</label>
        <select id="formCause">
          ${CAUSES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label">答案 / 解析（选填）</label>
        <textarea id="formAnswer" rows="3" placeholder="记录正确答案或解题思路"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn outline" onclick="closeModal()">取消</button>
        <button class="btn primary" onclick="submitSaveForm()">保存错题</button>
      </div>
    </div>
  `;
  openModal('保存错题', html);
}

function fillTopicSelect(subject) {
  const topics = KNOWLEDGE_MAP[subject] || [];
  document.getElementById('formTopic').innerHTML = '<option value="">选择知识点</option>' +
    topics.map(t => `<option value="${t}">${t}</option>`).join('');
}

async function submitSaveForm() {
  const text = document.getElementById('formText').value.trim();
  const subject = document.getElementById('formSubject').value;
  const topic = document.getElementById('formTopic').value;
  const cause = document.getElementById('formCause').value || CAUSES[0];
  const answer = document.getElementById('formAnswer').value.trim();
  if (!text) {
    showToast('请输入题目内容');
    return;
  }
  const now = new Date().toISOString();
  if (editingId) {
    await storeUpdate(editingId, {
      text, subject, topic: topic || '未分类', cause, answer,
      updatedAt: now
    });
    const target = allErrors.find(e => e.id === editingId);
    if (target) Object.assign(target, { text, subject, topic: topic || '未分类', cause, answer, updatedAt: now });
    showToast('已更新');
  } else {
    const item = {
      subject,
      topic: topic || '未分类',
      cause,
      text,
      answer,
      image: capturedImage || '',
      status: 'new',
      reviewCount: 0,
      nextReviewAt: null,
      lastReviewedAt: null,
      analysis: null,
      source: capturedImage ? 'camera' : 'manual',
      createdAt: now,
      updatedAt: now
    };
    await storeAdd(item);
    allErrors.unshift(item);
    capturedImage = null;
    retakeCapture();
    showToast('错题已保存');
  }
  closeModal();
  updateHome();
  updateNavBadge();
  renderErrorList();
  document.getElementById('manualText').value = '';
  document.getElementById('manualEntry').classList.add('hidden');
}

function openEditModal(id) {
  const e = findError(id);
  if (!e) return;
  editingId = id;
  const topics = KNOWLEDGE_MAP[e.subject] || [];
  const html = `
    <div class="form-stack">
      <div>
        <label class="field-label">题目内容</label>
        <textarea id="formText" rows="6">${escapeHtml(e.text)}</textarea>
      </div>
      <div>
        <label class="field-label">科目</label>
        <select id="formSubject" onchange="fillTopicSelect(this.value)">
          ${SUBJECTS.map(s => `<option value="${s}" ${s === e.subject ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label">知识点</label>
        <select id="formTopic">
          <option value="">选择知识点</option>
          ${topics.map(t => `<option value="${t}" ${t === e.topic ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label">错因</label>
        <select id="formCause">
          ${CAUSES.map(c => `<option value="${c}" ${c === (e.cause || '概念不清') ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label">答案 / 解析</label>
        <textarea id="formAnswer" rows="3">${escapeHtml(e.answer || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn outline" onclick="closeModal()">取消</button>
        <button class="btn primary" onclick="submitSaveForm()">保存修改</button>
      </div>
    </div>
  `;
  openModal('编辑错题', html);
}

/* ===================== 错题本 ===================== */

function renderSubjectChips() {
  const container = document.getElementById('subjectChips');
  container.innerHTML = '<button class="chip ' + (subjectFilter === 'all' ? 'active' : '') + '" onclick="setSubjectFilter(\'all\')">全部</button>' +
    settings.subjects.map(s => `<button class="chip ${subjectFilter === s ? 'active' : ''}" onclick="setSubjectFilter('${s}')">${s}</button>`).join('');
}

function setSubjectFilter(subject) {
  subjectFilter = subject;
  renderSubjectChips();
  renderErrorList();
}

function setQuery(value) {
  searchQuery = value.trim().toLowerCase();
  renderErrorList();
}

function renderStatusSeg() {
  const map = { all: '全部', pending: '待复习', mastered: '已掌握' };
  document.getElementById('statusSeg').innerHTML = Object.entries(map).map(([key, label]) =>
    `<button class="seg-btn ${statusFilter === key ? 'active' : ''}" onclick="setStatusFilter('${key}')">${label}</button>`
  ).join('');
}

function setStatusFilter(status) {
  statusFilter = status;
  renderStatusSeg();
  renderErrorList();
}

function getFilteredErrors() {
  const now = Date.now();
  return allErrors.filter(e => {
    if (subjectFilter !== 'all' && e.subject !== subjectFilter) return false;
    if (statusFilter === 'pending' && e.status === 'mastered') return false;
    if (statusFilter === 'mastered' && e.status !== 'mastered') return false;
    if (searchQuery) {
      const hay = (e.text + ' ' + (e.topic || '') + ' ' + (e.answer || '') + ' ' + e.subject).toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

function renderErrorList() {
  const container = document.getElementById('errorList');
  const filtered = getFilteredErrors();
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><div class="es-title">没有匹配的错题</div><div class="es-desc">换个筛选条件，或去录入一道新错题</div></div>';
    return;
  }
  container.innerHTML = filtered.map(e => {
    const statusTag = e.status === 'mastered'
      ? '<span class="tag mastered">已掌握</span>'
      : e.status === 'reviewing'
        ? '<span class="tag due">待复习</span>'
        : '<span class="tag due">待复盘</span>';
    const aiTag = e.analysis ? '<span class="tag ai">AI</span>' : '';
    const causeTag = `<span class="tag">${escapeHtml(e.cause || '未标注错因')}</span>`;
    return `
      <button class="error-card" onclick="openDetail(${e.id})">
        <div class="ec-head">
          <span class="subject-avatar ${subjectClass(e.subject)}">${subjectIcon(e.subject)}</span>
          <span class="ec-info">
            <span class="ec-topic">${escapeHtml(e.topic || '未分类')}</span>
            <span class="ec-date">${dateLabel(e.createdAt)} · ${escapeHtml(e.subject)}</span>
          </span>
        </div>
        <div class="ec-preview">${escapeHtml(e.text)}</div>
        <div class="ec-tags">${statusTag}${causeTag}${aiTag}</div>
      </button>
    `;
  }).join('');
}

/* ===================== 详情 ===================== */

function openDetail(id) {
  const e = findError(id);
  if (!e) return;
  currentDetailId = id;
  const statusText = e.status === 'mastered' ? '已掌握' : e.status === 'reviewing' ? '待复习' : '待复盘';
  const analysisBlock = e.analysis
    ? `
      <div class="modal-content-block">
        <div class="section-title"><span>AI 复盘</span><button class="text-btn" onclick="generateAnalysis(${e.id}, true)">重新生成</button></div>
        <div class="analysis-block">${escapeHtml(e.analysis.analysis || '')}</div>
      </div>
      <div class="modal-content-block">
        <div class="section-title"><span>解题步骤</span></div>
        <div class="modal-text">${escapeHtml(e.analysis.solution || '')}</div>
      </div>
      ${renderSimilar(e)}
      <div class="modal-content-block">
        <div class="section-title"><span>复习建议</span></div>
        <div class="modal-text">${escapeHtml(e.analysis.advice || '')}</div>
      </div>
    `
    : `
      <div class="modal-content-block">
        <div class="section-title"><span>AI 复盘</span></div>
        <button class="btn teal full" onclick="generateAnalysis(${e.id}, false)">生成 AI 复盘</button>
      </div>
    `;

  const html = `
    <div class="modal-content-block">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="subject-avatar ${subjectClass(e.subject)}">${subjectIcon(e.subject)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${escapeHtml(e.subject)} · ${escapeHtml(e.topic || '未分类')}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${dateLabel(e.createdAt)} · ${statusText} · 错因：${escapeHtml(e.cause || '未标注')}</div>
        </div>
      </div>
    </div>
    ${e.image ? `<div class="modal-content-block"><img class="detail-img" src="${e.image}" alt="错题图片"></div>` : ''}
    <div class="modal-content-block">
      <div class="section-title"><span>题目</span></div>
      <div class="modal-text">${escapeHtml(e.text)}</div>
    </div>
    ${e.answer ? `
      <div class="modal-content-block">
        <div class="section-title"><span>答案 / 解析</span></div>
        <div class="modal-text">${escapeHtml(e.answer)}</div>
      </div>
    ` : ''}
    ${e.lastAttempt ? `
      <div class="modal-content-block">
        <div class="section-title"><span>最近自测作答</span></div>
        <div class="modal-text">${escapeHtml(e.lastAttempt)}</div>
      </div>
    ` : ''}
    ${analysisBlock}
    <div class="modal-actions">
      <button class="btn outline" onclick="openEditModal(${e.id})">编辑</button>
      <button class="btn red" onclick="deleteError(${e.id})">删除</button>
      <button class="btn primary full" onclick="closeModal()">完成</button>
    </div>
  `;
  openModal('错题详情', html);
}

function renderSimilar(e) {
  const list = e.analysis && e.analysis.similar;
  if (!Array.isArray(list) || list.length === 0) return '';
  const done = e.analysis.similarDone || [];
  return `
    <div class="modal-content-block">
      <div class="section-title"><span>举一反三</span></div>
      <div class="similar-list">
        ${list.map((q, i) => `
          <button class="similar-item ${done.includes(i) ? 'done' : ''}" onclick="toggleSimilar(${e.id}, ${i})">
            <span class="similar-check">${done.includes(i) ? '✓' : ''}</span>
            <span>${escapeHtml(q)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function toggleSimilar(id, index) {
  const e = findError(id);
  if (!e || !e.analysis) return;
  const done = e.analysis.similarDone || [];
  const next = done.includes(index) ? done.filter(x => x !== index) : [...done, index];
  e.analysis.similarDone = next;
  await storeUpdate(id, { analysis: e.analysis });
  openDetail(id);
}

async function deleteError(id) {
  if (!confirm('确定要删除这条错题吗？此操作不可恢复。')) return;
  await storeDelete(id);
  await loadErrors();
  closeModal();
  updateHome();
  updateNavBadge();
  renderErrorList();
  showToast('已删除');
}

/* ===================== AI 复盘 ===================== */

async function generateAnalysis(id, force) {
  const e = findError(id);
  if (!e) return;
  if (!force && e.analysis) {
    openDetail(id);
    return;
  }
  showProcessing('AI 复盘生成中', '正在分析错因并生成练习建议');
  let result = null;
  let aiFailed = false;
  try {
    if (settings.aiEndpoint && (settings.aiKey || /localhost|127\.0\.0\.1/.test(settings.aiEndpoint))) {
      result = await callAi(e);
    }
  } catch (err) {
    console.warn('AI call failed', err);
    aiFailed = true;
  }
  if (!result) {
    result = localAnalysis(e);
    showToast(aiFailed ? 'AI 调用失败，已使用离线模板' : '未配置 AI，已使用离线模板');
  }
  result.source = result.source || (aiFailed ? 'template' : 'ai');
  result.generatedAt = new Date().toISOString();
  await storeUpdate(id, { analysis: result, updatedAt: new Date().toISOString() });
  e.analysis = result;
  hideProcessing();
  updateHome();
  renderErrorList();
  openDetail(id);
}

async function callAi(e) {
  const base = String(settings.aiEndpoint || '').replace(/\/+$/, '');
  const messages = [
    {
      role: 'system',
      content: '你是高中错题辅导老师。根据题目给出中文 JSON，字段为 analysis（错因分析，150字内）、solution（分步骤解题思路）、similar（3道相似练习题，每题一句）、advice（复习安排建议）。只返回 JSON 对象。'
    },
    {
      role: 'user',
      content: `学科：${e.subject}\n知识点：${e.topic || '未分类'}\n错因：${e.cause || '未标注'}\n题目：${e.text}\n${e.answer ? '已知答案/解析：' + e.answer : '暂未记录答案'}`
    }
  ];
  const headers = { 'Content-Type': 'application/json' };
  if (settings.aiKey) headers['Authorization'] = 'Bearer ' + settings.aiKey;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.aiModel || DEFAULT_SETTINGS.aiModel,
      temperature: 0.3,
      messages
    })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return normalizeAiResult(extractJson(content));
}

function extractJson(text) {
  let t = String(text || '').replace(/```json|```/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI 返回格式错误');
  return JSON.parse(t.slice(start, end + 1));
}

function normalizeAiResult(obj) {
  return {
    analysis: String(obj.analysis || ''),
    solution: String(obj.solution || ''),
    similar: Array.isArray(obj.similar) ? obj.similar.slice(0, 5).map(String) : [],
    advice: String(obj.advice || ''),
    source: 'ai'
  };
}

function localAnalysis(e) {
  const similar = makeSimilarQuestions(e);
  const causeAdvice = {
    '概念不清': '先回到课本，把概念、公式和适用条件写一遍，再用自己的话解释。',
    '计算失误': '重做时放慢计算步骤，把每一步写完整，最后用代入法或估算检查结果。',
    '审题遗漏': '圈出所有已知条件和问题，读题后先把信息复述一遍再动笔。',
    '思路卡住': '先写出能联想到的公式或方法，再尝试从结论反推需要的条件。',
    '时间不够': '做限时训练，先做有把握的题，把这类题安排到专项练习中。',
    '其他': '把错误过程与标准过程逐行对比，找出偏差最大的环节。'
  }[e.cause] || '先定位错因，再针对薄弱环节做专项训练。';
  return {
    analysis: `本题对应「${e.topic || '未分类'}」${e.subject}知识点，错因标记为「${e.cause || '未标注'}」。${causeAdvice}再把题目条件与课本公式、方法逐条对应。`,
    solution: e.answer || '暂未记录答案。建议补充标准答案，或按“已知条件 → 对应公式/方法 → 分步计算 → 检查单位与结论”的方式写出完整过程。',
    similar,
    advice: '今天订正，明天重做一道类似题，三天后再次复习该知识点。',
    source: 'template'
  };
}

function makeSimilarQuestions(e) {
  const subject = e.subject;
  if (subject === '数学') return ['已知函数 f(x)=x^2-2x，求单调区间。', '解方程 x^2-5x+6=0。', '数列 a(n+1)=a(n)+3，求第 10 项。'];
  if (subject === '物理') return ['已知初速度和加速度，求 5 秒后的速度。', '分析斜面上物体的受力。', '已知电压和电阻，求电流。'];
  if (subject === '英语') return ['根据上下文判断作者观点。', '选择正确时态完成句子。', '猜测划线单词的含义。'];
  if (subject === '化学') return ['写出铁与稀盐酸反应的化学方程式。', '判断氧化还原反应中的氧化剂。', '计算 0.1 mol 溶液的物质的量浓度。'];
  if (subject === '生物') return ['简述光合作用中暗反应的原料和产物。', '判断遗传系谱图的显隐性。', '说明酶催化作用的三个特点。'];
  return ['提取题干关键信息并写出思路。', '改变一个条件后重新求解。', '说明最容易出错的一步。'];
}

/* ===================== 间隔复习 ===================== */

function initReview() {
  const now = Date.now();
  reviewQueue = allErrors.filter(e =>
    e.status !== 'mastered' && (!e.nextReviewAt || new Date(e.nextReviewAt).getTime() <= now)
  );
  reviewQueue.sort((a, b) => {
    const da = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() : 0;
    const db = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() : 0;
    return da - db;
  });
  reviewIndex = 0;
  reviewAnswerShown = false;

  if (reviewQueue.length === 0) {
    document.getElementById('reviewCard').classList.add('hidden');
    document.getElementById('reviewActions').classList.add('hidden');
    document.getElementById('reviewProgress').classList.add('hidden');
    document.getElementById('reviewEmpty').classList.remove('hidden');
    document.getElementById('reviewStatus').textContent = '所有错题都已掌握，或今天没有到期任务';
    return;
  }

  document.getElementById('reviewEmpty').classList.add('hidden');
  document.getElementById('reviewCard').classList.remove('hidden');
  document.getElementById('reviewActions').classList.remove('hidden');
  document.getElementById('reviewProgress').classList.remove('hidden');
  document.getElementById('reviewStatus').textContent = `共 ${reviewQueue.length} 道错题待复习`;
  showReviewItem();
}

function showReviewItem() {
  if (reviewIndex >= reviewQueue.length) {
    showToast('本轮复习完成');
    initReview();
    return;
  }
  const item = reviewQueue[reviewIndex];
  document.getElementById('reviewSubject').textContent = item.subject;
  document.getElementById('reviewSubject').className = 'subject-pill ' + subjectClass(item.subject);
  document.getElementById('reviewMeta').textContent = `${item.topic || '未分类'} · ${item.cause || '未标注错因'}`;
  document.getElementById('reviewQuestion').textContent = item.text;
  const draftEl = document.getElementById('reviewDraft');
  if (draftEl) draftEl.value = '';
  document.getElementById('reviewAnswerText').textContent = item.answer || '未记录解析';
  document.getElementById('reviewAnswer').classList.add('hidden');
  reviewAnswerShown = false;

  const imgWrap = document.getElementById('reviewImage');
  if (item.image) {
    imgWrap.innerHTML = `<img src="${item.image}" alt="错题图片">`;
    imgWrap.classList.remove('hidden');
  } else {
    imgWrap.classList.add('hidden');
  }

  document.getElementById('reviewFill').style.width = (reviewIndex / reviewQueue.length * 100) + '%';
  document.getElementById('reviewCount').textContent = `${reviewIndex + 1}/${reviewQueue.length}`;
}

function toggleReviewAnswer() {
  const el = document.getElementById('reviewAnswer');
  reviewAnswerShown = !reviewAnswerShown;
  el.classList.toggle('hidden', !reviewAnswerShown);
}

async function rateReview(grade) {
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  const draft = document.getElementById('reviewDraft').value.trim();
  const now = new Date();
  let interval = 1;

  if (grade === 'again') {
    item.reviewCount = Math.max(0, (item.reviewCount || 0) - 1);
    item.status = 'reviewing';
  } else {
    const count = (item.reviewCount || 0) + 1;
    const idx = Math.min(count - 1, INTERVALS.length - 1);
    interval = INTERVALS[idx];
    if (grade === 'easy') interval = interval * 2;
    item.reviewCount = count;
    item.status = count >= INTERVALS.length ? 'mastered' : 'reviewing';
  }

  item.lastReviewedAt = now.toISOString();
  item.lastAttempt = draft;
  if (item.status === 'mastered') {
    item.nextReviewAt = null;
  } else {
    item.nextReviewAt = new Date(now.getTime() + interval * 86400000).toISOString();
  }

  await storeUpdate(item.id, {
    status: item.status,
    reviewCount: item.reviewCount,
    nextReviewAt: item.nextReviewAt,
    lastReviewedAt: item.lastReviewedAt,
    lastAttempt: draft,
    updatedAt: now.toISOString()
  });
  recordStudyDay();
  reviewIndex++;
  updateHome();
  updateNavBadge();
  showReviewItem();
}

/* ===================== 设置 ===================== */

function renderSubjectSettings() {
  const container = document.getElementById('subjectSettings');
  container.innerHTML = SUBJECTS.map(s =>
    `<button class="chip ${settings.subjects.includes(s) ? 'active' : ''}" onclick="toggleSubjectSetting('${s}')">${s}</button>`
  ).join('');
}

function toggleSubjectSetting(subject) {
  const idx = settings.subjects.indexOf(subject);
  if (idx >= 0) {
    settings.subjects.splice(idx, 1);
  } else {
    settings.subjects.push(subject);
  }
  persistSettings();
  renderSubjectSettings();
  renderSubjectChips();
  showToast('科目设置已更新');
}

function saveSettings() {
  settings.aiEndpoint = document.getElementById('aiEndpoint').value.trim();
  settings.aiModel = document.getElementById('aiModel').value.trim();
  settings.aiKey = document.getElementById('aiKey').value.trim();
  settings.useAiOcr = document.getElementById('useAiOcr').checked;
  settings.ocrModel = document.getElementById('ocrModel').value.trim();
  settings.openCaptureOnLaunch = document.getElementById('openCaptureOnLaunch').checked;
  settings.syncToken = document.getElementById('syncToken').value.trim();
  settings.syncGistId = document.getElementById('syncGistId').value.trim();
  settings.autoSync = document.getElementById('autoSync').checked;
  persistSettings();
  showToast('设置已保存');
}

function fillSettingsForm() {
  document.getElementById('aiEndpoint').value = settings.aiEndpoint || '';
  document.getElementById('aiModel').value = settings.aiModel || '';
  document.getElementById('aiKey').value = settings.aiKey || '';
  document.getElementById('useAiOcr').checked = !!settings.useAiOcr;
  document.getElementById('ocrModel').value = settings.ocrModel || '';
  document.getElementById('openCaptureOnLaunch').checked = !!settings.openCaptureOnLaunch;
  document.getElementById('syncToken').value = settings.syncToken || '';
  document.getElementById('syncGistId').value = settings.syncGistId || '';
  document.getElementById('autoSync').checked = !!settings.autoSync;
}

function readSyncSettings() {
  settings.syncToken = document.getElementById('syncToken').value.trim();
  settings.syncGistId = document.getElementById('syncGistId').value.trim();
  settings.autoSync = document.getElementById('autoSync').checked;
  persistSettings();
}

async function syncUpload() {
  readSyncSettings();
  if (!settings.syncToken) {
    showToast('请先填写 GitHub Token');
    return;
  }
  if (allErrors.length === 0 && !settings.syncGistId) {
    showToast('没有数据可上传');
    return;
  }
  showProcessing('上传中', '正在同步到 GitHub Gist');
  try {
    const payload = {
      app: 'TeamFutureErrorCollector',
      version: 2,
      exportedAt: new Date().toISOString(),
      errors: allErrors
    };
    const content = JSON.stringify(payload, null, 2);
    let gist;
    if (settings.syncGistId) {
      gist = await gistApi('https://api.github.com/gists/' + settings.syncGistId, 'PATCH', {
        files: { 'error-collector-backup.json': { content } }
      });
    } else {
      gist = await gistApi('https://api.github.com/gists', 'POST', {
        description: '错题助手云备份',
        public: false,
        files: { 'error-collector-backup.json': { content } }
      });
      settings.syncGistId = gist.id;
      persistSettings();
      document.getElementById('syncGistId').value = gist.id;
    }
    hideProcessing();
    showToast('已上传到云端');
    return gist && gist.id;
  } catch (err) {
    hideProcessing();
    showToast('上传失败：' + err.message);
  }
}

async function syncPull(isAuto) {
  readSyncSettings();
  if (!settings.syncToken || !settings.syncGistId) {
    if (!isAuto) showToast('请先填写 GitHub Token 和 Gist ID');
    return;
  }
  if (!isAuto) showProcessing('恢复中', '正在从云端读取数据');
  try {
    const gist = await gistApi('https://api.github.com/gists/' + settings.syncGistId, 'GET');
    const file = gist.files && gist.files['error-collector-backup.json'];
    if (!file || !file.content) throw new Error('云端没有找到备份数据');
    const parsed = JSON.parse(file.content);
    const items = Array.isArray(parsed) ? parsed : parsed.errors;
    if (!Array.isArray(items)) throw new Error('云端数据格式不正确');
    const cleaned = items.filter(x => x && x.text).map(x => Object.assign({}, x));

    if (isAuto) {
      await storeClear();
      await storeBulkAdd(cleaned);
    } else {
      const merge = confirm('选择“确定”合并云端数据，选择“取消”替换本地数据。');
      if (merge) {
        cleaned.forEach(x => delete x.id);
      } else {
        await storeClear();
      }
      await storeBulkAdd(cleaned);
    }
    await loadErrors();
    updateHome();
    updateNavBadge();
    renderErrorList();
    if (!isAuto) hideProcessing();
    showToast(`已恢复 ${cleaned.length} 条错题`);
  } catch (err) {
    if (!isAuto) hideProcessing();
    if (!isAuto) showToast('恢复失败：' + err.message);
    console.warn('sync pull failed', err);
  }
}

async function gistApi(url, method, body) {
  const headers = {
    Authorization: 'Bearer ' + settings.syncToken,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'codex'
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ===================== 数据管理 ===================== */

function exportData() {
  if (allErrors.length === 0) {
    showToast('没有数据可导出');
    return;
  }
  const payload = {
    app: 'TeamFutureErrorCollector',
    version: 2,
    exportedAt: new Date().toISOString(),
    errors: allErrors
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `错题数据_${new Date().toLocaleDateString('zh-CN')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('数据已导出');
}

function exportPrintable() {
  if (allErrors.length === 0) {
    showToast('没有错题可打印');
    return;
  }
  const rows = allErrors.map((e, i) => {
    const similar = e.analysis && Array.isArray(e.analysis.similar) && e.analysis.similar.length
      ? `<h3>举一反三</h3><ol>${e.analysis.similar.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ol>`
      : '';
    const analysis = e.analysis
      ? `<h3>AI 复盘</h3><p>${escapeHtml(e.analysis.analysis || '')}</p><h3>解题步骤</h3><p>${escapeHtml(e.analysis.solution || '')}</p>`
      : '';
    const attempt = e.lastAttempt ? `<h3>最近自测作答</h3><p>${escapeHtml(e.lastAttempt)}</p>` : '';
    return `
      <section class="card">
        <div class="meta">${i + 1}. ${escapeHtml(e.subject)} · ${escapeHtml(e.topic || '未分类')} · 错因：${escapeHtml(e.cause || '未标注')} · ${dateLabel(e.createdAt)}</div>
        <h3>题目</h3>
        <p>${escapeHtml(e.text)}</p>
        <h3>答案 / 解析</h3>
        <p>${escapeHtml(e.answer || '未记录答案')}</p>
        ${attempt}
        ${analysis}
        ${similar}
      </section>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>错题打印版</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; color: #1c2433; }
  h1 { font-size: 22px; }
  h3 { margin: 12px 0 6px; font-size: 14px; color: #4353c8; }
  p, li { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
  .card { border: 1px solid #e2e7ef; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; break-inside: avoid; }
  .meta { font-size: 12px; color: #697386; margin-bottom: 6px; }
  ol { padding-left: 22px; }
  @media print { body { padding: 0; } .card { border-color: #bbb; } }
</style>
</head>
<body>
<h1>错题打印版</h1>
<p style="color:#697386">导出时间：${new Date().toLocaleString('zh-CN')} · 共 ${allErrors.length} 道错题</p>
${rows}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `错题打印版_${new Date().toLocaleDateString('zh-CN')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('打印版已导出，可打开后直接打印');
}

function exportStudyReport() {
  if (allErrors.length === 0) {
    showToast('还没有错题，无法生成学习报告');
    return;
  }
  const now = Date.now();
  const weekStart = now - 6 * 86400000;
  const total = allErrors.length;
  const mastered = allErrors.filter(e => e.status === 'mastered').length;
  const due = allErrors.filter(e => e.status !== 'mastered' && (!e.nextReviewAt || new Date(e.nextReviewAt).getTime() <= now)).length;
  const subjects = new Set(allErrors.map(e => e.subject)).size;
  const weekNew = allErrors.filter(e => e.createdAt && new Date(e.createdAt).getTime() >= weekStart).length;
  const weekReviewed = allErrors.filter(e => e.lastReviewedAt && new Date(e.lastReviewedAt).getTime() >= weekStart).length;
  const streak = getStreak();

  const counts = {};
  allErrors.forEach(e => {
    const key = e.topic || '未分类';
    counts[key] = (counts[key] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const weakRows = top.map(([name, count]) => `<li>${escapeHtml(name)}：${count} 题</li>`).join('');

  const recentRows = allErrors.slice(0, 10).map((e, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(e.subject)}</td>
      <td>${escapeHtml(e.topic || '未分类')}</td>
      <td>${escapeHtml(e.cause || '未标注')}</td>
      <td>${e.status === 'mastered' ? '已掌握' : '待复习'}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>错题学习报告</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 820px; margin: 0 auto; padding: 28px; color: #1c2433; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .sub { color: #697386; font-size: 13px; margin-bottom: 22px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
  .stat { border: 1px solid #e2e7ef; border-radius: 8px; padding: 14px; text-align: center; }
  .stat b { display: block; font-size: 24px; color: #4353c8; }
  .stat span { font-size: 12px; color: #697386; }
  h2 { font-size: 16px; margin: 20px 0 10px; }
  ul { padding-left: 20px; line-height: 1.8; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #e2e7ef; padding: 8px 10px; text-align: left; }
  th { background: #f3f5f9; }
  .note { margin-top: 24px; color: #697386; font-size: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>错题学习报告</h1>
<div class="sub">Team Future · 轻量化AI高中错题个性化学习助手 · ${new Date().toLocaleDateString('zh-CN')}</div>
<div class="stats">
  <div class="stat"><b>${total}</b><span>错题总数</span></div>
  <div class="stat"><b>${mastered}</b><span>已掌握</span></div>
  <div class="stat"><b>${due}</b><span>待复习</span></div>
  <div class="stat"><b>${subjects}</b><span>涉及科目</span></div>
</div>
<h2>本周概览</h2>
<ul>
  <li>本周新增错题：${weekNew} 题</li>
  <li>本周完成复习：${weekReviewed} 次</li>
  <li>连续学习天数：${streak} 天</li>
</ul>
<h2>薄弱知识点</h2>
<ul>${weakRows}</ul>
<h2>最近错题</h2>
<table>
  <thead><tr><th>#</th><th>科目</th><th>知识点</th><th>错因</th><th>状态</th></tr></thead>
  <tbody>${recentRows}</tbody>
</table>
<div class="note">本报告由错题助手本地生成，仅供学习反馈使用。</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `学习报告_${new Date().toLocaleDateString('zh-CN')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('学习报告已导出');
}

function importData() {
  document.getElementById('importInput').click();
}

async function onImportSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const items = Array.isArray(parsed) ? parsed : parsed.errors;
    if (!Array.isArray(items)) throw new Error('文件格式不正确');
    const merge = confirm('选择“确定”合并导入；选择“取消”将替换现有数据。');
    const cleaned = items.map(x => Object.assign({}, x)).filter(x => x && x.text);
    if (merge) cleaned.forEach(x => delete x.id);
    if (!merge) await storeClear();
    await storeBulkAdd(cleaned);
    await loadErrors();
    updateHome();
    updateNavBadge();
    renderErrorList();
    showToast(`已导入 ${cleaned.length} 条错题`);
  } catch (err) {
    showToast('导入失败：' + err.message);
  }
  event.target.value = '';
}

async function clearAllData() {
  if (!confirm('确定要清空所有错题数据吗？此操作不可恢复。')) return;
  await storeClear();
  await loadErrors();
  updateHome();
  updateNavBadge();
  renderErrorList();
  showToast('所有数据已清空');
}

/* ===================== 弹窗 / 工具 ===================== */

function openModal(title, html) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  currentDetailId = null;
  editingId = null;
  cropModalOpen = false;
  cropState = null;
}

function showProcessing(title, desc) {
  document.getElementById('procTitle').textContent = title;
  document.getElementById('procDesc').textContent = desc;
  document.getElementById('processingOverlay').classList.add('show');
}

function updateProcessing(title, desc) {
  document.getElementById('procTitle').textContent = title;
  document.getElementById('procDesc').textContent = desc;
}

function hideProcessing() {
  document.getElementById('processingOverlay').classList.remove('show');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function findError(id) {
  return allErrors.find(e => e.id === Number(id));
}

function subjectClass(subject) {
  return SUBJECT_CLASS[subject] || 'subj-default';
}

function subjectIcon(subject) {
  return SUBJECT_ICON[subject] || '?';
}

function dateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN');
}

function shortText(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n) + '...' : str;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
