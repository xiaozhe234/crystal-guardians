// 临时调试：一次点击在"客户端本地预测 + 服务端权威"下各 fire 几次？子弹是否消失/跳变/双发？
// 运行: node tools/net-fire-debug.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const GAME_FILES = ['utils.js','config.js','audio.js','save.js','effects.js','bullets.js','weapons.js','talents.js','player.js','enemies.js','items.js','dungeon.js','ui.js','main.js'];

function createSandbox() {
  const context = {
    console, setTimeout, clearTimeout,
    Math, JSON, Date, Object, Array, Number, String, Boolean, Error, Promise, Map, Set, RegExp,
    parseInt, parseFloat, isNaN, isFinite
  };
  context.window = context;
  context.navigator = { userAgent: 'node' };
  context.localStorage = { _d: {}, getItem() { return null; }, setItem() {}, removeItem() {} };
  context.performance = { now: () => Date.now() };
  context.requestAnimationFrame = () => {};
  context.AudioContext = function () {
    return {
      state: 'running', currentTime: 0, sampleRate: 44100, destination: {}, resume() {},
      createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; },
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
      createBuffer() { return { getChannelData() { return new Float32Array(1024); } }; },
      createBufferSource() { return { buffer: null, connect() {}, start() {} }; },
      createBiquadFilter() { return { frequency: { value: 0 }, connect() {} }; }
    };
  };
  context.document = { getElementById() { return null; } };
  vm.createContext(context);
  const base = path.join(ROOT, 'game', 'js');
  for (const f of GAME_FILES) {
    vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), context, { filename: f });
  }
  context.window.G.audio.enabled = false;
  context.audioEvents = [];
  const _aud = context.window.G.audio;
  const _audPlay = _aud.play.bind(_aud);
  _aud.play = function (name) {
    context.audioEvents.push({ n: String(name) });
    _audPlay(name);
  };
  context.window.G.saveLoad();
  return context;
}

// ---------------- 客户端逻辑复制（与 net.js 一致） ----------------
function makeClient(G, selfId) {
  const c = {
    G, selfId,
    predSeq: 0,
    lastMouseDown: false,
    lastFiring: false,
    bullets: [],          // 客户端 g.bullets
    snapBullets: [],      // 最新服务端快照子弹
    localFires: 0,
    serverG: null,
    pendingInput: null,   // 待服务端消费的 input
    shots: []             // 记录每发子弹的出生/消失事件
  };

  // 客户端本地预测（复制 net.js updateLocalPrediction 核心）
  c.clientTick = function (p, dt, holding) {
    const g = { bullets: c.bullets };
    const wdef = p.weapons[p.cur] || p.weapons[0];
    if (!p._predW || p._predW.id !== wdef.id) p._predW = new G.Weapon(wdef);
    const triggered = holding && !c.lastMouseDown;
    const released = !holding && c.lastMouseDown;
    c.lastMouseDown = holding;
    const before = c.bullets.length;
    const e0 = p.energy;
    const orig = G.audio.play;
    G.audio.play = function () {};
    try { p._predW.update(p, g, dt, holding, released, triggered); }
    finally { G.audio.play = orig; }
    p.energy = e0;
    for (let i = before; i < c.bullets.length; i++) {
      const b = c.bullets[i];
      b._local = true;
      b.id = -(++c.predSeq);
      b._life = 0.7;
      c.shots.push({ kind: 'localSpawn', t: c.t, id: b.id, x: b.x.toFixed(0), y: b.y.toFixed(0) });
      c.localFires++;
    }
    // 服务端 input：真实客户端在 30Hz 发送时才计算 pressed 边沿
    c.currentHolding = holding;
  };

  // 30Hz 发送 input（模拟真实客户端 send，始终发送）
  c.sendInput = function (p) {
    const firing = !!c.currentHolding;
    const inp = {
      keys: { w: false, a: false, s: false, d: false },
      mouse: { worldX: p.aimX || 500, worldY: 300, down: firing, triggered: firing && !c.lastFiring, released: !firing && c.lastFiring },
      space: false, e: false, q: false
    };
    c.lastFiring = firing;
    return inp;
  };

  // 客户端外推本地子弹 + 应用快照匹配（复制 net.js 新逻辑）
  c.extrapolateAndSnap = function (dt) {
    // 外推本地预测子弹 + 渲染级障碍物碰撞（复制 net.js Net.tick 新逻辑）
    for (const b of c.bullets) {
      if (!b._local) continue;
      const px = b.x, py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b._life -= dt;
      if (b._life <= 0) continue;
      for (const ob of c.roomObstacles) {
        if (!ob || ob.dead) continue;
        if (G.segmentHitsObstacle(px, py, b.x, b.y, ob, b.r)) {
          c.shots.push({ kind: 'clientCrateHit', t: +c.t.toFixed(3), id: b.id });
          b._life = 0;
          break;
        }
      }
    }
    c.bullets = c.bullets.filter(b => !b._local || b._life > 0);

    // applySnapshot 子弹段（复制新逻辑：绑定不吸附，仅 >200px 吸附）
    const snap = c.snapBullets;
    const localBullets = [];
    for (const lb of c.bullets) {
      if (!lb._local || lb._life < 0.2) continue;
      const bspeed = Math.hypot(lb.vx, lb.vy) || 500;
      const bindMax = Math.max(140, Math.round(bspeed * 0.35));
      let best = null, bd = bindMax;
      for (const sb of snap) {
        if (!sb || sb.owner !== c.selfId || sb._taken) continue;
        const d = Math.hypot(sb.x - lb.x, sb.y - lb.y);
        if (d < bd) { bd = d; best = sb; }
      }
      if (best) {
        lb.id = best.id; lb.vx = best.vx; lb.vy = best.vy;
        lb._local = false;
        best._taken = true;
        if (bd > 200) {
          c.shots.push({ kind: 'SNAP-JUMP', t: c.t, id: lb.id, dx: (best.x - lb.x).toFixed(0), dy: (best.y - lb.y).toFixed(0) });
          lb.x = best.x; lb.y = best.y;
        }
      }
      localBullets.push(lb);
    }
    const oldSelfBullets = {};
    for (const ob of c.bullets) if (ob.id !== undefined && !ob._local && ob.owner === c.selfId) oldSelfBullets[ob.id] = ob;
    const serverBullets = [];
    for (const b of snap) {
      if (!b || b._taken) continue;
      const nb = Object.assign({}, b);
      if (b.owner === c.selfId) {
        const old = oldSelfBullets[b.id];
        if (old && old.x !== undefined) {
          const ex = b.x - old.x, ey = b.y - old.y;
          const err = Math.hypot(ex, ey);
          if (err > 200) { nb.x = b.x; nb.y = b.y; }
          else if (err > 8) { nb.x = old.x + ex * 0.15; nb.y = old.y + ey * 0.15; }
          else { nb.x = old.x; nb.y = old.y; }
        }
      } else { nb.x = b.x; nb.y = b.y; }
      serverBullets.push(nb);
    }
    c.bullets = localBullets.concat(serverBullets);
  };

  return c;
}

function snapshotBulletsFrom(game, G, selfId) {
  return game.bullets.map(b => ({
    id: b.id, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10,
    vx: Math.round(b.vx * 10) / 10, vy: Math.round(b.vy * 10) / 10,
    r: b.r, color: b.color, friendly: !!b.friendly, owner: b.owner || ''
  }));
}

// 模拟 game-server.js 的 case 'input'：边沿累积（triggered/released 一旦为 true 保持，直到 tick 消费）
function applyServerInput(serverInput, inp) {
  if (!inp) return;
  serverInput.keys = inp.keys || {};
  serverInput.mouse.worldX = (inp.mouse && inp.mouse.worldX) || 500;
  serverInput.mouse.worldY = (inp.mouse && inp.mouse.worldY) || 300;
  serverInput.mouse.down = !!inp.mouse.down;
  if (inp.mouse.triggered) serverInput.mouse.triggered = true;
  if (inp.mouse.released) serverInput.mouse.released = true;
}

function runScenario(name, opts) {
  const ctx = createSandbox();
  const G = ctx.window.G;
  const game = G.startNetRun([{ id: 'p1', name: 'A', charId: 'warden' }]);
  const p = game.players[0];
  p.x = game.room.x + game.room.w / 2;
  p.y = game.room.y + game.room.h / 2;
  p.aimAngle = 0; // 朝右，避开出生点附近的墙
  game.infiniteEnergy = true; // 避免能量不足干扰 fire 计数
  // 放一个敌人贴近玩家，让宠物进入攻击射程（380px）从而周期性开火
  if (opts.enemy !== false) {
    const e = G.makeEnemy('slime', p.x + 120, p.y, game);
    e.spawnIn = 0;
    e.pending = false;
    game.enemies.push(e);
    game.room.enemies = game.enemies;
  }
  const wdef0 = p.weapon && p.weapon();
  const startW = wdef0 ? (wdef0.id + '/' + wdef0.type + ' rate=' + wdef0.rate) : 'none';

  const selfId = 'p1';
  const cli = makeClient(G, selfId);
  cli.t = 0;
  cli.roomObstacles = game.room.obstacles;
  // 贴脸箱子场景：箱子放在玩家正前方，子弹出生点（玩家前 18px）落在箱子碰撞圆内
  let crate = null;
  if (opts.crate) {
    crate = { x: p.x + 38, y: p.y, r: 20, hp: 18, dead: false };
    game.room.obstacles.push(crate);
  }

  const TICK = 1 / 30;
  const STEP = 1 / 60;
  let sim = 0;           // 服务端积累
  let delay = opts.delay || 0;   // 模拟网络延迟（秒）
  const delayedQueue = [];       // 有序延迟投递的输入流 [{at, input}]

  // 点击时长
  const holdStart = opts.holdStart || 0.05;
  const holdEnd = opts.holdEnd || 0.15; // 按住 100ms
  const total = opts.total || 1.0;

  let serverFires = 0;
  const serverShotLog = [];   // 服务端新子弹记录 [{t, id, x, y}]
  const audioLog = [];        // 服务端全部音效事件 [{t, n}]
  let prevServerBullets = [];
  let serverSnap = [];
  let inputAcc = 0;
  // 模拟服务端 room.inputs：triggered/released 边沿累积，不被后续消息清除
  const serverInput = { keys: {}, mouse: { worldX: 500, worldY: 300, down: false, triggered: false, released: false } };

  while (cli.t < total) {
    cli.t += STEP;
    const holding = cli.t >= holdStart && cli.t < holdEnd;
    // 客户端每帧：瞄准（与服务端同一鼠标世界坐标，模拟真实客户端）+ 本地预测 + 外推
    if (opts.move) { p.x += 160 * STEP; p.y += 40 * STEP; }
    if (opts.crate) {
      // 贴脸箱子场景：客户端瞄准右侧箱子，且发送的鼠标世界坐标同样指向箱子，
      // 服务端会用该坐标重算 aimAngle（player.js p.aimAngle = atan2(worldY-p.y, worldX-p.x)）
      p.aimAngle = 0;
      p.aimX = p.x + 100; p.aimY = p.y;
    } else {
      p.aimAngle = Math.atan2(300 - p.y, 500 - p.x);
      p.aimX = 500; p.aimY = 300;
    }
    cli.clientTick(p, STEP, holding);
    cli.extrapolateAndSnap(STEP);

    // 客户端 30Hz 发送 input → 服务端（有序延迟投递，模拟网络）
    inputAcc += STEP;
    if (inputAcc >= TICK) {
      inputAcc -= TICK;
      const inp = cli.sendInput(p);
      if (delay > 0) {
        delayedQueue.push({ at: cli.t + delay, input: inp });
      } else {
        applyServerInput(serverInput, inp);
      }
    }
    while (delayedQueue.length && cli.t >= delayedQueue[0].at) {
      applyServerInput(serverInput, delayedQueue[0].input);
      delayedQueue.shift();
    }

    // 服务端 30Hz tick
    sim += STEP;
    if (sim >= TICK) {
      sim -= TICK;
      p.input = serverInput; // tickRoom: p.input = room.inputs[id]
      const audioBefore = ctx.audioEvents.length;
      G.debugStep(TICK);
      if (ctx.audioEvents.length > audioBefore) {
        for (let i = audioBefore; i < ctx.audioEvents.length; i++) {
          serverFires++;
          audioLog.push({ t: +cli.t.toFixed(3), n: ctx.audioEvents[i].n });
        }
      }
      // 记录服务端新出生子弹
      for (const b of game.bullets) {
        if (!prevServerBullets.some(pb => pb.id === b.id)) {
          serverShotLog.push({ t: +cli.t.toFixed(3), id: b.id, x: Math.round(b.x), y: Math.round(b.y) });
        }
      }
      prevServerBullets = game.bullets.map(b => ({ id: b.id }));
      serverSnap = snapshotBulletsFrom(game, G, selfId);
      // 消费边沿（tickRoom while 循环内重置）
      serverInput.mouse.triggered = false;
      serverInput.mouse.released = false;
    }
    cli.snapBullets = serverSnap;
  }

  // 汇总
  console.log('==== ' + name + ' ====');
  console.log('武器: ' + startW + ' | autofire=' + G.save.autofire + ' | 玩家位置: ' + Math.round(p.x) + ',' + Math.round(p.y));
  console.log('服务端 fire 次数（audio 事件）: ' + serverFires);
  console.log('服务端音效:');
  for (const a of audioLog) console.log('  t=' + a.t + ' ' + a.n);
  console.log('服务端新子弹:');
  for (const s of serverShotLog) console.log('  t=' + s.t + ' id=' + s.id + ' @(' + s.x + ',' + s.y + ')');
  console.log('客户端本地预测 fire 次数: ' + cli.localFires);
  console.log('箱子: hp=' + (crate ? crate.hp : 'n/a') + (crate && crate.dead ? ' (已被摧毁)' : ''));
  console.log('客户端子弹事件:');
  for (const s of cli.shots) console.log('  ' + JSON.stringify(s));
  console.log('结束时客户端子弹数: ' + cli.bullets.length + ' 服务端子弹数: ' + game.bullets.length);
  return { serverFires, localFires: cli.localFires, shots: cli.shots };
}

console.log('AUTOFIRE = ' + (typeof localStorage !== 'undefined' ? 'n/a' : 'sandbox'));
runScenario('场景1: 手枪 静止 零延迟 点击100ms', {});
runScenario('场景2: 手枪 静止 200ms延迟 点击100ms', { delay: 0.2, total: 2.5 });
runScenario('场景3: 手枪 移动 200ms延迟 点击100ms', { delay: 0.2, move: true, total: 2.5 });
runScenario('场景4: 手枪 贴脸箱子 零延迟 点击100ms', { crate: true, enemy: false, total: 1.2 });
runScenario('场景5: 手枪 贴脸箱子 200ms延迟 点击100ms', { crate: true, enemy: false, delay: 0.2, total: 2.5 });
process.exit(0);
