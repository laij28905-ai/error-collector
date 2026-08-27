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

  function injectStyle() {
    if (document.getElementById('cropEnhanceStyle')) return;
    var st = document.createElement('style');
    st.id = 'cropEnhanceStyle';
    st.textContent = [
      '#cropStage{position:relative;overflow:hidden;touch-action:none}',
      '#cropImg{position:absolute;max-width:none;user-select:none;-webkit-user-select:none}',
      '#cropFrame{position:absolute;border:2px solid #4353c8;background:rgba(67,83,200,.10);box-sizing:border-box;touch-action:none;z-index:2}',
      '.cf-handle{position:absolute;width:16px;height:16px;background:#fff;border:2px solid #4353c8;border-radius:3px;box-sizing:border-box;z-index:3}',
      '.cf-nw{left:-8px;top:-8px;cursor:nwse-resize}.cf-ne{right:-8px;top:-8px;cursor:nesw-resize}',
      '.cf-sw{left:-8px;bottom:-8px;cursor:nesw-resize}.cf-se{right:-8px;bottom:-8px;cursor:nwse-resize}',
      '.cf-n{left:50%;top:-8px;transform:translateX(-50%);cursor:ns-resize}.cf-s{left:50%;bottom:-8px;transform:translateX(-50%);cursor:ns-resize}',
      '.cf-w{top:50%;left:-8px;transform:translateY(-50%);cursor:ew-resize}.cf-e{top:50%;right:-8px;transform:translateY(-50%);cursor:ew-resize}',
      '.cf-size{position:absolute;left:50%;bottom:-26px;transform:translateX(-50%);background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 7px;border-radius:4px;white-space:nowrap;pointer-events:none;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
      '.crop-tip{font-size:12px;color:#8a90a3;margin:10px 2px 0;text-align:center}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function clampFrame() {
    var min = 56;
    if (S.frameW < min) S.frameW = min;
    if (S.frameH < min) S.frameH = min;
    if (S.frameX < 0) S.frameX = 0;
    if (S.frameY < 0) S.frameY = 0;
    if (S.frameX + S.frameW > S.stageW) S.frameX = S.stageW - S.frameW;
    if (S.frameY + S.frameH > S.stageH) S.frameY = S.stageH - S.frameH;
    if (S.frameW > S.stageW) { S.frameW = S.stageW; S.frameX = 0; }
    if (S.frameH > S.stageH) { S.frameH = S.stageH; S.frameY = 0; }
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
    S.baseScale = Math.max(S.stageW / naturalW, S.stageH / naturalH);
    S.zoom = 1;
    var dispW = naturalW * S.baseScale;
    var dispH = naturalH * S.baseScale;
    S.offX = (S.stageW - dispW) / 2;
    S.offY = (S.stageH - dispH) / 2;
    S.frameW = Math.round(S.stageW * 0.78);
    S.frameH = Math.round(S.stageH * 0.66);
    S.frameX = Math.round((S.stageW - S.frameW) / 2);
    S.frameY = Math.round((S.stageH - S.frameH) / 2);
    clampFrame();
    clampImage();
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
    if (!stage || !frame) return;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    if (frame.contains(e.target)) {
      var dir = e.target.classList ? handleDir(e.target.classList) : null;
      if (dir) {
        drag = { type: dir, startX: e.clientX, startY: e.clientY, fX: S.frameX, fY: S.frameY, fW: S.frameW, fH: S.frameH };
      } else {
        drag = { type: 'move', startX: e.clientX, startY: e.clientY, fX: S.frameX, fY: S.frameY };
      }
      e.preventDefault();
      return;
    }
    drag = { type: 'image', startX: e.clientX, startY: e.clientY, oX: S.offX, oY: S.offY };
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
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
      clampImage();
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
      S.frameX = nx; S.frameY = ny; S.frameW = nw; S.frameH = nh;
      clampFrame();
      clampImage();
      render();
    }
    e.preventDefault();
  }

  function onUp() {
    drag = null;
  }

  function zoom(value) {
    var next = Number(value);
    if (!next || next <= 0) return;
    var ratio = next / S.zoom;
    S.zoom = next;
    S.offX = S.frameX - (S.frameX - S.offX) * ratio;
    S.offY = S.frameY - (S.frameY - S.offY) * ratio;
    clampImage();
    render();
  }

  function rotate(dir) {
    if (!window.capturedImage) return;
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      var canvas = document.createElement('canvas');
      canvas.width = h; canvas.height = w;
      var ctx = canvas.getContext('2d');
      ctx.translate(h / 2, w / 2);
      ctx.rotate(dir === 'left' ? -Math.PI / 2 : Math.PI / 2);
      ctx.drawImage(img, -w / 2, -h / 2);
      window.capturedImage = canvas.toDataURL('image/jpeg', 0.92);
      var cropImg = document.getElementById('cropImg');
      if (cropImg) {
        cropImg.onload = setup;
        cropImg.src = window.capturedImage;
      }
    };
    img.src = window.capturedImage;
  }

  function openCropModal() {
    if (!window.capturedImage) return;
    if (typeof window.openModal !== 'function') return;
    window.cropModalOpen = true;
    window.openModal('裁剪与校正', [
      '<div class="crop-stage" id="cropStage">',
      '  <img id="cropImg" src="' + window.capturedImage + '" alt="裁剪区域">',
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
      '<p class="crop-tip">拖动框体移动；拖四角/四边自由调宽高；滑块整体缩放；旋转后自动重排</p>'
    ].join('\n'));
    var img = document.getElementById('cropImg');
    if (img) {
      if (img.complete) setup();
      else img.onload = setup;
    }
  }

  function applyCrop() {
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
    var outW = Math.max(600, Math.round(S.frameW * 2));
    var outH = Math.max(450, Math.round(outW * srcH / srcW));
    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var img = document.getElementById('cropImg');
    if (!img) return;
    canvas.getContext('2d').drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    window.capturedImage = canvas.toDataURL('image/jpeg', 0.92);
    drag = null;
    S.active = false;
    if (typeof window.closeModal === 'function') window.closeModal();
    if (typeof window.showCapturedImage === 'function') window.showCapturedImage();
    if (typeof window.showToast === 'function') window.showToast('裁剪完成');
  }

  // 覆盖原裁剪入口与完成逻辑
  window.openCropModal = openCropModal;
  window.applyCrop = applyCrop;
  window.cropEnhanceRotate = rotate;
  window.cropEnhanceZoom = zoom;
  window.cropEnhanceApply = applyCrop;

  injectStyle();
})();
