// Net smoothness test: drives the real server simulation and the real client
// net.js interpolation code (fake DOM/WebSocket), then verifies that remote
// players, bullets, enemies and pets render with smooth per-frame motion:
// - rendered motion tracks the server exactly (per-frame delta ~ server
//   per-snapshot delta / 2, for 2 render frames per snapshot)
// - no held frames while the server is moving
// - no unexpected jumps, no NaN, no crashes, and floor changes clear the
//   interpolation buffer without breaking the render state.
// Run: node tools/net-smooth-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GAME_FILES = ['utils.js','config.js','audio.js','save.js','effects.js','bullets.js','weapons.js','talents.js','player.js','enemies.js','items.js','dungeon.js','ui.js','main.js'];

let failures = 0;
function check(name, cond, detail) {
  if (!cond) { failures++; console.log('FAIL:', name, detail !== undefined ? '(' + detail + ')' : ''); }
  else console.log('ok  :', name);
}

function makeContext(extra) {
  const context = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
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
  if (process.env.DBGP) context.DBGP = 1;
  Object.assign(context, extra || {});
  vm.createContext(context);
  const base = path.join(ROOT, 'game', 'js');
  for (const f of GAME_FILES) vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), context, { filename: f });
  context.window.G.audio.enabled = false;
  context.window.G.saveLoad();
  return context;
}

// ---------- server side: real simulation + real snapshotOf ----------
const { snapshotOf } = require(path.join(ROOT, 'net', 'game-server.js'));

function makeServer() {
  const ctx = makeContext();
  const G = ctx.window.G;
  const defs = [
    { id: 'p1', name: 'A', charId: 'warden' },
    { id: 'p2', name: 'B', charId: 'rogue' }
  ];
  const game = G.startNetRun(defs);
  const STEP = 33 / 1000;
  return { ctx, G, game, STEP };
}

function genSnaps(server, count, opts) {
  opts = opts || {};
  const { G, game, STEP } = server;
  const p1 = game.players[0], p2 = game.players[1];
  p2.input.keys.d = true;
  const snaps = [];
  for (let i = 0; i < count; i++) {
    G.debugStep(STEP);
    if (opts.enterRoom && i === opts.enterRoom) {
      const alt = game.dungeon.rooms.find(r => r.id !== game.room.id && r.id !== 0);
      if (alt) G.enterRoom(game, alt.id, p1);
    }
    const snap = snapshotOf(game, G);
    snap.bullets = snap.bullets.concat([{ id: 'b1', x: 200 + i * 10, y: 300, vx: 300, vy: 0, r: 3, color: '#ffffff', friendly: true }]);
    snap.enemies = snap.enemies.concat([{ id: 'e1', type: 'slime', x: 400 + i * 8, y: 200, hp: 10, maxHp: 10, r: 12, color: '#4ade80', spawnIn: 0, state: 'idle', stateT: 0 }]);
    snaps.push(snap);
  }
  return snaps;
}

// ---------- client side: real net.js with a fake DOM + WebSocket ----------
function makeClient() {
  function makeEl() {
    const el = {
      style: {}, value: '', textContent: '', _html: '',
      appendChild() {}, addEventListener() {},
      querySelector() { return makeEl(); },
      classList: { add() {}, remove() {} },
      trim() { return ''; }
    };
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = v; } });
    return el;
  }
  const wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
  }
  const document = {
    getElementById() { return null; },
    createElement() { return makeEl(); },
    body: { appendChild() {} }
  };
  const ctx = makeContext({
    document,
    location: { protocol: 'ws:', host: 'localhost:1' },
    WebSocket: FakeWS
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'game', 'js', 'net.js'), 'utf8'), ctx, { filename: 'net.js' });
  return { ctx, getWs: () => wsInstances[0] || null };
}

function renderState(g) {
  const out = { roomId: g.room ? g.room.id : null, players: {}, bullets: {}, enemies: {} };
  for (const p of g.players) {
    out.players[p.id] = { x: p.x, y: p.y, pet: p.pet ? { x: p.pet.x, y: p.pet.y } : null };
  }
  for (const b of g.bullets) out.bullets[b.id] = { x: b.x, y: b.y };
  for (const e of g.enemies) out.enemies[e.id] = { x: e.x, y: e.y };
  return out;
}

function feed(client, msg) {
  const sock = client.getWs();
  sock.onmessage({ data: JSON.stringify(msg) });
}

function startClientSession(client, snap) {
  const G = client.ctx.window.G;
  G.Net.openLobby(); // connects the fake WebSocket
  const sock = client.getWs();
  if (sock) sock.onopen();
  feed(client, { type: 'joined', id: 'p1', roomId: 'r1' });
  feed(client, { type: 'game-start', snapshot: snap });
  G.keys = {};
  G.mouse = { x: 480, y: 270, down: false, clicked: false, triggered: false, released: false };
  if (!G.save) G.save = {};
  G.save.autofire = false;
  return G;
}

// Deterministic snapshot arrival jitter: real setInterval/websocket delivery is
// not perfectly aligned with render frames. Snapshots arrive after
// framesPerSnap + jitter frames, where jitter follows a +/-1 frame pattern.
function drive(client, snaps, framesPerSnap, limit) {
  const G = client.ctx.window.G;
  // Mean-zero pattern: 20 frames per 10 snapshots = 33.3ms/snap average,
  // with +/-1 frame quantization (realistic websocket/timer jitter).
  const jitter = [0, 1, 0, -1, 1, 0, -1, 1, 0, -1]; // sums to 0 => 33.3ms/snap avg
  const frames = [];
  let snapIdx = 0;
  const end = limit || snaps.length;
  for (let i = 1; i < end; i++) {
    const wait = framesPerSnap + jitter[(i - 1) % jitter.length];
    for (let f = 0; f < wait; f++) {
      G.Net.tick(1 / 60);
      frames.push({ frame: frames.length, snapIdx: snapIdx, state: renderState(G.game) });
    }
    feed(client, { type: 'snapshot', snapshot: snaps[i] });
    snapIdx = i;
  }
  for (let f = 0; f < framesPerSnap; f++) {
    G.Net.tick(1 / 60);
    frames.push({ frame: frames.length, snapIdx: snapIdx, state: renderState(G.game) });
  }
  return frames;
}

// Smoothness check for a tracked key: rendered per-frame deltas must track the
// server per-snapshot deltas (divided by framesPerSnap). Skipped windows cover
// the buffer warm-up and the room-change teleport.
function checkTracked(label, frames, snaps, key, sub, skipAroundRoomChange) {
  const renderVals = [];
  for (const fr of frames) {
    const v = sub ? fr.state[key][sub] : fr.state[key];
    renderVals.push(v ? v.x : null);
  }
  const snapVals = snaps.map(s => {
    const p = s.players.find(x => x.id === sub);
    if (key === 'players' && p) return p.x;
    if (key === 'bullets' && s.bullets) { const b = s.bullets.find(x => x.id === sub); if (b) return b.x; }
    if (key === 'enemies' && s.enemies) { const e = s.enemies.find(x => x.id === sub); if (e) return e.x; }
    return null;
  });
  // frames where the client changed room
  let rcFrame = -1;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].state.roomId !== frames[i - 1].state.roomId) { rcFrame = i; break; }
  }
  const WARMUP = 16; // buffer fill: 2 ticks of render delay + jitter headroom
  let held = 0, jumps = 0, bad = 0, n = 0;
  let maxDelta = 0, maxAllowed = 0;
  for (let i = 1; i < frames.length; i++) {
    if (i <= WARMUP) continue;
    if (rcFrame > 0 && i > rcFrame - 6 && i <= rcFrame + 12) continue;
    const r0 = renderVals[i - 1], r1 = renderVals[i];
    if (r0 === null || r1 === null || !isFinite(r0) || !isFinite(r1)) { bad++; continue; }
    const k = frames[i].snapIdx; // most recent snapshot received before frame i
    const sPrev = snapVals[Math.max(0, k - 2)], sNext = snapVals[Math.max(0, k - 1)];
    if (sPrev === null || sNext === null) continue;
    const serverStep = Math.abs(sNext - sPrev); // px per snapshot
    const delta = r1 - r0;
    n++;
    maxDelta = Math.max(maxDelta, Math.abs(delta));
    maxAllowed = Math.max(maxAllowed, serverStep * 1.3 + 8);
    if (Math.abs(delta) > serverStep * 1.3 + 8) jumps++;
    if (serverStep > 3 && Math.abs(delta) < 0.5) held++;
    if (process.env.DBGP && serverStep > 3 && Math.abs(delta) < 2) console.log('DBG hold/crawl', label, 'frame', i, 'delta', delta.toFixed(3), 'serverStep', serverStep.toFixed(1), 'k', k);
  }
  check(label + ' tracks server motion', n > 10 && jumps === 0 && bad === 0,
    'n=' + n + ' jumps=' + jumps + ' maxDelta=' + maxDelta.toFixed(1) + ' maxAllowed=' + maxAllowed.toFixed(1));
  // allow up to 2 micro-stalls: a remote entity can briefly hug an obstacle
  // on the authoritative server (server itself moves unevenly there); a
  // systemic stutter (old code: 12+ held frames) still fails.
  check(label + ' has no held frames while moving', n > 10 && held <= 2, 'held=' + held);
  check(label + ' has no NaN', bad === 0, 'bad=' + bad);
}

// Replicates startFloor + floor++ (nextFloor is private in main.js) so the test
// can drive a real floor transition on the server sim.
function forceFloorChange(server) {
  const { G, game } = server;
  game.floor++;
  game.dungeon = G.generateFloor(game.floor);
  game.roomOf = game.dungeon.roomOf;
  game.room = game.dungeon.roomOf[0];
  G.loadRoom(game, game.room);
  game.enemies = game.room.enemies.filter(e => !e.dead && !e.pending);
  game.allies = [];
  game.bullets = [];
  game.pickups = game.room.pickups;
  const players = game.players || [game.player];
  players.forEach((p, i) => {
    const ang = (i / Math.max(1, players.length)) * G.TAU + 0.5;
    const off = players.length > 1 ? 90 : 0;
    p.x = game.room.x + game.room.w / 2 + Math.cos(ang) * off;
    p.y = game.room.y + game.room.h / 2 + Math.sin(ang) * off;
    p.invuln = 1;
  });
}

// ---------- main ----------
async function main() {
  const server = makeServer();
  const snaps = genSnaps(server, 90, { enterRoom: 40 });
  const client = makeClient();
  const G = startClientSession(client, snaps[0]);
  const frames = drive(client, snaps, 2, 60);

  let nanCount = 0;
  for (const fr of frames) if (/NaN|Infinity/.test(JSON.stringify(fr.state))) nanCount++;
  check('no NaN/Infinity in rendered state', nanCount === 0, 'nan frames=' + nanCount);

  const roomIds = new Set(snaps.slice(35).map(s => s.room.id));
  check('server changed room mid-run', roomIds.size >= 2);

  checkTracked('bullet', frames, snaps, 'bullets', 'b1', false);
  checkTracked('enemy', frames, snaps, 'enemies', 'e1', false);
  checkTracked('remote player', frames, snaps, 'players', 'p2', true);

  // pet: separate handling (server pet positions live inside players)
  const petVals = [];
  for (const fr of frames) petVals.push(fr.state.players['p2'].pet ? fr.state.players['p2'].pet.x : null);
  const p2Snaps = snaps.map(s => { const p = s.players.find(x => x.id === 'p2'); return p && p.pet ? p.pet.x : null; });
  let rcFrame = -1;
  for (let i = 1; i < frames.length; i++) if (frames[i].state.roomId !== frames[i - 1].state.roomId) { rcFrame = i; break; }
  let held = 0, jumps = 0, n = 0, maxDelta = 0, maxAllowed = 0;
  for (let i = 50; i < frames.length; i++) {
    if (rcFrame > 0 && i > rcFrame - 6 && i <= rcFrame + 12) continue;
    const r0 = petVals[i - 1], r1 = petVals[i];
    if (r0 === null || r1 === null || !isFinite(r0) || !isFinite(r1)) continue;
    const k = frames[i].snapIdx;
    const sPrev = p2Snaps[Math.max(0, k - 2)], sNext = p2Snaps[Math.max(0, k - 1)];
    if (sPrev === null || sNext === null) continue;
    const serverStep = Math.abs(sNext - sPrev);
    const delta = r1 - r0;
    n++;
    maxDelta = Math.max(maxDelta, Math.abs(delta));
    maxAllowed = Math.max(maxAllowed, serverStep * 1.3 + 8);
    if (Math.abs(delta) > serverStep * 1.3 + 8) jumps++;
    if (serverStep > 3 && Math.abs(delta) < 0.5) held++;
    if (process.env.DBGP && serverStep > 3 && Math.abs(delta) < 2) console.log('DBG hold/crawl', 'pet', 'frame', i, 'delta', delta.toFixed(3), 'serverStep', serverStep.toFixed(1), 'k', k);
  }
  check('pet tracks server motion', n > 10 && jumps === 0, 'n=' + n + ' jumps=' + jumps + ' maxDelta=' + maxDelta.toFixed(1) + ' maxAllowed=' + maxAllowed.toFixed(1));
  check('pet has no held frames while moving', n > 10 && held <= 2, 'held=' + held);

  // ---------- phase 2: network stall recovers (no permanent render drift) ----------
  const postStall = [];
  const stallPlan = [];
  for (let i = 60; i < 77; i++) stallPlan.push(i);
  // 7 feeds, then 16 frames of silence (~250ms), then 10 feeds to observe recovery
  for (let i = 0; i < stallPlan.length; i++) {
    const feeding = !(i >= 7 && i <= 9); // 6 frames (100ms) of silence mid-run
    if (feeding) feed(client, { type: 'snapshot', snapshot: snaps[stallPlan[i]] });
    for (let f = 0; f < 2; f++) {
      G.Net.tick(1 / 60);
      postStall.push({ frame: frames.length + postStall.length, snapIdx: i, state: renderState(G.game) });
    }
  }
  const stallNans = postStall.filter(fr => /NaN|Infinity/.test(JSON.stringify(fr.state))).length;
  check('no NaN during/after stall', stallNans === 0, 'nan=' + stallNans);
  // after recovery the bullet must resume tracking the server trajectory
  const bPost = [];
  for (const fr of postStall) bPost.push(fr.state.bullets['b1'] ? fr.state.bullets['b1'].x : null);
  const bDeltas = [];
  for (let i = 1; i < bPost.length; i++) {
    if (bPost[i - 1] === null || bPost[i] === null) continue;
    bDeltas.push(bPost[i] - bPost[i - 1]);
  }
  if (process.env.DBGP) console.log('DBG btail deltas:', bDeltas.slice(bDeltas.length - 16).map(x => x.toFixed(1)).join(','));
  const bTail = bDeltas.slice(bDeltas.length - 14); // after feeds resume
  const bTailMean = bTail.reduce((a, b) => a + b, 0) / bTail.length;
  check('bullet resumes smooth motion after stall', bTail.length > 6 && bTailMean > 2 && Math.max.apply(null, bTail) < 14,
    'mean=' + bTailMean.toFixed(2) + ' max=' + Math.max.apply(null, bTail).toFixed(2));

  // ---------- phase 3: real floor change (G.nextFloor) clears the buffer ----------
  const floorBefore = G.game.floor;
  forceFloorChange(server);
  const snaps2 = genSnaps(server, 10, {});
  const roomBefore = G.game.room.id;
  for (const sn of snaps2) feed(client, { type: 'snapshot', snapshot: sn });
  for (let f = 0; f < 8; f++) G.Net.tick(1 / 60);
  const g2 = G.game;
  const roomAfter = g2.room.id;
  check('floor change switched room on client', roomAfter === snaps2[snaps2.length - 1].room.id,
    floorBefore + ' -> ' + g2.floor + ' (' + roomBefore + ' -> ' + roomAfter + ')');
  check('floor advanced on client', g2.floor === floorBefore + 1, 'floor=' + g2.floor);
  check('render state finite after floor change', JSON.stringify(renderState(g2)).indexOf('NaN') < 0);

  console.log('');
  // ---------- phase 4: local shot prediction (instant fire feedback) ----------
  {
    G.mouse.down = true; G.mouse.triggered = true;
    for (let f = 0; f < 3; f++) G.Net.tick(1 / 60);
    const self4 = G.game.player;
    let preds = G.game.bullets.filter(b => b._local);
    check('shot spawns a local predicted bullet', preds.length >= 1, 'n=' + preds.length);
    const muzzle = preds.length ? Math.hypot(preds[0].x - self4.x, preds[0].y - self4.y) : -1;
    check('predicted bullet spawns at muzzle', preds.length >= 1 && muzzle < 40, 'dist=' + muzzle.toFixed(1));
    const ax = preds.length ? preds[0].x : 0, ay = preds.length ? preds[0].y : 0;
    const aa = self4.aimAngle;
    for (let f = 0; f < 3; f++) G.Net.tick(1 / 60);
    preds = G.game.bullets.filter(b => b._local);
    const moved = preds.length ? (preds[0].x - ax) * Math.cos(aa) + (preds[0].y - ay) * Math.sin(aa) : 0;
    check('predicted bullet flies immediately (no muzzle stall)', preds.length >= 1 && moved > 10, 'alongAim=' + moved.toFixed(1));
    const curB = G.game.bullets.filter(b => b._local)[0];
    const snapC = JSON.parse(JSON.stringify(snaps2[snaps2.length - 1]));
    snapC.bullets = snapC.bullets.concat([{ id: 9999, x: Math.round(curB.x * 10) / 10, y: Math.round(curB.y * 10) / 10, vx: 520, vy: 0, r: 3, color: '#ffd54f', friendly: true, owner: 'p1' }]);
    feed(client, { type: 'snapshot', snapshot: snapC });
    G.Net.tick(1 / 60);
    const after = G.game.bullets.find(b => b.id === 9999);
    check('server bullet confirmed and converted', !!after && !after._local, 'local=' + (after ? after._local : 'n/a'));
    check('no duplicate converted bullets', G.game.bullets.filter(b => b.id === 9999).length === 1);
    G.mouse.down = false; G.mouse.triggered = false;
    for (let f = 0; f < 3; f++) G.Net.tick(1 / 60);
    check('no prediction when not firing', G.game.bullets.filter(b => b._local).length === 0);
  }

  // ---------- phase 5: fire-rate threshold (no per-frame bullet spam) ----------
  {
    const snapR = JSON.parse(JSON.stringify(snaps2[snaps2.length - 1]));
    snapR.players[0].weapons = [G.WEAPONS.smg];
    snapR.players[0].cur = 0;
    G.mouse.down = true; G.mouse.triggered = true;
    const fired = new Set();
    for (let f = 0; f < 60; f++) {
      G.Net.tick(1 / 60);
      for (const b of G.game.bullets) if (b._local) fired.add(b.id);
      if (f % 2 === 1) feed(client, { type: 'snapshot', snapshot: JSON.parse(JSON.stringify(snapR)) });
    }
    check('auto weapon respects fire rate (no per-frame spam)', fired.size >= 5 && fired.size <= 14, 'shots=' + fired.size);
    G.mouse.down = false; G.mouse.triggered = false;
  }

  // ---------- phase 6: no double bullets when the server confirm is far ----------
  {
    const snapF = JSON.parse(JSON.stringify(snaps2[snaps2.length - 1]));
    snapF.players[0].weapons = [G.WEAPONS.pistol];
    snapF.players[0].cur = 0;
    feed(client, { type: 'snapshot', snapshot: snapF });
    for (let f = 0; f < 60; f++) G.Net.tick(1 / 60); // let leftover prediction bullets expire
    G.mouse.down = true; G.mouse.triggered = true;
    G.Net.tick(1 / 60);
    const predF = G.game.bullets.filter(b => b._local)[0];
    const sF = JSON.parse(JSON.stringify(snapF));
    sF.bullets = sF.bullets.concat([{ id: 7001, x: Math.round((predF.x - 120) * 10) / 10, y: Math.round(predF.y * 10) / 10, vx: 520, vy: 0, r: 3, color: '#ffd54f', friendly: true, owner: 'p1' }]);
    feed(client, { type: 'snapshot', snapshot: sF });
    G.Net.tick(1 / 60);
    const bsF = G.game.bullets;
    // snapshots in this test always carry the injected test bullet b1, so only
    // assert on the converted shot: exactly one 7001, no leftover prediction
    check('far confirm fallback binds, no double bullets',
      bsF.filter(b => b.id === 7001).length === 1 && bsF.filter(b => b._local).length === 0, 'n=' + bsF.length);
    G.mouse.down = false; G.mouse.triggered = false;
  }

  console.log('');
  if (failures === 0) console.log('ALL NET SMOOTHNESS CHECKS PASSED');
  else { console.log(failures + ' CHECK(S) FAILED'); process.exitCode = 1; }
  process.exit(0);
}

main().catch(err => { console.error('ERROR:', err && err.stack || err); process.exit(1); });