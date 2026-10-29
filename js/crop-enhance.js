/* ============================================================
 * crop-enhance.js — 裁剪框自由调节宽高
 * 功能：
 *   1) 裁剪框四角 + 四边共 8 个手柄，可自由拖动调整宽高
 *   2) 拖动框体可移动框的位置
 *   3) 保留整体缩放滑块与旋转
 * 用法：上传到仓库 js/ 目录，并在 app.html 的
 *       <script src="js/album-enhance.js"></script> 之后加一行：
 *       <script src="js/crop-enhance.js"></script>
 * ============================================================ */
(function () {
  'use strict';

  var S = {
    active: false,
    naturalW: 0, naturalH: 0,
    baseScale: 1, zoom: 1,
    offX: 0, offY: 0,
    frameX: 0, frameY: 0, frameW: 0, frameH: 0,
    stageW: 0, stageH: 0
  };
  var drag = null;
  var sourceImage = '';
  var rotating = false;

  function injectStyle() {
    if (document.getElementById('cropEnhanceStyle')) return;
    var st = document.createElement('style');
    st.id = 'cropEnhanceStyle';
    st.textContent = [
      '#cropStage{position:relative;overflow:hidden;touch-action:none;height:min(52dvh,480px);min-height:240px;aspect-ratio:auto}',
      '#cropImg{position:absolute;max-width:none;user-select:none;-webkit-user-select:none}',
      '#cropFrame{position:absolute;transform:none;pointer-events:auto;border:1px solid rgba(255,255,255,.9);border-radius:0;background:transparent;box-sizing:border-box;touch-action:none;z-index:2;cursor:move}',
      '.cf-handle{position:absolute;width:44px;height:44px;box-sizing:border-box;z-index:3;touch-action:none}',
      '.cf-handle:after{position:absolute;width:14px;height:14px;border:0 solid #fff;pointer-events:none}',
      '.cf-nw:after{content:"";left:21px;top:21px;border-left-width:2px;border-top-width:2px}',
      '.cf-ne:after{content:"";right:21px;top:21px;border-right-width:2px;border-top-width:2px}',
      '.cf-sw:after{content:"";left:21px;bottom:21px;border-left-width:2px;border-bottom-width:2px}',
      '.cf-se:after{content:"";right:21px;bottom:21px;border-right-width:2px;border-bottom-width:2px}',
      '.cf-nw{left:-23px;top:-23px;cursor:nwse-resize}.cf-ne{right:-23px;top:-23px;cursor:nesw-resize}',
      '.cf-sw{left:-23px;bottom:-23px;cursor:nesw-resize}.cf-se{right:-23px;bottom:-23px;cursor:nwse-resize}',
      '.cf-n{left:50%;top:-23px;transform:translateX(-50%);cursor:ns-resize}.cf-s{left:50%;bottom:-23px;transform:translateX(-50%);cursor:ns-resize}',
      '.cf-w{top:50%;left:-23px;transform:translateY(-50%);cursor:ew-resize}.cf-e{top:50%;right:-23px;transform:translateY(-50%);cursor:ew-resize}',
      '.cf-size{position:absolute;left:50%;bottom:-26px;transform:translateX(-50%);background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 7px;border-radius:4px;white-space:nowrap;pointer-events:none;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
      '.crop-tip{font-size:12px;color:#8a90a3;margin:10px 2px 0;text-align:center}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function bounds() {
    var scale = S.baseScale * S.zoom;
    return { left: Math.max(0, S.offX), top: Math.max(0, S.offY),
      right: Math.min(S.stageW, S.offX + S.naturalW * scale),
      bottom: Math.min(S.stageH, S.offY + S.naturalH * scale) };
  }

  function clampFrame() {
    var b = bounds();
    S.frameW = Math.min(Math.max(56, S.frameW), b.right - b.left);
    S.frameH = Math.min(Math.max(56, S.frameH), b.bottom - b.top);
    S.frameX = Math.max(b.left, Math.min(S.frameX, b.right - S.frameW));
    S.frameY = Math.max(b.top, Math.min(S.frameY, b.bottom - S.frameH));
  }

  function clampImage() {
    var scale = S.baseScale * S.zoom;
    var dispW = S.naturalW * scale;
    var dispH = S.naturalH * scale;
    var minOffX = S.frameX + S.frameW - dispW;
    var minOffY = S.frameY + S.frameH - dispH;
    S.offX = Math.min(S.frameX, Math.max(minOffX, S.offX));
    S.offY = Math.min(S.frameY, Math.max(minOffY, S.offY));
  }

  function render() {
    var scale = S.baseScale * S.zoom;
    var img = document.getElementById('cropImg');
    var frame = document.getElementById('cropFrame');
    if (!img || !frame) return;
    img.style.width = Math.round(S.naturalW * scale) + 'px';
    img.style.height = Math.round(S.naturalH * scale) + 'px';
    img.style.left = Math.round(S.offX) + 'px';
    img.style.top = Math.round(S.offY) + 'px';
    frame.style.left = Math.round(S.frameX) + 'px';
    frame.style.top = Math.round(S.frameY) + 'px';
    frame.style.width = Math.round(S.frameW) + 'px';
    frame.style.height = Math.round(S.frameH) + 'px';
    var size = frame.querySelector('.cf-size');
    if (size) {
      var nScale = S.baseScale * S.zoom;
      size.textContent = Math.round(S.frameW / nScale) + ' × ' + Math.round(S.frameH / nScale);
    }
  }

  function setup() {
    var stage = document.getElementById('cropStage');
    var img = document.getElementById('cropImg');
    if (!stage || !img) return;
    S.stageW = stage.clientWidth;
    S.stageH = stage.clientHeight;
    var naturalW = img.naturalWidth;
    var naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) { naturalW = S.stageW; naturalH = S.stageH; }
    S.naturalW = naturalW;
    S.naturalH = naturalH;
    // Show the whole page first; cover would hide the top and bottom of a test paper.
    S.baseScale = Math.min((S.stageW - 32) / naturalW, (S.stageH - 32) / naturalH);
    S.zoom = 1;
    var dispW = naturalW * S.baseScale;
    var dispH = naturalH * S.baseScale;
    S.offX = (S.stageW - dispW) / 2;
    S.offY = (S.stageH - dispH) / 2;
    S.frameW = Math.round(dispW * 0.85);
    S.frameH = Math.round(dispH * 0.35);
    S.frameX = Math.round((S.stageW - S.frameW) / 2);
    S.frameY = Math.round((S.stageH - S.frameH) / 2);
    clampFrame();
    S.active = true;
    drag = null;
    document.getElementById('cropZoom').value = 1;
    render();
    bind();
  }

  function bind() {
    var stage = document.getElementById('cropStage');
    if (!stage || stage.getAttribute('data-crop-bound')) return;
    stage.setAttribute('data-crop-bound', '1');
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
  }

  function handleDir(clsList) {
    for (var i = 0; i < clsList.length; i++) {
      var c = clsList[i];
      if (/^cf-(nw|n|ne|w|e|sw|s|se)$/.test(c)) return c.slice(3);
    }
    return null;
  }

  function onDown(e) {
    var stage = document.getElementById('cropStage');
    var frame = document.getElementById('cropFrame');
    if (!stage || !frame || !S.active || rotating || drag || e.isPrimary === false) return;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    if (frame.contains(e.target)) {
      var dir = e.target.classList ? handleDir(e.target.classList) : null;
      if (!dir) {
        var rect = frame.getBoundingClientRect();
        var horizontal = e.clientX - rect.left < 18 ? 'w' : rect.right - e.clientX < 18 ? 'e' : '';
        var vertical = e.clientY - rect.top < 18 ? 'n' : rect.bottom - e.clientY < 18 ? 's' : '';
        dir = vertical + horizontal;
      }
      if (dir) {
        drag = { type: dir, startX: e.clientX, startY: e.clientY, fX: S.frameX, fY: S.frameY, fW: S.frameW, fH: S.frameH };
      } else {
        drag = { type: 'move', startX: e.clientX, startY: e.clientY, fX: S.frameX, fY: S.frameY };
      }
      e.preventDefault();
      drag.pointerId = e.pointerId;
      return;
    }
    drag = { type: 'image', startX: e.clientX, startY: e.clientY, oX: S.offX, oY: S.offY };
    drag.pointerId = e.pointerId;
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    if (drag.type === 'image') {
      S.offX = drag.oX + dx;
      S.offY = drag.oY + dy;
      clampImage();
      render();
    } else if (drag.type === 'move') {
      S.frameX = drag.fX + dx;
      S.frameY = drag.fY + dy;
      clampFrame();
      render();
    } else {
      var min = 56;
      var nx = drag.fX, ny = drag.fY, nw = drag.fW, nh = drag.fH;
      var t = drag.type;
      if (t.indexOf('e') >= 0) nw = Math.max(min, drag.fW + dx);
      if (t.indexOf('s') >= 0) nh = Math.max(min, drag.fH + dy);
      if (t.indexOf('w') >= 0) {
        var w2 = Math.max(min, drag.fW - dx);
        nx = drag.fX + (drag.fW - w2);
        nw = w2;
      }
      if (t.indexOf('n') >= 0) {
        var h2 = Math.max(min, drag.fH - dy);
        ny = drag.fY + (drag.fH - h2);
        nh = h2;
      }
      var b = bounds();
      var right = Math.min(b.right, nx + nw), bottom = Math.min(b.bottom, ny + nh);
      nx = Math.max(b.left, nx); ny = Math.max(b.top, ny);
      S.frameX = nx; S.frameY = ny; S.frameW = right - nx; S.frameH = bottom - ny;
      clampFrame();
      render();
    }
    e.preventDefault();
  }

  function onUp(e) {
    if (drag && e && e.pointerId !== drag.pointerId) return;
    drag = null;
  }

  function zoom(value) {
    if (!S.active || rotating) return;
    var next = Number(value);
    if (!next || next <= 0) return;
    var ratio = next / S.zoom;
    S.zoom = next;
    S.offX = S.frameX - (S.frameX - S.offX) * ratio;
    S.offY = S.frameY - (S.frameY - S.offY) * ratio;
    clampImage();
    clampFrame();
    render();
  }

  function rotate(dir) {
    if (!sourceImage || ocrBusy || rotating) return;
    rotating = true;
    var current = document.getElementById('cropImg');
    var img = new Image();
    img.onload = function () {
      try {
      if (!cropModalOpen || current !== document.getElementById('cropImg')) return;
      var w = img.naturalWidth, h = img.naturalHeight;
      var canvas = document.createElement('canvas');
      canvas.width = h; canvas.height = w;
      var ctx = canvas.getContext('2d');
      ctx.translate(h / 2, w / 2);
      ctx.rotate(dir === 'left' ? -Math.PI / 2 : Math.PI / 2);
      ctx.drawImage(img, -w / 2, -h / 2);
      sourceImage = canvas.toDataURL('image/jpeg', 0.92);
      var cropImg = document.getElementById('cropImg');
      if (cropImg) {
        cropImg.onload = setup;
        cropImg.src = sourceImage;
      }
      } catch (error) { notifyFailure(error); }
      finally { rotating = false; }
    };
    img.onerror = function () { rotating = false; showToast('图片读取失败，请重新选择'); };
    img.src = sourceImage;
  }

  function openCropModal() {
    if (!capturedImage || ocrBusy) return;
    if (typeof window.openModal !== 'function') return;
    sourceImage = capturedPageImage || capturedImage;
    S.active = false;
    drag = null;
    cropModalOpen = true;
    window.openModal('框选一道题', [
      '<div class="crop-stage" id="cropStage">',
      '  <img id="cropImg" draggable="false" src="' + imageHtml(sourceImage) + '" alt="整页试卷">',
      '  <div class="crop-frame" id="cropFrame">',
      '    <span class="cf-handle cf-nw"></span><span class="cf-handle cf-n"></span><span class="cf-handle cf-ne"></span>',
      '    <span class="cf-handle cf-w"></span><span class="cf-handle cf-e"></span>',
      '    <span class="cf-handle cf-sw"></span><span class="cf-handle cf-s"></span><span class="cf-handle cf-se"></span>',
      '    <span class="cf-size"></span>',
      '  </div>',
      '</div>',
      '<div class="crop-tools">',
      '  <button class="btn" onclick="cropEnhanceRotate(\'left\')">&#8630; 左转</button>',
      '  <button class="btn" onclick="cropEnhanceRotate(\'right\')">&#8631; 右转</button>',
      '</div>',
      '<div class="crop-tools">',
      '  <span class="field-label" style="margin:0">缩放</span>',
      '  <div class="crop-zoom"><input id="cropZoom" type="range" min="1" max="3" step="0.05" value="1" oninput="cropEnhanceZoom(this.value)"></div>',
      '  <button class="btn teal" onclick="cropEnhanceApply()">完成</button>',
      '</div>',
      '<p class="crop-tip">拖边或四角调大小，拖框内移动选区。放大后可拖框外移动图片。</p>'
    ].join('\n'));
    var img = document.getElementById('cropImg');
    if (img) {
      if (img.complete) setup();
      else img.onload = setup;
    }
  }

  function applyCrop() {
    if (!S.active || rotating || !cropModalOpen) return;
    try {
    var scale = S.baseScale * S.zoom;
    var srcX = (S.frameX - S.offX) / scale;
    var srcY = (S.frameY - S.offY) / scale;
    var srcW = S.frameW / scale;
    var srcH = S.frameH / scale;
    srcX = Math.max(0, srcX);
    srcY = Math.max(0, srcY);
    srcW = Math.min(S.naturalW - srcX, srcW);
    srcH = Math.min(S.naturalH - srcY, srcH);
    if (srcW <= 1 || srcH <= 1) {
      if (typeof window.showToast === 'function') window.showToast('裁剪区域无效');
      return;
    }
    var outputScale = Math.min(1, 2400 / Math.max(srcW, srcH));
    var outW = Math.max(1, Math.round(srcW * outputScale));
    var outH = Math.max(1, Math.round(srcH * outputScale));
    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var img = document.getElementById('cropImg');
    if (!img) return;
    canvas.getContext('2d').drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    capturedImage = canvas.toDataURL('image/jpeg', 0.92);
    capturedPageImage = sourceImage;
    lastOcrRaw = '';
    drag = null;
    S.active = false;
    if (typeof window.closeModal === 'function') window.closeModal();
    if (typeof window.showCapturedImage === 'function') window.showCapturedImage();
    if (typeof window.showToast === 'function') window.showToast('裁剪完成');
    } catch (error) { notifyFailure(error); }
  }

  // 覆盖原裁剪入口与完成逻辑
  window.openCropModal = openCropModal;
  window.applyCrop = applyCrop;
  window.cropEnhanceRotate = rotate;
  window.cropEnhanceZoom = zoom;
  window.cropEnhanceApply = applyCrop;

  injectStyle();
})();
