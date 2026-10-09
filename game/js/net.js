/**
 * 晶域守卫者 · 联机客户端 (v3 rewrite)
 *
 * 架构：
 *   Transport  — WebSocket 连接、消息队列、ping/pong 延迟/抖动/丢包统计
 *   Lobby      — 大厅面板、房间管理
 *   Interp     — 快照抖动缓冲、自适应渲染延迟、双快照时间插值
 *   Prediction — 本地移动/技能/子弹预测、输入 seq + 服务端 ack 重调和
 *   Hooks      — 联机时覆盖单人模式的商店/晶悟/交互/技能/切枪
 *
 * 同步模型（与服务端 v3 对应）：
 *   - 服务端权威模拟，30Hz 全量快照（msg.seq 单调递增）
 *   - 客户端输入带单调 seq，快照中每个玩家回带 ack；
 *     自机位置 = 服务端位置(ack 时刻) + 重放未确认输入（移动重调和）
 *     ack 不可用（ack=0，如测试环境）时退化为温和校正
 *   - 自机子弹本地预测生成，快照到达后按距离配对转为权威子弹；
 *     不做强制吸附，仅在大偏差(>200px)时跳变
 *   - 远程实体（敌人/其他玩家/宠物/子弹）在快照缓冲中做时间插值，
 *     渲染延迟根据快照到达间隔自适应（2×间隔，50~160ms）
 */
(function () {
  'use strict';
  var G = window.G;

  // ============================================================
  //  常量
  // ============================================================
  var INPUT_INTERVAL = 1 / 30;   // 输入上报间隔
  var IDLE_INTERVAL = 0.2;       // 死亡/暂停时的输入心跳间隔
  var SNAP_BUF_MAX = 60;         // 快照缓冲上限（2秒@30Hz，防止网络抖动耗尽）
  var PRED_LIFE = 1.5;           // 预测子弹本地存活时间（覆盖常见网络波动）
  var TELEPORT_DIST = 600;       // 插值瞬移阈值
  var RECON_MIN_ERR = 4;         // 重调和回写的最小误差（防抖动）
  var MAX_EXTRAPOLATE = 1.5;     // 插值允许的最大外推系数
  var CULL_MARGIN = 400;         // 视口外裁剪边距（px），超出此范围的实体跳过插值

  // ============================================================
  //  会话状态
  // ============================================================
  var ws = null;
  var connected = false;
  var selfId = null;
  var roomId = null;
  var hostId = null;
  var roomState = 'waiting';
  var active = false;      // 联机对局中
  var inSession = false;   // 曾进入联机局（结算界面返回大厅用）
  var name = '';
  var charId = 'warden';
  var lobbyPlayers = [];
  var panel = null;
  var origHooks = null;

  var Net = {
    get active() { return active; },
    get inSession() { return inSession; },
    get selfId() { return selfId; },
    get hostId() { return hostId; },
    get connected() { return connected; }
  };
  G.Net = Net;

  // ============================================================
  //  Transport — 连接 + 消息队列 + 延迟统计
  // ============================================================
  var outbox = [];         // 连接建立前的待发消息
  var pingTimer = null;
  var uiTimer = null;
  var pingSeq = 0;
  var rttAvg = 0;
  var jitterAvg = 0;
  var rttSamples = 0;
  var lossCount = 0;
  var ackedCount = 0;
  var pingWindow = [];

  function send(obj) {
    if (!ws) return;
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    else if (ws.readyState === 0) {
      outbox.push(obj);
      if (outbox.length > 20) outbox.shift();
    }
  }

  function connect() {
    if (ws) return;
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    var url = proto + '://' + location.host + '/ws';
    try { ws = new WebSocket(url); } catch (e) {
      setStatus('无法连接服务器', '#f87171');
      return;
    }
    ws.onopen = function () {
      connected = true;
      setStatus('已连接服务器', '#4ade80');
      for (var i = 0; i < outbox.length; i++) send(outbox[i]);
      outbox.length = 0;
      send({ type: 'list' });
      startPingRoutine();
    };
    ws.onclose = function () {
      connected = false;
      ws = null;
      stopPingRoutine();
      hideLatencyUI();
      setStatus('连接已断开', '#f87171');
      if (active || inSession) backToLobby(true);
    };
    ws.onerror = function () { setStatus('连接错误', '#f87171'); };
    ws.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      dispatch(data);
    };
  }

  function startPingRoutine() {
    stopPingRoutine();
    pingTimer = setInterval(sendPing, 1000);
    uiTimer = setInterval(updateLatencyUI, 500);
    sendPing();
  }

  function stopPingRoutine() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (uiTimer) { clearInterval(uiTimer); uiTimer = null; }
  }

  function sendPing() {
    if (!ws || ws.readyState !== 1) return;
    var item = { seq: ++pingSeq, t: performance.now(), ok: false };
    pingWindow.push(item);
    if (pingWindow.length > 20) {
      var dropped = pingWindow.shift();
      if (!dropped.ok) lossCount++;
    }
    send({ type: 'ping', seq: item.seq, t: item.t });
  }

  function handlePong(data) {
    var it = null;
    for (var i = 0; i < pingWindow.length; i++) {
      if (pingWindow[i].seq === data.seq && !pingWindow[i].ok) { it = pingWindow[i]; break; }
    }
    if (!it) return;
    it.ok = true;
    ackedCount++;
    var sample = performance.now() - it.t;
    if (rttSamples === 0) {
      rttAvg = sample;
    } else {
      jitterAvg = jitterAvg * 0.75 + Math.abs(sample - rttAvg) * 0.25;
      rttAvg = rttAvg * 0.75 + sample * 0.25;
    }
    rttSamples++;
    updateLatencyUI();
  }

  function buildLatencyUI() {
    var el = document.getElementById('net-latency');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'net-latency';
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;pointer-events:none;font:600 12px/1.5 Consolas,monospace;color:#e2e8f0;background:rgba(15,23,42,.78);border:1px solid rgba(148,163,184,.3);padding:5px 11px;border-radius:8px;display:none;white-space:nowrap;';
    document.body.appendChild(el);
    return el;
  }

  function hideLatencyUI() {
    var el = document.getElementById('net-latency');
    if (el) el.style.display = 'none';
  }

  function updateLatencyUI() {
    var el = buildLatencyUI();
    if (!connected) { hideLatencyUI(); return; }
    var total = ackedCount + lossCount;
    var loss = total > 0 ? lossCount / total * 100 : 0;
    var color = (loss > 10 || rttAvg > 250) ? '#f87171' : ((loss > 3 || rttAvg > 120) ? '#fbbf24' : '#4ade80');
    el.style.display = 'block';
    el.innerHTML = '延迟 <b style="color:' + color + '">' + Math.round(rttAvg) + ' ms</b>' +
      ' · 抖动 <b style="color:' + color + '">' + Math.round(jitterAvg) + ' ms</b>' +
      ' · 丢包 <b style="color:' + color + '">' + loss.toFixed(0) + '%</b>';
  }

  // ============================================================
  //  Lobby — 大厅面板 + 房间管理
  // ============================================================
  function setStatus(text, color) {
    var el = panel && panel.querySelector('#net-status');
    if (el) { el.textContent = text; el.style.color = color || '#94a3b8'; }
  }

  function setErr(msg) {
    var el = buildPanel().querySelector('#net-err');
    if (el) el.textContent = msg || '';
  }

  function showPanel() { buildPanel().style.display = 'block'; }
  function hidePanel() { buildPanel().style.display = 'none'; }

  function loadSavedName() {
    try { return localStorage.getItem('yqq_net_name'); } catch (e) { return null; }
  }

  function applyLobbyForm() {
    var p = buildPanel();
    name = p.querySelector('#net-name').value.trim() || '玩家';
    charId = p.querySelector('#net-char').value || 'warden';
    try { localStorage.setItem('yqq_net_name', name); } catch (e) {}
  }

  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'net-panel';
    panel.innerHTML =
      '<div class="np-title">联机大厅</div>' +
      '<div class="np-status" id="net-status">未连接</div>' +
      '<div class="np-row"><label>昵称</label><input id="net-name" maxlength="12" placeholder="玩家"></div>' +
      '<div class="np-row"><label>角色</label><select id="net-char"></select></div>' +
      '<div class="np-row">' +
      '  <button id="net-create">创建房间</button>' +
      '  <input id="net-join-id" placeholder="房间号" maxlength="8">' +
      '  <button id="net-join">加入</button>' +
      '  <button id="net-refresh">刷新</button>' +
      '</div>' +
      '<div class="np-rooms" id="net-rooms"><div class="np-hint">暂无等待中的房间</div></div>' +
      '<div class="np-room" id="net-room-panel" style="display:none">' +
      '  <div class="np-roomid">房间号 <b id="net-room-id"></b> <span id="net-room-state"></span></div>' +
      '  <div class="np-players" id="net-players"></div>' +
      '  <div class="np-row"><button id="net-start">开始游戏</button><button id="net-leave">离开房间</button></div>' +
      '</div>' +
      '<div class="np-row np-err" id="net-err"></div>' +
      '<div class="np-foot"><button id="net-back">返回主菜单</button></div>' +
      '<div class="np-tip">提示: 需要 2~4 人 · 房主选择晶悟，效果全员生效</div>';
    document.body.appendChild(panel);

    var sel = panel.querySelector('#net-char');
    for (var i = 0; i < G.CHARACTERS.length; i++) {
      var c = G.CHARACTERS[i];
      var opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.emoji + ' ' + c.name;
      sel.appendChild(opt);
    }
    panel.querySelector('#net-name').value = loadSavedName() || '玩家' + Math.floor(100 + Math.random() * 900);
    sel.value = charId;

    panel.querySelector('#net-create').onclick = function () {
      G.audio.unlock(); applyLobbyForm();
      if (!ws) connect();
      send({ type: 'create', name: name, charId: charId });
    };
    panel.querySelector('#net-join').onclick = function () {
      G.audio.unlock(); applyLobbyForm();
      var rid = panel.querySelector('#net-join-id').value.trim();
      if (!rid) { setErr('请输入房间号'); return; }
      if (!ws) connect();
      send({ type: 'join', roomId: rid, name: name, charId: charId });
    };
    panel.querySelector('#net-refresh').onclick = function () { send({ type: 'list' }); };
    panel.querySelector('#net-start').onclick = function () { G.audio.unlock(); send({ type: 'start' }); };
    panel.querySelector('#net-leave').onclick = function () {
      if (active) { backToLobby(); return; }
      send({ type: 'leave' });
      roomId = null; hostId = null; roomState = 'waiting';
      renderRoomPanel(null);
    };
    panel.querySelector('#net-back').onclick = function () {
      if (active) backToLobby();
      else {
        if (ws) send({ type: 'leave' });
        hidePanel();
        G.state = 'menu';
      }
    };
    return panel;
  }

  function renderRooms(rooms) {
    var box = buildPanel().querySelector('#net-rooms');
    if (!rooms.length) { box.innerHTML = '<div class="np-hint">暂无等待中的房间</div>'; return; }
    box.innerHTML = '';
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      var row = document.createElement('div');
      row.className = 'np-roomrow';
      row.innerHTML = '<span class="np-rid">房间 ' + r.roomId + '</span>' +
        '<span>' + r.players + '/' + r.max + ' 人</span>' +
        '<span>房主: ' + r.host + '</span>' +
        '<button class="np-joinbtn">加入</button>';
      row.querySelector('.np-joinbtn').onclick = (function (rid) { return function () {
        G.audio.unlock(); applyLobbyForm();
        if (!ws) connect();
        send({ type: 'join', roomId: rid, name: name, charId: charId });
      }; })(r.roomId);
      box.appendChild(row);
    }
  }

  function renderRoomPanel(players) {
    var p = buildPanel();
    var panelBox = p.querySelector('#net-room-panel');
    if (!roomId) { panelBox.style.display = 'none'; return; }
    panelBox.style.display = 'block';
    p.querySelector('#net-room-id').textContent = roomId;
    var st = p.querySelector('#net-room-state');
    st.textContent = roomState === 'playing' ? '游戏中' : '等待中';
    st.style.color = roomState === 'playing' ? '#4ade80' : '#fbbf24';
    var box = p.querySelector('#net-players');
    box.innerHTML = '';
    var list = players || lobbyPlayers;
    for (var i = 0; i < list.length; i++) {
      var pl = list[i];
      var c = null;
      for (var j = 0; j < G.CHARACTERS.length; j++) {
        if (G.CHARACTERS[j].id === pl.charId) { c = G.CHARACTERS[j]; break; }
      }
      var row = document.createElement('div');
      row.className = 'np-playerrow';
      row.innerHTML = '<span>' + (c ? c.emoji : '') + ' ' + pl.name + (pl.host ? ' (房主)' : '') + (pl.id === selfId ? ' <i>(你)</i>' : '') + '</span>';
      box.appendChild(row);
    }
    p.querySelector('#net-start').style.display = (roomState === 'waiting' && selfId === hostId) ? 'inline-block' : 'none';
  }

  // ============================================================
  //  Interp — 快照缓冲 + 自适应渲染延迟 + 时间插值
  // ============================================================
  var snapBuf = [];
  var renderT = 0;
  var clockInit = false;
  var renderDelay = 100;     // 自适应：快照到达间隔 ×2，限制在 50~160ms
  var lastArrival = 0;
  var arrivalEma = 0;

  function resetInterp() {
    snapBuf.length = 0;
    clockInit = false;
  }

  function pushSnapshot(snap) {
    var now = performance.now();
    if (lastArrival) {
      var iv = now - lastArrival;
      if (iv > 0 && iv < 1000) {
        // 更慢的 EMA（0.95），避免 renderDelay 抖动导致插值速度变化
        arrivalEma = arrivalEma ? arrivalEma * 0.95 + iv * 0.05 : iv;
        renderDelay = G.clamp(arrivalEma * 2, 50, 200);
      }
    }
    lastArrival = now;
    var newest = snapBuf[snapBuf.length - 1];
    if (newest && snap.t < newest.t) return; // 过期乱序快照直接丢弃
    snapBuf.push(snap);
    if (snapBuf.length > SNAP_BUF_MAX) snapBuf.shift();
  }

  // 渲染时钟：跟随快照时间轴，平滑追帧，不越过最新快照
  function advanceClock(dt) {
    if (!snapBuf.length) return;
    var newest = snapBuf[snapBuf.length - 1].t;
    if (!clockInit) { renderT = newest - renderDelay; clockInit = true; return; }
    var target = newest - renderDelay;
    // 落后过多时加速追赶（每秒追赶 40% 差距），避免跳跃
    var behind = target - renderT;
    if (behind > 50) {
      renderT += dt * 1000 + behind * Math.min(1, 4 * dt);
    } else {
      renderT += dt * 1000;
    }
    // 不能越过最新快照
    if (renderT > newest - 20) renderT = newest - 20;
    // 极端落后（>1秒）：直接跳到目标，否则会一直追赶
    if (target - renderT > 1000) renderT = target;
  }

  function dist2(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerpEntities(g, dt) {
    // 自机已确认子弹：速度外推（不依赖快照缓冲）
    for (var i = 0; i < g.bullets.length; i++) {
      var sb = g.bullets[i];
      if (!sb._local && sb.owner === selfId) {
        sb.x += sb.vx * dt;
        sb.y += sb.vy * dt;
      }
    }

    var n = snapBuf.length;
    if (n < 2) return; // 单快照：applySnapshot 已直接落位

    // 找到包围 renderT 的两个快照
    var a = null, b = null;
    for (i = 0; i < n; i++) {
      if (snapBuf[i].t <= renderT) a = snapBuf[i];
      if (snapBuf[i].t >= renderT && !b) b = snapBuf[i];
    }
    if (!a) a = b || snapBuf[n - 1];
    if (!b) { b = a; a = snapBuf[n - 2] || b; }
    if (!a || !b) return;
    var span = Math.max(1, b.t - a.t);
    var f = Math.min((renderT - a.t) / span, MAX_EXTRAPOLATE);

    // 视口范围（用于裁剪不可见实体）
    var cam = g.cam;
    var vx1 = cam.x - CULL_MARGIN, vy1 = cam.y - CULL_MARGIN;
    var vx2 = cam.x + G.vw + CULL_MARGIN, vy2 = cam.y + G.vh + CULL_MARGIN;

    // ——— 敌人插值 ———
    var ma = indexById(a.enemies), mb = indexById(b.enemies);
    for (var i2 = 0; i2 < g.enemies.length; i2++) {
      var e = g.enemies[i2];
      var ea = ma[e.id], eb = mb[e.id];
      if (ea && eb) {
        // 裁剪：两帧都在视口外则跳过
        if (ea.x < vx1 && eb.x < vx1 || ea.x > vx2 && eb.x > vx2 ||
            ea.y < vy1 && eb.y < vy1 || ea.y > vy2 && eb.y > vy2) continue;
        if (dist2(ea.x, ea.y, eb.x, eb.y) > TELEPORT_DIST) { e.x = eb.x; e.y = eb.y; }
        else { e.x = ea.x + (eb.x - ea.x) * f; e.y = ea.y + (eb.y - ea.y) * f; }
      } else if (eb) { e.x = eb.x; e.y = eb.y; }
    }

    // ——— 远程子弹插值（自机子弹已在上面外推）———
    ma = indexById(a.bullets); mb = indexById(b.bullets);
    for (i2 = 0; i2 < g.bullets.length; i2++) {
      var bl = g.bullets[i2];
      if (bl._local || bl.owner === selfId) continue;
      var ba = ma[bl.id], bb = mb[bl.id];
      if (ba && bb) {
        bl.x = ba.x + (bb.x - ba.x) * f;
        bl.y = ba.y + (bb.y - ba.y) * f;
      } else if (bb) {
        var back = Math.min(66, Math.max(0, b.t - renderT)) / 1000;
        bl.x = bb.x - bb.vx * back;
        bl.y = bb.y - bb.vy * back;
      }
    }

    // ——— 玩家 + 宠物插值（自机身体由预测驱动，宠物仍走插值）———
    ma = indexById(a.players); mb = indexById(b.players);
    for (i2 = 0; i2 < g.players.length; i2++) {
      var pp = g.players[i2];
      var pa = ma[pp.id], pb = mb[pp.id];
      if (pp.id !== selfId) {
        if (pa && pb) {
          if (dist2(pa.x, pa.y, pb.x, pb.y) > TELEPORT_DIST) { pp.x = pb.x; pp.y = pb.y; }
          else { pp.x = pa.x + (pb.x - pa.x) * f; pp.y = pa.y + (pb.y - pa.y) * f; }
        } else if (pb) { pp.x = pb.x; pp.y = pb.y; }
      }
      var pet = pp.pet;
      if (pet) {
        var ta = pa && pa.pet, tb = pb && pb.pet;
        if (ta && tb) {
          if (dist2(ta.x, ta.y, tb.x, tb.y) > TELEPORT_DIST) { pet.x = tb.x; pet.y = tb.y; }
          else { pet.x = ta.x + (tb.x - ta.x) * f; pet.y = ta.y + (tb.y - ta.y) * f; }
        } else if (tb) { pet.x = tb.x; pet.y = tb.y; }
      }
    }
  }

  // 将实体数组按 id 索引为 {id: entity}，复用同一对象减少 GC
  function indexById(arr) {
    var m = {};
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it && it.id !== undefined) m[it.id] = it;
    }
    return m;
  }

  // ============================================================
  //  GameState — 快照应用 + 状态构建
  // ============================================================
  function initGame(snap) {
    resetInterp();
    resetPrediction();
    var g = {
      player: null, players: [], room: null, enemies: [], bullets: [], pickups: [], allies: [],
      cam: { x: 0, y: 0 }, time: snap.t / 1000,
      floor: snap.floor, kills: snap.kills, bossKills: snap.bossKills, gemsEarned: snap.gemsEarned,
      banner: snap.banner, bossLockMsg: snap.bossLockMsg, bossLockMsgT: snap.bossLockMsgT,
      finished: false, win: false, playerDead: false, playerDeadT: 0,
      talentOpen: false, talentChoices: [], replaceConfirm: null,
      interactHint: null, dungeon: null
    };
    G.game = g;
    applySnapshot(snap);
  }

  function buildDungeon(d) {
    var dungeon = {
      gridW: d.gridW, gridH: d.gridH, bossCell: d.bossCell, bossUnlocked: d.bossUnlocked,
      rooms: d.rooms, roomOf: {}
    };
    for (var i = 0; i < d.rooms.length; i++) {
      var rr = d.rooms[i];
      dungeon.roomOf[rr.id] = {
        id: rr.id, gx: rr.gx, gy: rr.gy, x: rr.x, y: rr.y, w: rr.w, h: rr.h,
        type: rr.type, cleared: rr.cleared, visited: rr.visited,
        doors: {
          up: rr.doors.up ? { to: rr.doors.up } : null,
          down: rr.doors.down ? { to: rr.doors.down } : null,
          left: rr.doors.left ? { to: rr.doors.left } : null,
          right: rr.doors.right ? { to: rr.doors.right } : null
        }
      };
    }
    return dungeon;
  }

  function applySnapshot(snap) {
    var g = G.game;
    if (!g) return;

    // 房间/楼层变化：清空插值缓冲，全部立即对齐
    var prevRoomId = g.room && g.room.id;
    var roomChanged = (g.floor !== undefined && snap.floor !== g.floor) ||
                      (!!prevRoomId && !!snap.room && snap.room.id !== prevRoomId);
    if (roomChanged) resetInterp();
    pushSnapshot(snap);

    // ——— 房间静态数据 ———
    g.room = snap.room;
    g.room.pickups = snap.pickups;
    g.pickups = snap.pickups;
    if (snap.dungeon) g.dungeon = buildDungeon(snap.dungeon);

    // ——— 敌人：保留插值位置（房间变化时直接落位）———
    var oldEnemies = {};
    for (var i = 0; i < g.enemies.length; i++) {
      if (g.enemies[i].id !== undefined) oldEnemies[g.enemies[i].id] = g.enemies[i];
    }
    g.enemies = snap.enemies.map(function (e) {
      var ne = Object.assign({}, e);
      var old = oldEnemies[e.id];
      if (!roomChanged && old && old.x !== undefined) { ne.x = old.x; ne.y = old.y; }
      return ne;
    });
    g.room.enemies = g.enemies;

    syncBullets(g, snap, roomChanged);

    // ——— 玩家 ———
    var oldPlayers = {};
    if (g.players) {
      for (i = 0; i < g.players.length; i++) oldPlayers[g.players[i].id] = g.players[i];
    }
    g.players = snap.players.map(function (sp) {
      return materializePlayer(sp, oldPlayers[sp.id], roomChanged);
    });
    syncSelf(g, snap, roomChanged);

    // ——— 掉落物 + 宠物(盟友炮塔) ———
    g.allies = snap.allies;

    // ——— 音效事件（距离过远不播）———
    if (snap.audio && snap.audio.length && !G.paused &&
        snap.state !== 'gameover' && snap.state !== 'victory') {
      var me = g.player;
      for (i = 0; i < snap.audio.length; i++) {
        var ev = snap.audio[i];
        if (!ev || !ev.n) continue;
        if (me && typeof ev.x === 'number' && G.dist(me.x, me.y, ev.x, ev.y) > 1100) continue;
        G.audio.play(ev.n);
      }
    }

    // ——— 全局状态 ———
    g.floor = snap.floor;
    g.kills = snap.kills;
    g.bossKills = snap.bossKills;
    g.banner = snap.banner;
    g.bossLockMsg = snap.bossLockMsg;
    g.bossLockMsgT = snap.bossLockMsgT;
    g.time = snap.t / 1000;
    g.finished = snap.state === 'gameover' || snap.state === 'victory';
    g.win = snap.win;
    g.gemsEarned = snap.gemsEarned;
    g.talentOpen = snap.talentOpen && selfId === hostId;
    g.talentChoices = (snap.talentChoices || []).map(function (id) {
      return G.TALENTS.find(function (t) { return t.id === id; });
    }).filter(Boolean);
    G.netTalentWait = snap.talentOpen && !g.talentOpen;
    if (!(g.player && g.player.shopOpen)) g.replaceConfirm = null;
    g.playerDead = !!(g.player && g.player.dead);
  }

  // 子弹彻底解耦：本地预测只管视觉飞行，服务端只管伤害结算
  // 本地子弹原样保留，服务端子弹只加入他人的（自机子弹由本地预测驱动）
  function syncBullets(g, snap, roomChanged) {
    var kept = [];
    var i;

    // 保留所有本地预测子弹（纯视觉）
    for (i = 0; i < g.bullets.length; i++) {
      if (g.bullets[i]._local) kept.push(g.bullets[i]);
    }

    // 只加入他人的服务端子弹，自机子弹跳过（由本地预测驱动）
    for (i = 0; i < snap.bullets.length; i++) {
      var b = snap.bullets[i];
      if (!b || b.owner === selfId) continue;
      kept.push(Object.assign({}, b));
    }
    g.bullets = kept;
  }

  function materializePlayer(sp, old, roomChanged) {
    var np = Object.assign({}, sp, {
      weapon: function () { return this.weapons[this.cur] || null; },
      fireRateMult: sp.fireRateMult || 1,
      dmgMult: sp.dmgMult || 1,
      crit: sp.crit || 0,
      energyRegen: sp.energyRegen || 0
    });
    if (np.pet) np.pet = Object.assign({}, np.pet);
    if (!roomChanged && old && old.x !== undefined) {
      np.x = old.x; np.y = old.y;
      if (np.pet && old.pet && old.pet.x !== undefined) { np.pet.x = old.pet.x; np.pet.y = old.pet.y; }
    }
    return np;
  }

  // 自机：本地预测位置 vs 服务端位置的调和
  function syncSelf(g, snap, roomChanged) {
    var idx = -1;
    for (var i = 0; i < snap.players.length; i++) {
      if (snap.players[i].id === selfId) { idx = i; break; }
    }
    if (idx < 0) idx = 0;
    var self = g.players[idx];
    var sp = snap.players[idx];
    if (!self || !sp) { g.player = self || null; return; }

    var old = g.player;
    if (old && old._predW) self._predW = old._predW;
    // 冲刺状态以本地为准（持续时间很短，避免来回拉扯）
    if (old && old.dashT > 0 && self.dashT > 0) {
      self.dashT = old.dashT; self.dashDx = old.dashDx; self.dashDy = old.dashDy;
      self.invuln = Math.max(old.invuln || 0, self.invuln || 0);
    }
    if (old && old.x !== undefined && !roomChanged) {
      if (old.dashT > 0) {
        self.x = old.x; self.y = old.y;
      } else if (sp.ack > 0) {
        reconcileSelf(self, sp, old);
      } else {
        gentleSelf(self, sp, old);
      }
    }
    g.player = self;
  }

  // ack 不可用时的退化策略：大偏差跳变，小偏差平滑校正
  function gentleSelf(self, sp, old) {
    var ex = sp.x - old.x, ey = sp.y - old.y;
    var err = Math.hypot(ex, ey);
    if (err > 600) { self.x = sp.x; self.y = sp.y; }           // 大偏差直接跳
    else if (err > 20) { self.x = old.x + ex * 0.08; self.y = old.y + ey * 0.08; }  // 温和 8% 校正
    else { self.x = old.x; self.y = old.y; }                     // 微小误差忽略
  }

  // 重调和：服务端位置(ack 时刻) + 重放未确认输入，平滑校正
  function reconcileSelf(self, sp, old) {
    while (pendingInputs.length && pendingInputs[0].seq <= sp.ack) pendingInputs.shift();
    var sim = { x: sp.x, y: sp.y, r: self.r, speed: self.speed, moveMult: self.moveMult };
    for (var i = 0; i < pendingInputs.length; i++) {
      integrateMove(sim, pendingInputs[i].keys, pendingInputs[i].dt);
    }
    var err = Math.hypot(sim.x - old.x, sim.y - old.y);
    if (err > RECON_MIN_ERR) {
      // 平滑校正：用 lerp 替代直接跳变，避免移动抖动
      var t = Math.min(1, err > 100 ? 0.3 : 0.12);
      self.x = G.lerp(old.x, sim.x, t);
      self.y = G.lerp(old.y, sim.y, t);
    } else {
      self.x = old.x; self.y = old.y;
    }
  }

  // ============================================================
  //  Prediction — 本地移动/技能/子弹预测 + 输入上报
  // ============================================================
  var inputSeq = 0;
  var pendingInputs = [];
  var inputAcc = INPUT_INTERVAL;
  var idleAcc = 0;
  var lastFiring = false;
  var prevSpace = false;
  var prevQ = false;
  var lastMouseDown = false;
  var queuedSkill = false;
  var queuedSwitch = false;
  var predSeq = 0;
  var predAcc = INPUT_INTERVAL;  // 子弹预测累加器，30Hz 节流

  function resetPrediction() {
    inputSeq = 0;
    pendingInputs.length = 0;
    inputAcc = INPUT_INTERVAL;
    idleAcc = 0;
    lastFiring = false;
    prevSpace = false;
    prevQ = false;
    lastMouseDown = false;
    queuedSkill = false;
    queuedSwitch = false;
    predAcc = INPUT_INTERVAL;
  }

  // 与服务端 player.js 相同的移动 + 碰撞规则
  function integrateMove(s, keys, dt) {
    var dx = 0, dy = 0;
    if (keys.w) dy -= 1;
    if (keys.s) dy += 1;
    if (keys.a) dx -= 1;
    if (keys.d) dx += 1;
    var len = Math.hypot(dx, dy);
    if (len > 0) {
      var spd = s.speed * (s.moveMult || 1) * dt;
      s.x += dx / len * spd;
      s.y += dy / len * spd;
    }
    collideRoom(s);
  }

  function collideRoom(s) {
    var g = G.game;
    var r = g && g.room;
    if (!r) return;
    s.x = G.clamp(s.x, r.x + 16, r.x + r.w - 16);
    s.y = G.clamp(s.y, r.y + 16, r.y + r.h - 16);
    var obs = r.obstacles || [];
    for (var i = 0; i < obs.length; i++) {
      var ob = obs[i];
      if (!ob || ob.dead) continue;
      var d = Math.hypot(s.x - ob.x, s.y - ob.y);
      var min = (s.r || 14) + (ob.r || 20);
      if (d < min && d > 0) {
        s.x += (s.x - ob.x) / d * (min - d);
        s.y += (s.y - ob.y) / d * (min - d);
      }
    }
  }

  function updateCamLocal(g, dt) {
    var r = g.room;
    var padX = 140, padY = 140;
    var minX = Math.min(r.x - padX, r.x + r.w - G.vw + padX);
    var maxX = Math.max(r.x - padX, r.x + r.w - G.vw + padX);
    var minY = Math.min(r.y - padY, r.y + r.h - G.vh + padY);
    var maxY = Math.max(r.y - padY, r.y + r.h - G.vh + padY);
    var p = g.player;
    var tx = G.clamp(p.x - G.vw / 2, minX, maxX);
    var ty = G.clamp(p.y - G.vh / 2, minY, maxY);
    if (g.cam.x === undefined) g.cam = { x: tx, y: ty };
    g.cam.x = G.lerp(g.cam.x, tx, Math.min(1, 8 * dt));
    g.cam.y = G.lerp(g.cam.y, ty, Math.min(1, 8 * dt));
  }

  // 技能本地预测（键盘边沿 / 手机按钮共用）
  function trySkillLocal(self) {
    var s = self.skill;
    if (!s || !s.id || s.cdLeft > 0 || self.dead) return;
    if (self.energy < (s.cost || 0)) { G.audio.play('dry'); return; }
    applySkillLocal(self, s.id);
    queuedSkill = true;
  }

  function applySkillLocal(self, skillId) {
    if (skillId === 'roll' || skillId === 'dash') {
      var keys = G.keys;
      var dx = 0, dy = 0;
      if (skillId === 'roll') {
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;
      }
      if (!dx && !dy) { dx = Math.cos(self.aimAngle); dy = Math.sin(self.aimAngle); }
      var len = Math.hypot(dx, dy) || 1;
      self.dashDx = dx / len; self.dashDy = dy / len;
      self.dashT = skillId === 'roll' ? 0.22 : 0.18;
      self.invuln = skillId === 'roll' ? 0.5 : 0.35;
    } else if (skillId === 'fury') {
      self.fireBuffT = 4;
    } else if (skillId === 'heal') {
      self.healOverT = 3;
    }
    self.skill.cdLeft = self.skill.cd || 10;
    self.energy -= self.skill.cost || 0;
  }

  // 自机子弹预测：直接运行真实武器逻辑生成子弹，静音 + 不耗能量
  function predictBullets(self, g, dt) {
    if (self.dead || !self.weapons || !self.weapons.length || !G.Weapon) return;
    var wdef = self.weapons[self.cur] || self.weapons[0];
    if (!wdef || !wdef.type || wdef.type === 'melee') return;
    if (!self._predW || self._predW.id !== wdef.id) self._predW = new G.Weapon(wdef);

    var holding = !!G.mouse.down;
    var triggered = holding && !lastMouseDown;
    var released = !holding && lastMouseDown;
    lastMouseDown = holding;

    var before = g.bullets.length;
    var e0 = self.energy;
    var origPlay = G.audio.play;
    G.audio.play = function () {};
    try { self._predW.update(self, g, dt, holding, released, triggered); }
    finally { G.audio.play = origPlay; }
    self.energy = e0;

    for (var i = before; i < g.bullets.length; i++) {
      var b = g.bullets[i];
      b._local = true;
      b.id = -(++predSeq);
      b._life = PRED_LIFE;
    }
  }

  function moveKeysNow() {
    var keys = G.keys;
    return {
      w: !!(keys['w'] || keys['arrowup']),
      a: !!(keys['a'] || keys['arrowleft']),
      s: !!(keys['s'] || keys['arrowdown']),
      d: !!(keys['d'] || keys['arrowright'])
    };
  }

  function predictSelf(g, dt) {
    var self = g.player;
    if (!self) return;

    // 暂停/死亡/观战：只发心跳输入
    if (G.paused || self.dead || g.playerDead) {
      idleAcc += dt;
      if (idleAcc >= IDLE_INTERVAL) { idleAcc = 0; sendIdleInput(); }
      return;
    }

    // 技能（键盘边沿；手机按钮走 useSkill 钩子）
    if (G.keys[' '] && !prevSpace) trySkillLocal(self);
    prevSpace = !!G.keys[' '];
    if (G.keys['q'] && !prevQ) queuedSwitch = true;
    prevQ = !!G.keys['q'];

    // 移动预测
    if (self.dashT > 0) {
      var spd = self.speed * (self.moveMult || 1) * 3.2 * dt;
      self.x += (self.dashDx || 0) * spd;
      self.y += (self.dashDy || 0) * spd;
      self.dashT -= dt;
      collideRoom(self);
    } else {
      integrateMove(self, moveKeysNow(), dt);
    }

    // 瞄准 + 相机
    var mx = G.mouse.x + g.cam.x, my = G.mouse.y + g.cam.y;
    self.aimAngle = Math.atan2(my - self.y, mx - self.x);
    updateCamLocal(g, dt);

    // 子弹预测（30Hz 节流，匹配服务端模拟频率）
    predAcc += dt;
    if (predAcc >= INPUT_INTERVAL) {
      var pdt = predAcc;
      predAcc = 0;
      predictBullets(self, g, pdt);
    }

    // 输入上报（30Hz；space/q 为按下边沿）
    inputAcc += dt;
    if (inputAcc >= INPUT_INTERVAL) {
      var idt = inputAcc;
      inputAcc = 0;
      var firing = !!G.mouse.down;
      var mk = moveKeysNow();
      inputSeq++;
      pendingInputs.push({ seq: inputSeq, dt: idt, keys: mk });
      if (pendingInputs.length > 120) pendingInputs.shift();
      send({
        type: 'input', seq: inputSeq,
        keys: mk,
        mouse: { wx: Math.round(mx), wy: Math.round(my) },
        firing: firing,
        pressed: firing && !lastFiring,
        releasedF: !firing && lastFiring,
        space: queuedSkill,
        q: queuedSwitch,
        autofire: !!(G.save && G.save.autofire)
      });
      queuedSkill = false;
      queuedSwitch = false;
      lastFiring = firing;
    }
  }

  function sendIdleInput() {
    send({
      type: 'input', seq: ++inputSeq,
      keys: { w: false, a: false, s: false, d: false },
      mouse: { wx: 0, wy: 0 },
      firing: false, space: false, q: false, e: false
    });
  }

  // 预测子弹飞行 + 障碍物碰撞（视觉层，服务端结算为准）
  function tickPredictedBullets(g, dt) {
    var changed = false;
    for (var i = 0; i < g.bullets.length; i++) {
      var bl = g.bullets[i];
      if (!bl._local) continue;
      var px = bl.x, py = bl.y;
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
      bl._life -= dt;
      if (bl._life <= 0) { changed = true; continue; }
      var obs = g.room && g.room.obstacles;
      if (obs) {
        for (var j = 0; j < obs.length; j++) {
          var ob = obs[j];
          if (!ob || ob.dead) continue;
          if (G.segmentHitsObstacle(px, py, bl.x, bl.y, ob, bl.r)) {
            G.FX.burst(bl.x, bl.y, '#b98a5f', 4, 100, 2);
            bl._life = 0; changed = true;
            break;
          }
        }
      }
    }
    if (changed) g.bullets = g.bullets.filter(function (b) { return !b._local || b._life > 0; });
  }

  // ============================================================
  //  Net.tick — 每帧入口
  // ============================================================
  Net.tick = function (dt) {
    if (!active || !G.game || G.game.finished) return;
    var g = G.game;
    advanceClock(dt);
    lerpEntities(g, dt);
    tickPredictedBullets(g, dt);
    predictSelf(g, dt);
  };

  // ============================================================
  //  Hooks — 联机时覆盖单人操作（商店/晶悟/交互/技能/切枪）
  // ============================================================
  function overrideHooks() {
    if (origHooks) return;
    origHooks = {
      buyShopItem: G.buyShopItem,
      applyTalentChoice: G.applyTalentChoice,
      tryInteract: G.tryInteract,
      useSkill: G.Player.prototype.useSkill,
      switchWeapon: G.Player.prototype.switchWeapon
    };

    G.buyShopItem = function (game, item) {
      var p = game.player;
      if (!p) return;
      if (item.kind === 'weapon' && p.weapons.length >= 2) {
        game.replaceConfirm = { item: item };
        G.audio.play('click');
        return;
      }
      Net.sendBuy(item);
    };

    G.applyTalentChoice = function (game, t) {
      send({ type: 'talent', index: game.talentChoices.indexOf(t) });
    };

    G.tryInteract = function () {
      send({ type: 'interact' });
    };

    // 手机按钮直接调用原型方法：转成“排队边沿 + 本地预测”，避免与服务器脱钩
    G.Player.prototype.useSkill = function () {
      var g = G.game;
      if (g && this === g.player && active) trySkillLocal(this);
    };
    G.Player.prototype.switchWeapon = function () {
      var g = G.game;
      if (g && this === g.player && active && this.weapons.length >= 2) queuedSwitch = true;
    };
  }

  function restoreHooks() {
    if (!origHooks) return;
    G.buyShopItem = origHooks.buyShopItem;
    G.applyTalentChoice = origHooks.applyTalentChoice;
    G.tryInteract = origHooks.tryInteract;
    G.Player.prototype.useSkill = origHooks.useSkill;
    G.Player.prototype.switchWeapon = origHooks.switchWeapon;
    origHooks = null;
  }

  Net.closeShop = function () {
    var g = G.game;
    if (g && g.player) g.player.shopOpen = false; // 本地立即关闭，不等快照
    send({ type: 'closeshop' });
  };

  Net.sendBuy = function (item) {
    var g = G.game;
    if (!g || !g.room || !g.room.shop) return;
    send({ type: 'buy', index: g.room.shop.stock.indexOf(item) });
  };

  // ============================================================
  //  消息分发
  // ============================================================
  function dispatch(data) {
    switch (data.type) {
      case 'joined':
        selfId = data.id;
        roomId = data.roomId;
        break;
      case 'pong':
        handlePong(data);
        break;
      case 'room':
        roomId = data.roomId;
        hostId = data.hostId;
        roomState = data.state;
        lobbyPlayers = data.players;
        renderRoomPanel(data.players);
        setErr('');
        break;
      case 'lobby':
        renderRooms(data.rooms);
        break;
      case 'error':
        setErr(data.msg);
        break;
      case 'game-start':
        active = true;
        inSession = true;
        hidePanel();
        overrideHooks();
        G.state = 'netgame';
        G.paused = false;
        initGame(data.snapshot);
        break;
      case 'snapshot':
        if (active && G.game) applySnapshot(data.snapshot);
        break;
      case 'game-over':
        active = false;
        G.netTalentWait = false;
        if (G.game) {
          var g = G.game;
          g.finished = true;
          g.win = !!data.win;
          g.gemsEarned = data.gems || 0;
          if (data.floor) g.floor = data.floor;
          G.state = data.win ? 'victory' : 'gameover';
          G.audio.play(data.win ? 'win' : 'lose');
        }
        break;
      case 'room-closed':
        if (G.state === 'netgame' || G.state === 'lobby') backToLobby(true);
        break;
    }
  }

  // ============================================================
  //  大厅入口 / 返回
  // ============================================================
  Net.openLobby = function () {
    G.state = 'lobby';
    buildPanel();
    showPanel();
    setErr('');
    if (!ws) connect();
    else send({ type: 'list' });
  };

  function backToLobby(silent) {
    resetInterp();
    resetPrediction();
    restoreHooks();
    if (ws && connected && !silent) send({ type: 'leave' });
    active = false;
    inSession = false;
    G.netTalentWait = false;
    G.game = null;
    G.state = 'lobby';
    showPanel();
    if (ws) send({ type: 'list' });
  }
  Net.backToLobby = backToLobby;
})();
