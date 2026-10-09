// 联机客户端渲染冒烟测试：真实服务器快照 → 前端 net.js 接收 → 全 UI 绘制路径无异常
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GAME_FILES = ['utils.js','config.js','audio.js','save.js','effects.js','bullets.js','weapons.js','talents.js','player.js','enemies.js','items.js','dungeon.js','ui.js','main.js'];
const { snapshotOf } = require('../net/game-server');

// ---------- 通用沙箱 ----------
function makeBaseContext() {
  return {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, JSON, Date, Object, Array, Number, String, Boolean, Error, Promise, Map, Set, RegExp,
    parseInt, parseFloat, isNaN, isFinite
  };
}
function loadGame(context) {
  vm.createContext(context);
  const base = path.join(ROOT, 'game', 'js');
  for (const f of GAME_FILES) vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), context, { filename: f });
  return context.window.G;
}

// ---------- 服务器侧：真实模拟 ----------
const srvCtx = makeBaseContext();
srvCtx.window = srvCtx;
srvCtx.navigator = { userAgent: 'node' };
srvCtx.localStorage = { _d: {}, getItem() { return null; }, setItem() {}, removeItem() {} };
srvCtx.performance = { now: () => Date.now() };
srvCtx.requestAnimationFrame = () => {};
srvCtx.AudioContext = function () { return { state: 'running', currentTime: 0, sampleRate: 44100, destination: {}, resume() {}, createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }, createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }, createBuffer() { return { getChannelData() { return new Float32Array(1024); } }; }, createBufferSource() { return { buffer: null, connect() {}, start() {} }; }, createBiquadFilter() { return { frequency: { value: 0 }, connect() {} }; } }; };
srvCtx.document = { getElementById() { return null; } };
const srvG = loadGame(srvCtx);
srvG.audio.enabled = false;
srvG.saveLoad();
const srvGame = srvG.startNetRun([
  { id: 'p1', name: '房主A', charId: 'warden' },
  { id: 'p2', name: '玩家B', charId: 'rogue' }
]);
for (let i = 0; i < 30; i++) srvG.debugStep(1 / 30);
let snap = snapshotOf(srvGame, srvG);
// 触发下一潮：手动清空当前房间敌人
for (const e of [...srvGame.enemies]) { e.hp = 0; e.die(srvGame); }
srvGame.enemies = srvGame.enemies.filter(e => !e.dead);
for (let i = 0; i < 90; i++) srvG.debugStep(1 / 30);
snap = snapshotOf(srvGame, srvG);
console.log('服务器快照: 房间=' + snap.room.type + ' 蚀潮=' + snap.room.wave + '/' + snap.room.waveMax + ' 敌人=' + snap.enemies.length + ' talentOpen=' + !!snap.talentOpen + ' 敌人类型=' + (snap.enemies[0] ? snap.enemies[0].type : '无'));

// ---------- 客户端侧：DOM/WS stub ----------
function makeCtx2d() {
  const store = {};
  const noop = () => {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function makeEl() {
  const el = {
    style: {}, children: [], value: '', _text: '', _html: '',
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() {},
    set innerHTML(v) { el._html = v; },
    get innerHTML() { return el._html; },
    set textContent(v) { el._text = v; },
    get textContent() { return el._text; },
    querySelector() { return makeEl(); },
    set onclick(f) { el._onclick = f; },
    get onclick() { return el._onclick; }
  };
  return el;
}
const clientCtx = makeBaseContext();
clientCtx.window = clientCtx;
clientCtx.navigator = { userAgent: 'node' };
clientCtx.localStorage = { _d: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem() {} };
clientCtx.performance = { now: () => Date.now() };
clientCtx.requestAnimationFrame = () => {};
clientCtx.AudioContext = srvCtx.AudioContext;
clientCtx.location = { protocol: 'http:', host: 'localhost:8080' };
clientCtx.innerWidth = 1280; clientCtx.innerHeight = 720;
clientCtx.devicePixelRatio = 1;
clientCtx.addEventListener = () => {};
const fakeCanvas = { getContext: () => makeCtx2d(), addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), style: {}, width: 1280, height: 720 };
clientCtx.document = {
  body: makeEl(),
  getElementById(id) { return id === 'game' ? fakeCanvas : null; },
  createElement() { return makeEl(); }
};
let fakeWs = null;
const FakeWS = class FakeWS {
  constructor(url) { this.url = url; fakeWs = this; this.readyState = 0; }
  send(d) { FakeWS.sent.push(d); }
  close() {}
};
clientCtx.WebSocket = FakeWS;
FakeWS.sent = [];
const clientG = loadGame(clientCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'game', 'js', 'net.js'), 'utf8'), clientCtx, { filename: 'net.js' });
clientG.audio.enabled = false;

// 进入联机大厅 → 建立连接
clientG.Net.openLobby();
if (!fakeWs) throw new Error('openLobby 未创建 WebSocket');
fakeWs.readyState = 1;
fakeWs.onopen();
console.log('客户端已连接，发送消息数=' + FakeWS.sent.length);

// 注入 game-start 快照
fakeWs.onmessage({ data: JSON.stringify({ type: 'game-start', roomId: '101', snapshot: snap }) });
if (clientG.state !== 'netgame') throw new Error('state 应为 netgame，实际 ' + clientG.state);
console.log('game-start 已应用: state=' + clientG.state + ' 玩家=' + clientG.game.players.length + ' 房间=' + clientG.game.room.type);

// 注入多帧快照
for (let i = 0; i < 20; i++) fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: snap }) });

// ---------- 渲染路径 ----------
function renderAll(label) {
  clientG.FX.draw(makeCtx2d());
  clientG.UI.drawRoom(clientG.game);
  clientG.UI.drawHUD(clientG.game);
  if (clientG.game.talentOpen) clientG.UI.drawTalent(clientG.game);
  if (clientG.game.player && clientG.game.player.shopOpen) clientG.UI.drawShop(clientG.game);
  console.log('渲染 OK: ' + label);
}
renderAll('基础快照');

// 蚀潮预告变体
const v2 = JSON.parse(JSON.stringify(snap));
v2.room.waveState = 'telegraph';
v2.room.waveSpawns = [{ x: 100, y: 100 }, { x: 200, y: 200 }];
fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: v2 }) });
renderAll('蚀潮预告');

// 商店房间变体
const v3 = JSON.parse(JSON.stringify(snap));
v3.room.type = 'shop';
v3.room.shop = { x: 300, y: 300, dead: false, stock: [
  { kind: 'weapon', weapon: clientG.WEAPONS[Object.keys(clientG.WEAPONS)[0]], price: 20, sold: false },
  { kind: 'potion', type: 'hp', name: '生命药水', price: 15, desc: '回复3生命', sold: false }
] };
v3.players[0].shopOpen = true;
fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: v3 }) });
renderAll('商店');
clientG.UI.drawShop(clientG.game);

// 晶界传送/晶泉房变体
const v4 = JSON.parse(JSON.stringify(snap));
v4.room.type = 'boss';
v4.room.portal = { x: 400, y: 400 };
v4.room.revive = { x: 100, y: 400, used: false };
v4.enemies = [{ id: 'b1', type: 'slimeboss', boss: true, elite: false, name: '蚀浆之王', x: 300, y: 300, hp: 50, maxHp: 50, r: 26, color: '#f87171', spawnIn: 0, state: 'idle', stateT: 0, slowT: 0, burnT: 0 }];
v4.dungeon.bossUnlocked = true;
v4.room.cleared = true;
fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: v4 }) });
renderAll('BOSS+晶界传送+泉水');

// 晶悟选择（房主）
const v5 = JSON.parse(JSON.stringify(snap));
v5.talentOpen = true;
v5.talentChoices = ['hp', 'dmg', 'speed'];
fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: v5 }) });
renderAll('晶悟界面');
clientG.UI.drawTalent(clientG.game);

// 暂停菜单（联机）
clientG.paused = true;
clientG.UI.drawPause(clientG.game);
clientG.paused = false;
console.log('渲染 OK: 联机暂停菜单');

// 大厅背景
clientG.state = 'lobby';
clientG.UI.drawLobbyBg();
console.log('渲染 OK: 大厅背景');

// 结算界面（联机返回大厅）—— 通过真实 game-over 消息触发
fakeWs.onmessage({ data: JSON.stringify({ type: 'game-over', win: true, floor: 1, gems: 10 }) });
if (clientG.state !== 'victory') throw new Error('game-over 未切换到 victory');
clientG.UI.drawVictory(clientG.game);
console.log('渲染 OK: 联机结算 (inSession=' + clientG.Net.inSession + ')');

// Net.tick 空跑（重新开局 → 激活联机状态）
fakeWs.onmessage({ data: JSON.stringify({ type: 'game-start', roomId: '101', snapshot: snap }) });
fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: snap }) });
clientG.state = 'netgame';
const before = FakeWS.sent.length;
clientG.Net.tick(1 / 30);
console.log('Net.tick 输入消息: ' + (FakeWS.sent.length - before));
if (FakeWS.sent.length === before) throw new Error('Net.tick 未发送输入');

// 玩家死亡观战状态
const v6 = JSON.parse(JSON.stringify(snap));
v6.players[0].dead = true;
fakeWs.onmessage({ data: JSON.stringify({ type: 'snapshot', snapshot: v6 }) });
clientG.UI.drawHUD(clientG.game);
console.log('渲染 OK: 死亡观战');

console.log('✅ 客户端渲染冒烟测试全部通过');
process.exit(0);
