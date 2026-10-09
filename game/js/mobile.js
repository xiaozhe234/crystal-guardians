/**
 * 晶域守卫者 · 手机端触控系统
 * - 左下角虚拟摇杆控制 WASD 方向
 * - 右下角按钮：开火 / 技能 / 交互 / 切枪
 * - 强制横屏游玩
 * - 自定义按键位置与大小（长按齿轮进入编辑模式）
 */
(function () {
  const G = window.G;
  if (!G) return;

  // ---------- 移动端检测 ----------
  const isMobile = (function () {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    if ('ontouchstart' in window && window.innerWidth < 1024) return true;
    return false;
  })();
  if (!isMobile) return;
  G.isMobile = true;

  // ---------- 横屏强制 ----------
  let orientOverlay = null;
  function checkOrient() {
    const portrait = window.innerWidth < window.innerHeight;
    if (portrait) {
      if (!orientOverlay) {
        orientOverlay = document.createElement('div');
        orientOverlay.id = 'mob-orient';
        orientOverlay.innerHTML = '<div class="mob-orient-inner"><span class="mob-orient-ico">📱</span><br><span>请旋转屏幕</span><br><span>横屏游玩</span></div>';
        document.body.appendChild(orientOverlay);
      }
      orientOverlay.style.display = 'flex';
    } else {
      if (orientOverlay) orientOverlay.style.display = 'none';
    }
  }
  window.addEventListener('resize', checkOrient);
  window.addEventListener('orientationchange', function () { setTimeout(checkOrient, 120); });
  checkOrient();

  // 隐藏鼠标光标
  var canvas = document.getElementById('game');
  if (canvas) canvas.style.cursor = 'none';

  // ---------- 强制全屏 ----------
  function requestFullscreen() {
    var el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(function () {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }

  // ---------- 默认布局 ----------
  // 位置以屏幕百分比表示：{ x: 0-100, y: 0-100, size: px }
  // x=0 表示从左边算，x=100 表示从右边算（>50 时视为右对齐）
  var defaultLayout = {
    joystick: { x: 22, y: 55, size: 130 },
    fire:     { x: 82, y: 62, size: 80 },
    skill:    { x: 92, y: 28, size: 58 },
    interact: { x: 72, y: 28, size: 52 },
    weapon:   { x: 92, y: 82, size: 50 },
    pause:    { x: 50, y: 6,  size: 50 },
    gear:     { x: 90, y: 4,  size: 32 },
    cheat:    { x: 10, y: 6,  size: 50 }
  };

  // ---------- 持久化 ----------
  var LAYOUT_VERSION = 3;
  var layout = null;
  try {
    var raw = localStorage.getItem('yqq_mobile_layout');
    if (raw) {
      layout = JSON.parse(raw);
      // 版本不匹配则重置为默认布局
      if (layout._version !== LAYOUT_VERSION) layout = null;
    }
  } catch (e) {}
  if (!layout) layout = JSON.parse(JSON.stringify(defaultLayout));
  layout._version = LAYOUT_VERSION;
  // 补齐缺失 key
  for (var k in defaultLayout) {
    if (!layout[k]) layout[k] = JSON.parse(JSON.stringify(defaultLayout[k]));
  }

  function saveLayout() {
    layout._version = LAYOUT_VERSION;
    try { localStorage.setItem('yqq_mobile_layout', JSON.stringify(layout)); } catch (e) {}
  }

  // ---------- 编辑模式 ----------
  var editTarget = null;   // 当前选中的按钮元素
  var editTargetId = null; // 当前选中按钮的 layout key
  var editSlider = null;   // 滑块 DOM
  var editSliderLabel = null;

  // ---------- 辅助：坐标换算 ----------
  // leftAnchor: true 表示 x 从左边算，false 表示从右边算
  function leftAnchor(key) { return (layout[key].x || 0) <= 50; }
  function pxX(key) {
    var l = layout[key];
    if (leftAnchor(key)) return window.innerWidth * l.x / 100;
    return window.innerWidth * (100 - l.x) / 100 - l.size;
  }
  function pxY(key) {
    return window.innerHeight * layout[key].y / 100 - layout[key].size / 2;
  }

  // ---------- 创建 DOM ----------
  var overlay = document.createElement('div');
  overlay.id = 'mob-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:100;pointer-events:none;display:none;';
  document.body.appendChild(overlay);

  var editMode = false;
  var editHint = null;

  // 创建单个按钮
  function makeBtn(id, cls, innerHTML) {
    var el = document.createElement('div');
    el.id = 'mob-' + id;
    el.className = 'mob-btn ' + (cls || '');
    el.style.cssText = 'position:absolute;pointer-events:auto;touch-action:none;';
    el.innerHTML = innerHTML || '';
    overlay.appendChild(el);
    return el;
  }

  // 同步按钮位置大小
  function syncBtn(id, el) {
    if (!el) return; // joystick 由 syncStickStyle 单独处理
    var l = layout[id];
    var x = pxX(id), y = pxY(id);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = l.size + 'px';
    el.style.height = l.size + 'px';
    el.style.lineHeight = l.size + 'px';
    el.style.fontSize = Math.round(l.size * 0.38) + 'px';
    el.style.borderRadius = '50%';
  }

  // ---------- 创建摇杆 ----------
  var stickZone = document.createElement('div');
  stickZone.id = 'mob-stick-zone';
  stickZone.style.cssText = 'position:absolute;top:0;left:0;width:50%;height:100%;pointer-events:auto;touch-action:none;';
  overlay.appendChild(stickZone);

  var stickBase = document.createElement('div');
  stickBase.id = 'mob-stick-base';
  stickBase.style.cssText = 'position:absolute;border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.25);display:none;pointer-events:none;';
  overlay.appendChild(stickBase);

  var stickThumb = document.createElement('div');
  stickThumb.id = 'mob-stick-thumb';
  stickThumb.style.cssText = 'position:absolute;border-radius:50%;background:rgba(255,255,255,0.35);display:none;pointer-events:none;';
  overlay.appendChild(stickThumb);

  var stickId = null;      // touch identifier
  var stickCX = 0, stickCY = 0; // base center (px)
  var stickDX = 0, stickDY = 0; // normalized direction [-1,1]
  var stickActive = false;

  function syncStickStyle() {
    var l = layout.joystick;
    var s = l.size;
    stickBase.style.width = s + 'px';
    stickBase.style.height = s + 'px';
    stickThumb.style.width = (s * 0.42) + 'px';
    stickThumb.style.height = (s * 0.42) + 'px';
  }
  syncStickStyle();

  stickZone.addEventListener('touchstart', function (e) {
    if (stickId !== null || editMode || uiBlocking()) return;
    var t = e.changedTouches[0];

    // 转换触摸坐标为游戏坐标，判断是否在底部按钮区域
    var rect = canvas.getBoundingClientRect();
    var v = G.view;
    if (v) {
      var ly = (t.clientY - rect.top - v.offY) / v.scale;
      if (ly > G.H - 55) {
        // 底部按钮区域：转发为 UI 点击，不启动摇杆
        var lx = (t.clientX - rect.left - v.offX) / v.scale;
        var uiX = Math.max(0, (G.vw - G.W) / 2);
        if (G.paused || G.state === 'siege' || (G.state !== 'game' && G.state !== 'netgame' && G.state !== 'siege')
            || (G.game && (G.game.talentOpen || (G.game.player && G.game.player.shopOpen) || G.game.shopOpen || G.game.buildMode))) {
          lx -= uiX;
        }
        G.mouse.x = G.clamp(lx, 0, G.vw);
        G.mouse.y = G.clamp(ly, 0, G.vh);
        G.mouse.clicked = true;
        G.mouse.down = true;
        G.mouse.triggered = true;
        e.preventDefault();
        return;
      }
    }

    stickId = t.identifier;
    stickCX = t.clientX;
    stickCY = t.clientY;
    var s = layout.joystick.size;
    stickBase.style.left = (stickCX - s / 2) + 'px';
    stickBase.style.top = (stickCY - s / 2) + 'px';
    stickBase.style.display = 'block';
    var ts = s * 0.42;
    stickThumb.style.left = (stickCX - ts / 2) + 'px';
    stickThumb.style.top = (stickCY - ts / 2) + 'px';
    stickThumb.style.display = 'block';
    stickDX = 0; stickDY = 0;
    stickActive = true;
    e.preventDefault();
  }, { passive: false });

  stickZone.addEventListener('touchmove', function (e) {
    if (stickId === null) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === stickId) {
        var t = e.changedTouches[i];
        var dx = t.clientX - stickCX, dy = t.clientY - stickCY;
        var maxR = layout.joystick.size * 0.38;
        var dist = Math.hypot(dx, dy);
        if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; dist = maxR; }
        stickDX = dist > 8 ? dx / maxR : 0;
        stickDY = dist > 8 ? dy / maxR : 0;
        var ts = layout.joystick.size * 0.42;
        stickThumb.style.left = (stickCX + dx - ts / 2) + 'px';
        stickThumb.style.top = (stickCY + dy - ts / 2) + 'px';
        e.preventDefault();
        return;
      }
    }
  }, { passive: false });

  stickZone.addEventListener('touchend', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === stickId) {
        stickId = null;
        stickBase.style.display = 'none';
        stickThumb.style.display = 'none';
        stickDX = 0; stickDY = 0;
        stickActive = false;
        return;
      }
    }
  });

  stickZone.addEventListener('touchcancel', function () {
    stickId = null;
    stickBase.style.display = 'none';
    stickThumb.style.display = 'none';
    stickDX = 0; stickDY = 0;
    stickActive = false;
  });

  // ---------- 按钮创建 ----------
  var btnFire = makeBtn('fire', 'mob-fire', '🔥');
  var btnSkill = makeBtn('skill', 'mob-skill', '⚡');
  var btnInteract = makeBtn('interact', 'mob-interact', '🤝');
  var btnWeapon = makeBtn('weapon', 'mob-weapon', '🔫');
  var btnPause = makeBtn('pause', 'mob-pause', '⏸');
  var btnGear = makeBtn('gear', 'mob-gear', '⚙');
  var btnCheat = makeBtn('cheat', 'mob-cheat', '👑');
  var btnReset = null;

  // 按钮状态
  var fireTouching = false;
  var fireId = null;

  function syncAll() {
    syncBtn('joystick', null); // only affects size via syncStickStyle
    syncStickStyle();
    syncBtn('fire', btnFire);
    syncBtn('skill', btnSkill);
    syncBtn('interact', btnInteract);
    syncBtn('weapon', btnWeapon);
    syncBtn('pause', btnPause);
    syncBtn('gear', btnGear);
    syncBtn('cheat', btnCheat);
    if (editMode) {
      var els = [btnFire, btnSkill, btnInteract, btnWeapon, btnPause, btnGear, btnCheat];
      for (var i = 0; i < els.length; i++) {
        els[i].style.outline = '2px dashed #ffd54f';
        els[i].style.outlineOffset = '4px';
      }
    }
  }
  syncAll();

  // ---------- 编辑模式 ----------
  function enterEdit() {
    if (editMode) return;
    editMode = true;
    editTarget = null;
    editTargetId = null;
    var els = [btnFire, btnSkill, btnInteract, btnWeapon, btnPause, btnGear, btnCheat];
    for (var i = 0; i < els.length; i++) {
      els[i].style.outline = '2px dashed #ffd54f';
      els[i].style.outlineOffset = '4px';
    }
    // 提示文字
    editHint = document.createElement('div');
    editHint.id = 'mob-edit-hint';
    editHint.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:200;background:rgba(0,0,0,0.8);color:#ffd54f;font-size:13px;padding:6px 16px;border-radius:20px;pointer-events:none;white-space:nowrap;';
    editHint.textContent = '点击按钮选中 · 拖拽调整位置 · 下方滑块调大小 · 齿轮完成';
    document.body.appendChild(editHint);
    // 创建大小滑块
    createEditSlider();
    // 重置按钮
    if (!btnReset) {
      btnReset = document.createElement('div');
      btnReset.id = 'mob-reset';
      btnReset.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:200;background:rgba(239,68,68,0.85);color:#fff;font-size:14px;padding:8px 20px;border-radius:22px;pointer-events:auto;touch-action:none;';
      btnReset.textContent = '恢复默认布局';
      btnReset.addEventListener('touchstart', function (e) {
        e.stopPropagation();
        layout = JSON.parse(JSON.stringify(defaultLayout));
        layout._version = LAYOUT_VERSION;
        saveLayout();
        syncAll();
        clearEditSelection();
      });
      btnReset.addEventListener('click', function (e) {
        e.stopPropagation();
        layout = JSON.parse(JSON.stringify(defaultLayout));
        layout._version = LAYOUT_VERSION;
        saveLayout();
        syncAll();
        clearEditSelection();
      });
      document.body.appendChild(btnReset);
    }
    btnReset.style.display = 'block';
  }

  function createEditSlider() {
    if (editSlider) return;
    var container = document.createElement('div');
    container.id = 'mob-edit-slider';
    container.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:200;background:rgba(0,0,0,0.85);color:#fff;font-size:13px;padding:10px 20px;border-radius:12px;pointer-events:auto;touch-action:none;display:none;align-items:center;gap:12px;white-space:nowrap;';
    editSliderLabel = document.createElement('span');
    editSliderLabel.textContent = '大小:';
    editSliderLabel.style.color = '#94a3b8';
    container.appendChild(editSliderLabel);
    editSlider = document.createElement('input');
    editSlider.type = 'range';
    editSlider.min = '28';
    editSlider.max = '160';
    editSlider.value = '50';
    editSlider.style.cssText = 'width:180px;accent-color:#ffd54f;';
    container.appendChild(editSlider);
    var sizeText = document.createElement('span');
    sizeText.style.cssText = 'color:#ffd54f;min-width:32px;text-align:right;';
    sizeText.textContent = '50';
    editSlider.addEventListener('input', function () {
      var val = parseInt(editSlider.value);
      sizeText.textContent = val;
      if (editTargetId) {
        layout[editTargetId].size = val;
        syncBtn(editTargetId, editTarget);
        saveLayout();
      }
    });
    container.appendChild(sizeText);
    // 阻止滑块上的触摸事件冒泡到画布
    container.addEventListener('touchstart', function (e) { e.stopPropagation(); });
    container.addEventListener('touchmove', function (e) { e.stopPropagation(); });
    document.body.appendChild(container);
  }

  function updateEditSlider() {
    if (!editSlider) return;
    var container = document.getElementById('mob-edit-slider');
    if (editTargetId) {
      editSlider.value = layout[editTargetId].size;
      container.style.display = 'flex';
      // 更新 size text
      var sizeText = container.querySelector('span:last-child');
      if (sizeText) sizeText.textContent = layout[editTargetId].size;
    } else {
      container.style.display = 'none';
    }
  }

  function selectEditTarget(el, id) {
    if (!editMode) return;
    // 清除旧选中
    if (editTarget && editTarget !== el) {
      editTarget.style.outline = '2px dashed #ffd54f';
    }
    editTarget = el;
    editTargetId = id;
    el.style.outline = '3px solid #ffd54f';
    el.style.outlineOffset = '4px';
    updateEditSlider();
  }

  function clearEditSelection() {
    if (editTarget) {
      editTarget.style.outline = '2px dashed #ffd54f';
      editTarget = null;
      editTargetId = null;
    }
    updateEditSlider();
  }

  function exitEdit() {
    if (!editMode) return;
    editMode = false;
    clearEditSelection();
    var els = [btnFire, btnSkill, btnInteract, btnWeapon, btnPause, btnGear, btnCheat];
    for (var i = 0; i < els.length; i++) {
      els[i].style.outline = '';
      els[i].style.outlineOffset = '';
    }
    if (editHint) { editHint.remove(); editHint = null; }
    if (btnReset) btnReset.style.display = 'none';
    var slider = document.getElementById('mob-edit-slider');
    if (slider) slider.style.display = 'none';
    saveLayout();
  }

  // ---------- 按钮拖拽 ----------
  var dragTarget = null;
  var dragStartX = 0, dragStartY = 0;
  var dragOrigX = 0, dragOrigY = 0;
  var dragMoved = false; // 是否发生了拖拽移动

  function getBtnId(el) {
    if (el === btnFire) return 'fire';
    if (el === btnSkill) return 'skill';
    if (el === btnInteract) return 'interact';
    if (el === btnWeapon) return 'weapon';
    if (el === btnPause) return 'pause';
    if (el === btnGear) return 'gear';
    if (el === btnCheat) return 'cheat';
    return null;
  }

  function btnTouchStart(e) {
    if (!editMode) return;
    var el = e.currentTarget;
    dragTarget = el;
    dragMoved = false;
    var t = e.touches[0];
    dragStartX = t.clientX;
    dragStartY = t.clientY;
    dragOrigX = parseFloat(el.style.left) || 0;
    dragOrigY = parseFloat(el.style.top) || 0;
    el.style.transition = 'none';
    e.stopPropagation();
  }

  function btnTouchMove(e) {
    if (!dragTarget) return;
    var t = e.touches[0];
    var dx = t.clientX - dragStartX, dy = t.clientY - dragStartY;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // 小移动忽略
    dragMoved = true;
    var newLeft = dragOrigX + dx;
    var newTop = dragOrigY + dy;
    newLeft = Math.max(0, Math.min(window.innerWidth - dragTarget.offsetWidth, newLeft));
    newTop = Math.max(0, Math.min(window.innerHeight - dragTarget.offsetHeight, newTop));
    dragTarget.style.left = newLeft + 'px';
    dragTarget.style.top = newTop + 'px';
    e.preventDefault();
  }

  function btnTouchEnd(e) {
    if (!dragTarget) return;
    var id = getBtnId(dragTarget);
    if (dragMoved) {
      // 拖拽结束：保存新位置
      if (id) {
        var el = dragTarget;
        var cx = parseFloat(el.style.left) + el.offsetWidth / 2;
        var cy = parseFloat(el.style.top) + el.offsetHeight / 2;
        layout[id].x = Math.round(cx / window.innerWidth * 100);
        layout[id].y = Math.round(cy / window.innerHeight * 100);
        saveLayout();
      }
    } else if (editMode) {
      // 短按：选中按钮（仅在编辑模式下）
      if (id) selectEditTarget(dragTarget, id);
    }
    dragTarget = null;
    dragMoved = false;
  }

  var draggable = [btnFire, btnSkill, btnInteract, btnWeapon, btnPause, btnGear, btnCheat];
  for (var d = 0; d < draggable.length; d++) {
    draggable[d].addEventListener('touchstart', btnTouchStart, { passive: false });
    draggable[d].addEventListener('touchmove', btnTouchMove, { passive: false });
    draggable[d].addEventListener('touchend', btnTouchEnd);
    draggable[d].addEventListener('touchcancel', btnTouchEnd);
  }

  // ---------- 齿轮按钮：进入/退出编辑 ----------
  // 编辑模式：短按选中齿轮按钮，长按 600ms 退出编辑
  // 非编辑模式：短按（非战斗）或长按进入编辑
  var gearTimer = null;
  var gearShort = false;
  var gearHandled = false;
  btnGear.addEventListener('touchstart', function (e) {
    e.stopPropagation();
    gearHandled = false;
    gearShort = true;
    gearTimer = setTimeout(function () {
      gearShort = false;
      gearHandled = true;
      if (editMode) {
        exitEdit();
      } else {
        enterEdit();
      }
      gearTimer = null;
    }, 600);
  });
  btnGear.addEventListener('touchend', function (e) {
    if (gearTimer) { clearTimeout(gearTimer); gearTimer = null; }
    if (gearShort && !gearHandled) {
      gearShort = false;
      gearHandled = true;
      if (editMode) {
        // 编辑模式下短按：选中齿轮按钮
        selectEditTarget(btnGear, 'gear');
      } else if (G.state !== 'game' && G.state !== 'netgame' && G.state !== 'siege') {
        // 非战斗中短按：进入编辑
        enterEdit();
      }
    }
  });
  btnGear.addEventListener('touchmove', function () {
    if (gearTimer) { clearTimeout(gearTimer); gearTimer = null; }
    gearShort = false;
  });
  btnGear.addEventListener('touchcancel', function () {
    if (gearTimer) { clearTimeout(gearTimer); gearTimer = null; }
    gearShort = false;
  });
  btnGear.addEventListener('click', function (e) {
    e.stopPropagation();
    if (gearHandled) return;
    gearHandled = true;
    if (editMode) {
      selectEditTarget(btnGear, 'gear');
    } else if (G.state !== 'game' && G.state !== 'netgame' && G.state !== 'siege') {
      enterEdit();
    }
  });

  // ---------- 开火按钮 ----------
  // 是否处于 UI 覆盖状态（暂停/商店/晶悟），此时应禁用操作按钮
  function uiBlocking() {
    return editMode || G.paused || (G.game && G.game.talentOpen) || (G.game && G.game.player && G.game.player.shopOpen) || (G.game && G.game.shopOpen) || (G.game && G.game.buildMode) || (G.game && G.game.placingDevice) || (G.game && G.game.cheatOpen);
  }
  function setFireDown() {
    if (!G.mouse.down) G.mouse.triggered = true;
    G.mouse.down = true;
  }
  function setFireUp() {
    G.mouse.down = false;
    G.mouse.released = true;
  }

  btnFire.addEventListener('touchstart', function (e) {
    if (uiBlocking()) return;
    e.preventDefault();
    e.stopPropagation();
    fireTouching = true;
    fireId = e.changedTouches[0].identifier;
    setFireDown();
    btnFire.style.background = 'rgba(255,80,80,0.55)';
  });

  btnFire.addEventListener('touchend', function (e) {
    if (editMode) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fireId) {
        fireTouching = false;
        fireId = null;
        setFireUp();
        btnFire.style.background = '';
        return;
      }
    }
  });

  btnFire.addEventListener('touchcancel', function () {
    if (editMode) return;
    fireTouching = false;
    fireId = null;
    setFireUp();
    btnFire.style.background = '';
  });

  // ---------- 技能按钮 ----------
  btnSkill.addEventListener('touchstart', function (e) {
    if (uiBlocking()) return;
    e.preventDefault();
    e.stopPropagation();
    var g = G.game;
    if (g && g.player && !g.player.dead) g.player.useSkill(g);
  });

  // ---------- 交互按钮 ----------
  btnInteract.addEventListener('touchstart', function (e) {
    if (uiBlocking()) return;
    e.preventDefault();
    e.stopPropagation();
    var g = G.game;
    if (g && g.player) G.tryInteract(g, g.player);
  });

  // ---------- 切枪按钮 ----------
  btnWeapon.addEventListener('touchstart', function (e) {
    if (uiBlocking()) return;
    e.preventDefault();
    e.stopPropagation();
    var g = G.game;
    if (g && g.player) g.player.switchWeapon();
  });

  // ---------- 暂停按钮 ----------
  btnPause.addEventListener('touchstart', function (e) {
    if (editMode) return;
    e.preventDefault();
    e.stopPropagation();
    var g = G.game;
    if (g && !g.talentOpen && !(g.player && g.player.shopOpen) && !g.finished) {
      G.paused = !G.paused;
      G.audio.play('click');
    }
  });

  // ---------- 作弊按钮 ----------
  btnCheat.addEventListener('touchstart', function (e) {
    if (editMode) return;
    e.preventDefault();
    e.stopPropagation();
    var g = G.game;
    if (g) {
      g.cheatOpen = !g.cheatOpen;
      G.audio.play('click');
    }
  });

  // ---------- 每帧更新：摇杆→WASD + 瞄准 ----------
  var origUpdate = G.Net && G.Net.tick ? G.Net.tick.bind(G.Net) : null;

  // 自动瞄准缓存：避免每帧遍历所有敌人
  var aimCacheT = 0;
  var aimCacheTarget = null;

  function mobileInputTick() {
    // 仅在战斗状态显示触控 UI
    var inGame = G.state === 'game' || G.state === 'netgame' || G.state === 'siege';
    overlay.style.display = inGame ? '' : 'none';
    if (!inGame || editMode) {
      stickZone.style.pointerEvents = 'auto';
      return;
    }

    var game = G.game;
    // 商店/晶悟/暂停/建造/作弊等 UI 打开时，禁用摇杆区让触摸穿透到画布
    if (!game || G.paused || (game.player && game.player.shopOpen) || game.talentOpen || game.shopOpen || game.buildMode || game.placingDevice || game.cheatOpen) {
      stickZone.style.pointerEvents = 'none';
      return;
    }
    stickZone.style.pointerEvents = 'auto';

    // 摇杆 → WASD
    if (stickActive) {
      G.keys['w'] = stickDY < -0.25;
      G.keys['s'] = stickDY > 0.25;
      G.keys['a'] = stickDX < -0.25;
      G.keys['d'] = stickDX > 0.25;
    } else {
      G.keys['w'] = false;
      G.keys['s'] = false;
      G.keys['a'] = false;
      G.keys['d'] = false;
    }

    if (!game.player) return;

    // 技能按钮显示冷却
    var s = game.player.skill;
    if (s.cdLeft > 0) {
      btnSkill.textContent = s.cdLeft.toFixed(1);
      btnSkill.style.color = '#94a3b8';
    } else {
      btnSkill.textContent = '⚡';
      btnSkill.style.color = '#facc15';
    }

    // 开火时自动瞄准最近敌人（10Hz 缓存，减少遍历）
    if (fireTouching) {
      aimCacheT -= 1 / 60; // 近似帧时间
      if (aimCacheT <= 0) {
        aimCacheT = 0.1;
        aimCacheTarget = null;
        var nearestDist = Infinity;
        for (var i = 0; i < game.enemies.length; i++) {
          var e = game.enemies[i];
          if (e.dead) continue;
          var d = G.dist(game.player.x, game.player.y, e.x, e.y);
          if (d < nearestDist) { nearestDist = d; aimCacheTarget = e; }
        }
      }
      if (aimCacheTarget) {
        G.mouse.x = aimCacheTarget.x - game.cam.x;
        G.mouse.y = aimCacheTarget.y - game.cam.y;
        return;
      }
    } else {
      aimCacheT = 0;
      aimCacheTarget = null;
    }

    // 瞄准方向：摇杆方向
    if (stickActive && (Math.abs(stickDX) > 0.1 || Math.abs(stickDY) > 0.1)) {
      var aimAngle = Math.atan2(stickDY, stickDX);
      var p = game.player;
      var aimDist = 200;
      G.mouse.x = (p.x + Math.cos(aimAngle) * aimDist) - game.cam.x;
      G.mouse.y = (p.y + Math.sin(aimAngle) * aimDist) - game.cam.y;
    }
  }

  // 注入到主循环：在 update 之前执行
  var origLoop = null;
  // 用 MutationObserver 或直接 hook 太 hack，改为在 main.js 中调用
  // 这里暴露一个 tick 函数给 main.js 调用
  G.mobileTick = mobileInputTick;

  // ---------- 画布触摸 → 进入全屏 ----------
  if (canvas) {
    canvas.addEventListener('touchstart', function (e) {
      if (editMode) return;
      G.audio.unlock();
      if (!isFullscreen()) requestFullscreen();
    }, { passive: true });
  }

  // ---------- 画布触摸 → G.mouse.clicked（菜单/UI 交互） ----------
  if (canvas) {
    canvas.addEventListener('touchstart', function (e) {
      if (editMode) return;
      // 如果触摸在按钮区域，不处理
      if (e.target !== canvas) return;
      var rect = canvas.getBoundingClientRect();
      var v = G.view;
      if (!v) return;
      var t = e.changedTouches[0];
      var lx = (t.clientX - rect.left - v.offX) / v.scale;
      var ly = (t.clientY - rect.top - v.offY) / v.scale;
      // 非战斗状态/暂停/商店/晶悟等 UI 会居中偏移，需要补偿 uiX
      var uiX = Math.max(0, (G.vw - G.W) / 2);
      if (G.paused || G.state === 'siege' || (G.state !== 'game' && G.state !== 'netgame' && G.state !== 'siege')
          || (G.game && (G.game.talentOpen || (G.game.player && G.game.player.shopOpen) || G.game.shopOpen || G.game.buildMode))) {
        lx -= uiX;
      }
      G.mouse.x = G.clamp(lx, 0, G.vw);
      G.mouse.y = G.clamp(ly, 0, G.vh);
      G.mouse.clicked = true;
      G.mouse.down = true;
      G.mouse.triggered = true;
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      if (editMode) return;
      if (e.target !== canvas) return;
      var rect = canvas.getBoundingClientRect();
      var v = G.view;
      if (!v) return;
      var t = e.changedTouches[0];
      var lx = (t.clientX - rect.left - v.offX) / v.scale;
      var ly = (t.clientY - rect.top - v.offY) / v.scale;
      var uiX = Math.max(0, (G.vw - G.W) / 2);
      if (G.paused || G.state === 'siege' || (G.state !== 'game' && G.state !== 'netgame' && G.state !== 'siege')
          || (G.game && (G.game.talentOpen || (G.game.player && G.game.player.shopOpen) || G.game.shopOpen || G.game.buildMode))) {
        lx -= uiX;
      }
      G.mouse.x = G.clamp(lx, 0, G.vw);
      G.mouse.y = G.clamp(ly, 0, G.vh);
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
      if (editMode) return;
      G.mouse.down = false;
      G.mouse.released = true;
    });
  }

  // ---------- resize 时同步 ----------
  window.addEventListener('resize', function () {
    syncAll();
    if (stickActive) {
      // 简单隐藏摇杆，等下次触摸重新激活
      stickId = null;
      stickBase.style.display = 'none';
      stickThumb.style.display = 'none';
      stickDX = 0; stickDY = 0;
      stickActive = false;
    }
  });

  console.log('[mobile] 触控系统已激活');
})();