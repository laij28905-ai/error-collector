/* ============================================================
 * album-enhance.js — 增强“从相册选择图片”
 * 功能：
 *   1) 录入页大占位图“拍照或选择图片”可点击 → 打开系统相册选图
 *   2) 首页快捷入口新增“相册导入”按钮 → 打开系统相册选图
 * 用法：将本文件上传到仓库 js/ 目录，并在 app.html 的
 *       <script src="js/app.js"></script> 之后加一行：
 *       <script src="js/album-enhance.js"></script>
 * ============================================================ */
(function () {
  'use strict';

  function openAlbum() {
    var input = document.getElementById('fileInput');
    if (input) {
      input.click();
      return;
    }
    if (typeof uploadImage === 'function') uploadImage();
  }

  function enhancePlaceholder() {
    var ph = document.querySelector('#capturePreview .placeholder');
    if (!ph || ph.getAttribute('data-album-ok')) return;
    ph.setAttribute('data-album-ok', '1');
    ph.style.cursor = 'pointer';
    ph.setAttribute('role', 'button');
    ph.setAttribute('aria-label', '从相册选择图片');
    ph.addEventListener('click', openAlbum);
    if (!ph.querySelector('.pl-hint')) {
      var hint = document.createElement('div');
      hint.className = 'pl-hint';
      hint.style.cssText = 'margin-top:8px;font-size:12px;color:#8a90a3';
      hint.textContent = '点击此处可从相册选择';
      ph.appendChild(hint);
    }
  }

  function addQuickCard() {
    var grid = document.querySelector('.quick-grid');
    if (!grid || document.getElementById('qcAlbum')) return;
    var card = document.createElement('button');
    card.className = 'quick-card';
    card.id = 'qcAlbum';
    card.innerHTML = '<span class="qc-icon">\uD83D\uDCC1</span><span class="qc-title">相册导入</span>';
    card.addEventListener('click', openAlbum);
    grid.appendChild(card);
  }

  function init() {
    enhancePlaceholder();
    addQuickCard();
    // 重拍(retake)会重建占位图，用 MutationObserver 持续生效
    var preview = document.getElementById('capturePreview');
    if (preview && typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () { enhancePlaceholder(); })
        .observe(preview, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
