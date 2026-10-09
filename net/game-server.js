/**
 * 晶域守卫者 · 联机游戏服务器 (v3 rewrite)
 *
 * 架构：
 *   Sandbox  — vm 沙箱中运行与客户端完全相同的游戏逻辑（服务端权威模拟）
 *   Room     — 房间：玩家列表、输入缓冲、30Hz 固定步长模拟、快照广播
 *   Snapshot — 快照序列化（每个玩家附带已应用输入确认号 ack）
 *   Router   — WebSocket 消息路由 + 房间管理
 *
 * 同步模型：
 *   - 服务端权威：客户端只上报输入，世界状态完全由服务端模拟
 *   - 快照消息 { type:'snapshot', seq, snapshot }，seq 每房间单调递增
 *   - 客户端输入 { type:'input', seq, ... }，seq 每玩家单调递增；
 *     服务端在快照玩家对象中回带 ack（最近收到的输入 seq），
 *     客户端据此重放未确认输入完成移动重调和
 *   - input 中 space / q / e 为“按下边沿”事件：收到后置位，下一个模拟步消费一次
 *
 * 协议（JSON over WebSocket，路径 /ws）：
 *   C→S: ping / create / join / list / leave / start / input / talent / buy / interact / closeshop
 *   S→C: pong / joined / room / lobby / error / game-start / snapshot / game-over / room-closed
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var wsFrame = require('./ws-frame');

// ============================================================
//  常量
// ============================================================
var ROOT = path.resolve(__dirname, '..');
var GAME_FILES = [
  'utils.js', 'config.js', 'audio.js', 'save.js', 'effects.js',
  'bullets.js', 'weapons.js', 'talents.js', 'player.js', 'enemies.js',
  'items.js', 'dungeon.js', 'ui.js', 'main.js'
];
var TICK_MS = 33;            // 快照广播间隔（~30Hz）
var STEP = 1 / 30;           // 固定模拟步长（秒）
var MAX_STEPS_PER_TICK = 3;  // 单 tick 最多补偿的步数（防突发大包）
var MAX_PLAYERS = 4;
var MIN_PLAYERS = 2;
var END_CLOSE_DELAY = 8000;  // 结算后关房延迟

// ============================================================
//  Sandbox — vm 沙箱（加载游戏逻辑 + 录制音效事件）
// ============================================================
function createSandbox() {
  var ctx = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array,
    Number: Number, String: String, Boolean: Boolean, Error: Error,
    Promise: Promise, Map: Map, Set: Set, RegExp: RegExp,
    parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
    Uint8Array: Uint8Array, Float32Array: Float32Array, Int8Array: Int8Array
  };
  ctx.window = ctx;
  ctx.navigator = { userAgent: 'node' };
  ctx.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  ctx.performance = { now: function () { return Date.now(); } };
  ctx.requestAnimationFrame = function () {};
  ctx.AudioContext = function () {
    return {
      state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
      resume: function () {}, suspend: function () {}, close: function () {},
      createOscillator: function () { return { frequency: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () {}, start: function () {}, stop: function () {} }; },
      createGain: function () { return { gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () {} }; },
      createBuffer: function () { return { getChannelData: function () { return new Float32Array(1024); } }; },
      createBufferSource: function () { return { buffer: null, connect: function () {}, start: function () {} }; },
      createBiquadFilter: function () { return { frequency: { value: 0 }, connect: function () {} }; }
    };
  };
  ctx.document = { getElementById: function () { return null; } };

  vm.createContext(ctx);
  var base = path.join(ROOT, 'game', 'js');
  for (var i = 0; i < GAME_FILES.length; i++) {
    vm.runInContext(fs.readFileSync(path.join(base, GAME_FILES[i]), 'utf8'), ctx, { filename: GAME_FILES[i] });
  }

  // 禁用真实音频，把 play() 调用录制成事件（快照广播给客户端播放）
  var G = ctx.window.G;
  G.audio.enabled = false;
  ctx.audioEvents = [];
  var aud = G.audio;
  var origPlay = aud.play.bind(aud);
  aud.play = function (name) {
    var f = aud.focus;
    var ev = { n: String(name) };
    if (f && typeof f.x === 'number' && typeof f.y === 'number') {
      ev.x = Math.round(f.x); ev.y = Math.round(f.y);
    }
    ctx.audioEvents.push(ev);
    if (ctx.audioEvents.length > 64) ctx.audioEvents.shift();
    origPlay(name);
  };

  G.saveLoad();
  return ctx;
}

// ============================================================
//  Snapshot — 快照序列化
//  acks: { playerId: lastInputSeq }，写入每个玩家对象的 ack 字段
// ============================================================
function snapshotOf(game, G, audioEvents, acks, roomChanged) {
  var r = game.room;
  var d = game.dungeon;
  var W = (G && G.WEAPONS) || {};

  var snap = {
    t: Math.round(game.time * 1000),
    state: game.finished ? (game.win ? 'victory' : 'gameover') : 'playing',
    floor: game.floor, kills: game.kills, bossKills: game.bossKills,
    gemsEarned: game.gemsEarned || 0, win: !!game.win,
    banner: game.banner ? { text: game.banner.text, t: Math.round(game.banner.t * 100) / 100 } : null,
    bossLockMsg: game.bossLockMsg || null, bossLockMsgT: game.bossLockMsgT || 0,
    talentOpen: !!game.talentOpen,
    talentChoices: game.talentOpen ? game.talentChoices.map(function (t) { return t.id; }) : [],
    room: serializeRoom(r, W),
    players: game.players.map(function (p) { return serializePlayer(p, W, acks); }),
    enemies: game.enemies.map(serializeEnemy),
    bullets: game.bullets.map(serializeBullet),
    pickups: game.pickups.filter(function (pk) { return !pk.dead; }).map(serializePickup),
    allies: game.allies.map(function (a) { return { x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, life: a.life }; }),
    audio: (audioEvents || []).slice(0, 8)  // 减少音频事件数量
  };

  // 房间变化时发送地牢静态数据，否则省略以节省带宽
  if (roomChanged) {
    snap.dungeon = {
      gridW: d.gridW, gridH: d.gridH, bossCell: d.bossCell, bossUnlocked: d.bossUnlocked,
      rooms: d.rooms.map(function (rr) {
        return {
          id: rr.id, gx: rr.gx, gy: rr.gy,
          x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.w), h: Math.round(rr.h),
          type: rr.type, cleared: rr.cleared, visited: rr.visited,
          doors: {
            up: rr.doors.up ? rr.doors.up.to : null,
            down: rr.doors.down ? rr.doors.down.to : null,
            left: rr.doors.left ? rr.doors.left.to : null,
            right: rr.doors.right ? rr.doors.right.to : null
          }
        };
      })
    };
  }

  return snap;
}

function serializeRoom(r, W) {
  return {
    id: r.id, type: r.type, cleared: r.cleared,
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h),
    wave: r.wave, waveMax: r.waveMax, waveState: r.waveState,
    waveT: Math.round((r.waveT || 0) * 100) / 100,
    waveSpawns: (r.waveSpawns || []).map(function (s) { return { x: Math.round(s.x), y: Math.round(s.y) }; }),
    shieldReady: !!r.shieldReady, bossName: r.bossName || null,
    doors: {
      up: r.doors.up ? { to: r.doors.up.to, open: !!r.doors.up.open, dx: r.doors.up.dx, dy: r.doors.up.dy } : null,
      down: r.doors.down ? { to: r.doors.down.to, open: !!r.doors.down.open, dx: r.doors.down.dx, dy: r.doors.down.dy } : null,
      left: r.doors.left ? { to: r.doors.left.to, open: !!r.doors.left.open, dx: r.doors.left.dx, dy: r.doors.left.dy } : null,
      right: r.doors.right ? { to: r.doors.right.to, open: !!r.doors.right.open, dx: r.doors.right.dx, dy: r.doors.right.dy } : null
    },
    obstacles: r.obstacles.map(function (o) { return { x: Math.round(o.x), y: Math.round(o.y), r: o.r, hp: o.hp, dead: o.dead }; }),
    chests: r.chests.map(function (c) { return { x: Math.round(c.x), y: Math.round(c.y), opened: c.opened, big: c.big }; }),
    shop: r.shop ? {
      x: Math.round(r.shop.x), y: Math.round(r.shop.y), dead: r.shop.dead,
      stock: r.shop.stock.map(function (it) {
        return {
          kind: it.kind, name: it.name || null, type: it.type || null,
          price: it.price, desc: it.desc || null, sold: it.sold,
          weapon: it.weapon ? (W[it.weapon.id] || { id: it.weapon.id }) : null
        };
      })
    } : null,
    portal: r.portal ? { x: Math.round(r.portal.x), y: Math.round(r.portal.y) } : null,
    revive: r.revive ? { x: Math.round(r.revive.x), y: Math.round(r.revive.y), used: r.revive.used } : null
  };
}

function serializePlayer(p, W, acks) {
  return {
    id: p.netId || p.id || '', name: p.name, charId: p.character.id, emoji: p.emoji, color: p.color,
    x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
    hp: Math.round(p.hp * 10) / 10, maxHp: p.maxHp, armor: p.armor, maxArmor: p.maxArmor,
    energy: Math.round(p.energy), maxEnergy: p.maxEnergy, r: p.r,
    aimAngle: Math.round(p.aimAngle * 1000) / 1000, cur: p.cur, dead: !!p.dead,
    ack: acks ? (acks[p.netId] || 0) : 0,
    wswing: p.weapon() ? Math.round((p.weapon().swingT || 0) * 100) / 100 : 0,
    wcharge: p.weapon() ? Math.round((p.weapon().charge || 0) * 100) / 100 : 0,
    wdraw: Math.round((p.drawBowCharge || 0) * 100) / 100,
    dashT: Math.round(p.dashT * 100) / 100,
    dashDx: Math.round(p.dashDx * 1000) / 1000, dashDy: Math.round(p.dashDy * 1000) / 1000,
    invuln: Math.round(p.invuln * 100) / 100, fireBuffT: Math.round(p.fireBuffT * 100) / 100,
    weapons: p.weapons.map(function (w) { return W[w.id] || { id: w.id }; }),
    skill: {
      id: p.skill.id, emoji: p.skill.emoji, name: p.skill.name,
      cost: p.skill.cost, cd: p.skill.cd, cdLeft: Math.round(p.skill.cdLeft * 100) / 100
    },
    coins: p.coins || 0, shopOpen: !!p.shopOpen, interactHint: p.interactHint || null,
    speed: p.speed, moveMult: p.moveMult,
    pet: p.pet ? {
      x: Math.round(p.pet.x * 10) / 10, y: Math.round(p.pet.y * 10) / 10,
      t: Math.round(p.pet.t * 100) / 100
    } : null
  };
}

function serializeEnemy(e) {
  return {
    id: e.id, type: e.type, boss: !!e.boss, elite: !!e.elite, name: e.name || null,
    x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10,
    hp: Math.round(e.hp * 10) / 10, maxHp: e.maxHp, r: e.r, color: e.color,
    spawnIn: e.spawnIn || 0, state: e.state || 'idle', stateT: e.stateT || 0,
    slowT: e.slowT || 0, burnT: e.burnT || 0
  };
}

function serializeBullet(b) {
  return {
    id: b.id, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10,
    vx: Math.round(b.vx * 10) / 10, vy: Math.round(b.vy * 10) / 10,
    r: b.r, color: b.color, friendly: !!b.friendly, owner: b.owner || ''
  };
}

function serializePickup(pk) {
  return {
    type: pk.type, x: Math.round(pk.x * 10) / 10, y: Math.round(pk.y * 10) / 10,
    value: pk.value, weaponId: pk.weaponId || null, t: pk.t
  };
}

// ============================================================
//  Room — 房间（输入缓冲 + 固定步长模拟 + 快照广播）
// ============================================================
var rooms = new Map();
var connSeq = 1;
var roomSeq = 100;

function sendTo(conn, obj) {
  if (conn && conn.sendText) conn.sendText(JSON.stringify(obj));
}

function sendToRoom(room, obj) {
  var msg = JSON.stringify(obj);
  for (var i = 0; i < room.players.length; i++) {
    var c = room.players[i].conn;
    if (c && c.sendText) c.sendText(msg);
  }
}

function newInputState() {
  return {
    ack: 0,                                        // 最近收到的输入 seq（快照回带）
    keys: { w: false, a: false, s: false, d: false },
    mouse: { worldX: 0, worldY: 0, down: false },
    pressed: false, released: false,               // 开火边沿（每模拟步消费一次）
    edgeSkill: false, edgeSwitch: false, edgeInteract: false,
    autofire: false
  };
}

function createRoom(hostConn, name, charId) {
  var room = {
    id: String(++roomSeq),
    hostId: hostConn.id,
    state: 'waiting',                              // waiting | playing
    players: [],
    inputs: {},                                    // playerId -> 输入状态
    sandbox: null, game: null,
    tickTimer: null, lastTick: 0, simAcc: 0,
    snapSeq: 0,
    lastRoomId: null,                               // 追踪房间变化以发送增量快照
    closed: false, endSent: false
  };
  rooms.set(room.id, room);
  addPlayerToRoom(room, hostConn, name, charId);
  return room;
}

function addPlayerToRoom(room, conn, name, charId) {
  room.players.push({ id: conn.id, name: name, charId: charId, conn: conn });
  room.inputs[conn.id] = newInputState();
  conn.roomId = room.id;
}

function roomInfo(room) {
  return room.players.map(function (p) {
    return { id: p.id, name: p.name, charId: p.charId, host: p.id === room.hostId };
  });
}

function broadcastRoom(room) {
  sendToRoom(room, {
    type: 'room', roomId: room.id, hostId: room.hostId,
    state: room.state, maxPlayers: MAX_PLAYERS, players: roomInfo(room)
  });
}

function closeRoom(room) {
  if (room.closed) return;
  room.closed = true;
  if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = null; }
  rooms.delete(room.id);
  for (var i = 0; i < room.players.length; i++) {
    var p = room.players[i];
    if (p.conn) {
      p.conn.roomId = null;
      sendTo(p.conn, { type: 'room-closed', roomId: room.id });
    }
  }
  room.players = [];
  room.inputs = {};
}

function leaveRoom(conn) {
  var room = rooms.get(conn.roomId);
  conn.roomId = null;
  if (!room) return;

  room.players = room.players.filter(function (p) { return p.id !== conn.id; });
  delete room.inputs[conn.id];

  if (!room.players.length) { closeRoom(room); return; }

  // 对局中有人离开 → 解散本局（保持简单：不做人机托管）
  if (room.state === 'playing') {
    sendToRoom(room, {
      type: 'game-over', win: false, reason: '有玩家离开了房间',
      floor: room.game ? room.game.floor : 1, gems: 0
    });
    closeRoom(room);
    return;
  }

  if (room.hostId === conn.id) room.hostId = room.players[0].id;
  broadcastRoom(room);
}

// ============================================================
//  模拟循环
// ============================================================
function startGame(room) {
  room.state = 'playing';
  var ctx = createSandbox();
  room.sandbox = ctx;
  var G = ctx.window.G;
  var defs = room.players.map(function (p) {
    return { id: p.id, name: p.name, charId: p.charId };
  });
  var game = G.startNetRun(defs);
  if (!game) { closeRoom(room); return; }
  room.game = game;
  game.cameraTarget = game.players[0];

  room.snapSeq = 0;
  room.lastRoomId = game.room && game.room.id;
  sendToRoom(room, { type: 'game-start', roomId: room.id, snapshot: snapshotOf(game, G, [], {}, true) });

  room.lastTick = Date.now();
  room.simAcc = 0;
  room.tickTimer = setInterval(function () { tickRoom(room); }, TICK_MS);
}

function tickRoom(room) {
  if (room.closed) return;
  var g = room.game;
  if (!g) return;
  var G = room.sandbox.window.G;

  if (g.finished) {
    if (!room.endSent) {
      room.endSent = true;
      sendToRoom(room, {
        type: 'game-over', win: !!g.win, floor: g.floor, gems: g.gemsEarned || 0
      });
      setTimeout(function () { closeRoom(room); }, END_CLOSE_DELAY);
    }
    return;
  }

  // 固定步长模拟（real-time 累积，最多补 MAX_STEPS_PER_TICK 步）
  var now = Date.now();
  room.simAcc += Math.min(0.1, (now - room.lastTick) / 1000);
  room.lastTick = now;
  var steps = 0;
  while (room.simAcc >= STEP && steps < MAX_STEPS_PER_TICK) {
    simStep(room, G, g);
    room.simAcc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_TICK) room.simAcc = 0;

  var audio = room.sandbox.audioEvents.splice(0);
  room.snapSeq++;
  var curRoomId = g.room && g.room.id;
  var roomChanged = (curRoomId !== room.lastRoomId);
  if (roomChanged) room.lastRoomId = curRoomId;
  sendToRoom(room, { type: 'snapshot', seq: room.snapSeq, snapshot: snapshotOf(g, G, audio, ackMapOf(room), roomChanged) });
}

function ackMapOf(room) {
  var acks = {};
  for (var i = 0; i < room.players.length; i++) {
    var pid = room.players[i].id;
    var inp = room.inputs[pid];
    acks[pid] = inp ? inp.ack : 0;
  }
  return acks;
}

// 单个固定步长：组装输入 → 推进一步 → 消费边沿事件
function simStep(room, G, g) {
  for (var i = 0; i < g.players.length; i++) {
    var p = g.players[i];
    var inp = room.inputs[p.netId];
    if (!inp) continue;
    p.autofire = inp.autofire;
    p.input = {
      keys: {
        w: inp.keys.w, a: inp.keys.a, s: inp.keys.s, d: inp.keys.d,
        ' ': inp.edgeSkill, e: inp.edgeInteract, q: inp.edgeSwitch
      },
      mouse: {
        worldX: inp.mouse.worldX, worldY: inp.mouse.worldY, down: inp.mouse.down,
        triggered: inp.pressed, released: inp.released
      }
    };
  }
  G.debugStep(STEP);
  for (var j = 0; j < g.players.length; j++) {
    var inp2 = room.inputs[g.players[j].netId];
    if (!inp2) continue;
    inp2.pressed = false; inp2.released = false;
    inp2.edgeSkill = false; inp2.edgeSwitch = false; inp2.edgeInteract = false;
  }
}

// ============================================================
//  输入消息处理
// ============================================================
function handleInput(room, conn, data) {
  if (!room || room.state !== 'playing' || !room.game) return;
  var inp = room.inputs[conn.id];
  if (!inp) return;

  var seq = Number(data.seq) || 0;
  if (seq > inp.ack) inp.ack = seq;

  var keys = data.keys || {};
  inp.keys.w = !!keys.w; inp.keys.a = !!keys.a;
  inp.keys.s = !!keys.s; inp.keys.d = !!keys.d;

  inp.mouse.worldX = Number(data.mouse && data.mouse.wx) || 0;
  inp.mouse.worldY = Number(data.mouse && data.mouse.wy) || 0;
  inp.mouse.down = !!data.firing;
  if (data.pressed) inp.pressed = true;
  if (data.releasedF) inp.released = true;

  // 边沿事件：置位后由下一个模拟步消费
  if (data.space) inp.edgeSkill = true;
  if (data.q) inp.edgeSwitch = true;
  if (data.e) inp.edgeInteract = true;

  if (typeof data.autofire === 'boolean') inp.autofire = data.autofire;
}

// ============================================================
//  消息路由
// ============================================================
function sanitizeName(v) { return String(v || '玩家').slice(0, 12); }
function sanitizeChar(v) { return String(v || 'warden').slice(0, 16); }

function handleMessage(conn, msg) {
  var data;
  try { data = JSON.parse(msg); } catch (e) { return; }
  if (!data || typeof data.type !== 'string') return;

  var room = conn.roomId ? rooms.get(conn.roomId) : null;

  switch (data.type) {
    case 'ping':
      sendTo(conn, { type: 'pong', seq: data.seq, t: data.t });
      break;

    case 'create': {
      if (room) return;
      var r = createRoom(conn, sanitizeName(data.name), sanitizeChar(data.charId));
      sendTo(conn, { type: 'joined', id: conn.id, roomId: r.id });
      broadcastRoom(r);
      break;
    }

    case 'join': {
      if (room) return;
      var jr = rooms.get(String(data.roomId));
      if (!jr || jr.closed) { sendTo(conn, { type: 'error', msg: '房间不存在' }); return; }
      if (jr.state !== 'waiting') { sendTo(conn, { type: 'error', msg: '房间已开始，无法加入' }); return; }
      if (jr.players.length >= MAX_PLAYERS) { sendTo(conn, { type: 'error', msg: '房间已满（最大' + MAX_PLAYERS + ' 人）' }); return; }
      addPlayerToRoom(jr, conn, sanitizeName(data.name), sanitizeChar(data.charId));
      sendTo(conn, { type: 'joined', id: conn.id, roomId: jr.id });
      broadcastRoom(jr);
      break;
    }

    case 'list': {
      var list = [];
      rooms.forEach(function (r) {
        if (!r.closed && r.state === 'waiting') {
          list.push({ roomId: r.id, players: r.players.length, max: MAX_PLAYERS, host: r.players[0] ? r.players[0].name : '' });
        }
      });
      sendTo(conn, { type: 'lobby', rooms: list });
      break;
    }

    case 'leave':
      if (room) leaveRoom(conn);
      break;

    case 'start': {
      if (!room || room.hostId !== conn.id || room.state !== 'waiting') return;
      if (room.players.length < MIN_PLAYERS) {
        sendTo(conn, { type: 'error', msg: '至少需要' + MIN_PLAYERS + ' 名玩家才能开始' });
        return;
      }
      startGame(room);
      break;
    }

    case 'input':
      handleInput(room, conn, data);
      break;

    case 'talent': {
      // 仅房主可选取晶悟，效果作用于全员（由游戏逻辑保证）
      if (!room || room.state !== 'playing' || !room.game) return;
      if (room.hostId !== conn.id) return;
      var g = room.game;
      if (!g.talentOpen) return;
      var t = g.talentChoices[Number(data.index)];
      if (t) {
        var G1 = room.sandbox.window.G;
        G1.audio.focus = { x: g.room.x + g.room.w / 2, y: g.room.y + g.room.h / 2 };
        G1.applyTalentChoice(g, t);
      }
      break;
    }

    case 'buy': {
      if (!room || room.state !== 'playing' || !room.game) return;
      var g2 = room.game;
      var buyer = g2.players.find(function (x) { return x.netId === conn.id; });
      if (!buyer || buyer.dead) return;
      var shop = g2.room.shop;
      if (!shop || shop.dead || Math.hypot(buyer.x - shop.x, buyer.y - shop.y) > 300) return;
      var item = shop.stock[Number(data.index)];
      if (item) {
        var G2 = room.sandbox.window.G;
        G2.audio.focus = { x: buyer.x, y: buyer.y };
        G2.doBuyShopItem(g2, item, buyer);
      }
      break;
    }

    case 'interact': {
      if (!room || room.state !== 'playing' || !room.game) return;
      var g3 = room.game;
      var actor = g3.players.find(function (x) { return x.netId === conn.id; });
      if (actor && !actor.dead) {
        var G3 = room.sandbox.window.G;
        G3.audio.focus = { x: actor.x, y: actor.y };
        G3.tryInteract(g3, actor);
      }
      break;
    }

    case 'closeshop': {
      if (!room || room.state !== 'playing' || !room.game) return;
      var g4 = room.game;
      var closer = g4.players.find(function (x) { return x.netId === conn.id; });
      if (closer) closer.shopOpen = false;
      break;
    }
  }
}

// ============================================================
//  挂载到 HTTP 服务器
// ============================================================
function attachWs(server) {
  server.on('upgrade', function (req, socket, head) {
    var conn = wsFrame.handleUpgrade(req, socket, head);
    if (!conn) return;
    conn.id = 'p' + (connSeq++);
    conn.roomId = null;
    conn.onMessage = function (m) { handleMessage(conn, m); };
    conn.onClose = function () { leaveRoom(conn); };
  });
}

function getRoom(roomId) { return rooms.get(String(roomId)); }
function getRoomCount() { return rooms.size; }

module.exports = { attachWs: attachWs, getRoom: getRoom, getRoomCount: getRoomCount, snapshotOf: snapshotOf, MAX_PLAYERS: MAX_PLAYERS };
