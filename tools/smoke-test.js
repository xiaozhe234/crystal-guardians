const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = {};
global.navigator = { userAgent: 'node' };
global.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
global.AudioContext = function () {
  return {
    state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
    resume() {},
    createOscillator() {
      return {
        type: 'square',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, start() {}, stop() {}
      };
    },
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    createBuffer() { return { getChannelData() { return new Float32Array(1024); } }; },
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; },
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
  };
};
global.document = { getElementById() { return null; } };

const files = [
  'utils.js', 'config.js', 'audio.js', 'save.js', 'effects.js', 'bullets.js',
  'weapons.js', 'talents.js', 'player.js', 'enemies.js', 'items.js', 'dungeon.js',
  'ui.js', 'main.js'
];
const base = path.join(__dirname, '..', 'game', 'js');
for (const f of files) {
  vm.runInThisContext(fs.readFileSync(path.join(base, f), 'utf8'), { filename: f });
}

const G = window.G;
G.audio.enabled = false;
G.saveLoad();
G.save.gems = 2000;
G.selectedChar = 'warden';
G.useFactors = false;

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL:', name); }
  else console.log('ok  :', name);
}

function step(n, keys, mouse) {
  for (let i = 0; i < n; i++) {
    G.keys = keys || {};
    G.mouse = mouse || { x: 480, y: 270, down: false, triggered: false, released: false, clicked: false };
    G.debugStep(1 / 60);
    if (G.game && G.game.talentOpen && G.game.talentChoices.length) G.applyTalentChoice(G.game, G.game.talentChoices[0]);
  }
}

function nearestUncleared(dungeon, fromId) {
  const seen = new Set([fromId]);
  const q = [fromId];
  while (q.length) {
    const cur = q.shift();
    const r = dungeon.roomOf[cur];
    if ((r.type === 'monster' || r.type === 'elite') && !r.cleared) return cur;
    for (const d of ['left', 'right', 'up', 'down']) {
      const door = r.doors[d];
      if (!door || seen.has(door.to)) continue;
      seen.add(door.to);
      q.push(door.to);
    }
  }
  return null;
}

function drainWaves(game) {
  // 杀光已激活敌人，并推进蚀潮状态机，直到房间清空（每潮约2秒）
  let wg = 0;
  while (wg++ < 300 && !game.finished) {
    const rm = game.room;
    if (rm.waveMax <= 1 || rm.cleared) break;
    for (const e of game.enemies.slice()) if (!e.dead) e.takeDamage(9999, game, { crit: false });
    if (rm.waveState === 'active' && !game.enemies.some(e => !e.dead) && rm.wave >= rm.waveMax) break;
    step(6);
  }
}

function scriptedRun(charId, useFactors, onRoom) {
  G.startRun(charId, useFactors);
  const game = G.game;
  let guard = 0;
  while (!game.finished && guard++ < 4000) {
    for (const e of game.enemies.slice()) if (!e.dead) e.takeDamage(9999, game, { crit: false });
    if (game.talentOpen) G.applyTalentChoice(game, game.talentChoices[0]);
    for (const pk of game.pickups.slice()) if (!pk.dead) { pk.x = game.player.x; pk.y = game.player.y; pk.collect(game); }
    for (const c of game.room.chests.slice()) if (!c.opened) c.open(game);
    if (game.room.shop && !game.shopOpen) {
      game.shopOpen = true;
      for (const it of game.room.shop.stock.slice()) if (!it.sold) G.buyShopItem(game, it);
      let rcGuard = 0;
      while (game.replaceConfirm && rcGuard++ < 4) G.confirmReplaceWeapon(game);
      game.shopOpen = false;
    }
    if (onRoom) onRoom(game, guard);
    step(6);
    drainWaves(game);
    if (game.room.portal) {
      game.player.x = game.room.portal.x;
      game.player.y = game.room.portal.y;
      step(6);
      continue;
    }
    let targetId = null;
    if (!game.dungeon.bossUnlocked) targetId = nearestUncleared(game.dungeon, game.room.id);
    if (targetId === null || targetId === game.room.id) {
      const bossRoom = game.dungeon.rooms.find(r => r.type === 'boss');
      targetId = bossRoom ? bossRoom.id : null;
    }
    if (targetId === null || targetId === game.room.id) { step(10); continue; }
    G.enterRoom(game, targetId);
    game.player.x = game.room.x + game.room.w / 2;
    game.player.y = game.room.y + game.room.h / 2;
    game.player.invuln = Math.max(game.player.invuln, 0.6);
  }
  return game;
}

check('characters loaded', G.CHARACTERS.length === 6);
check('weapons loaded', Object.keys(G.WEAPONS).length === 12);
check('floor gen x3', [1, 2, 3].every(f => {
  const d = G.generateFloor(f);
  const monsters = d.rooms.filter(r => r.type === 'monster' || r.type === 'elite' || r.type === 'boss').length;
  const rewards = d.rooms.filter(r => r.type === 'shop' || r.type === 'treasure' || r.type === 'revive').length;
  const start = d.roomOf[0];
  return monsters >= 4 && monsters <= 7 &&
    rewards >= 1 && rewards <= 3 &&
    start.type === 'start' && start.cleared === true &&
    d.roomOf[d.bossCell].type === 'boss';
}));
check('talent pool', G.rollTalents(3).length === 3);

// 商店界面绘制回归：drawShop 曾因 p 未定义崩溃
{
  const fakeCtx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, ellipse() {}, rect() {}, fillRect() {}, strokeRect() {}, fill() {}, stroke() {},
    clip() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, fillText() {},
    measureText: () => ({ width: 10 })
  };
  const oldCtx = G.ctx;
  G.ctx = fakeCtx;
  G.startRun('warden', false);
  const sg = G.game;
  const shopRoom = sg.dungeon.rooms.find(r => r.type === 'shop');
  G.enterRoom(sg, shopRoom.id);
  sg.shopOpen = true;
  let shopErr = null;
  try { G.UI.drawShop(sg); } catch (e) { shopErr = e; }
  G.ctx = oldCtx;
  check('drawShop no crash', !shopErr);
  check('shop stock rendered', !!shopRoom.shop && shopRoom.shop.stock.length === 4);
}

// 商店武器替换确认流程
{
  G.startRun('warden', false);
  const sg = G.game;
  const shopRoom = sg.dungeon.rooms.find(r => r.type === 'shop');
  G.enterRoom(sg, shopRoom.id);
  const wItem = shopRoom.shop.stock.find(it => it.kind === 'weapon');
  sg.player.weapons = [new G.Weapon(G.WEAPONS.pistol), new G.Weapon(G.WEAPONS.smg)];
  sg.player.cur = 0;
  sg.player.coins = 1000;
  const before = sg.player.coins;
  G.buyShopItem(sg, wItem);
  check('weapon slot full -> confirm', !!sg.replaceConfirm && sg.replaceConfirm.item === wItem && sg.player.coins === before && !wItem.sold);
  const oldCurId = sg.player.weapons[0].id;
  G.confirmReplaceWeapon(sg);
  check('confirm replaces current weapon', !sg.replaceConfirm && wItem.sold && sg.player.coins === before - wItem.price && sg.player.weapons[0].id === wItem.weapon.id && sg.player.weapons[0].id !== oldCurId);
  const wItem2 = shopRoom.shop.stock.find(it => it.kind === 'weapon' && !it.sold);
  if (wItem2) {
    sg.player.coins = 1000;
    G.buyShopItem(sg, wItem2);
    const c2 = sg.player.coins;
    sg.replaceConfirm = null; // 模拟点“取消”
    check('cancel keeps money', sg.player.coins === c2 && !wItem2.sold);
  }
}

// 怪物生成不重叠障碍物
{
  let overlapFree = true, roomsChecked = 0;
  for (let fi = 1; fi <= 3; fi++) {
    const d = G.generateFloor(fi);
    for (const r of d.rooms) {
      if (r.type !== 'monster' && r.type !== 'elite' && r.type !== 'start') continue;
      G.loadRoom({ floor: fi, enemyHpMult: 1, enemySpeedMult: 1 }, r);
      roomsChecked++;
      if (r.enemies.some(e => r.obstacles.some(ob => !ob.dead && G.dist(e.x, e.y, ob.x, ob.y) < 60))) overlapFree = false;
    }
  }
  check('enemies not overlapping obstacles', overlapFree && roomsChecked >= 8);
}

{
  const d = G.generateFloor(1);
  const rw = d.rooms.find(r => r.type === 'shop' || r.type === 'treasure' || r.type === 'revive');
  G.loadRoom({ floor: 1, enemyHpMult: 1, enemySpeedMult: 1 }, rw);
  check('reward room no enemies', !!rw && rw.cleared === true && rw.enemies.length === 0);
  const mon = d.rooms.find(r => r.type === 'monster' || r.type === 'elite');
  G.loadRoom({ floor: 1, enemyHpMult: 1, enemySpeedMult: 1 }, mon);
  const total = mon.enemies.length;
  const waveTotal = mon.waves.reduce((s, w) => s + w.length, 0);
  check('waves set up', mon.waveMax >= 2 && mon.waveMax <= 3 && total === waveTotal && total >= 4 && total <= 12);
}

const game = scriptedRun('warden', true, (g) => {
  if (g.player.hp < 3) g.player.hp = g.player.maxHp;
});
check('full run finished', game.finished === true);
check('victory state', game.win === true);
check('reached floor 3', game.floor >= 3);
check('earned gems', game.gemsEarned > 0);
check('save wins++', G.save.wins >= 1);
check('kills counted', game.kills > 0);
check('coins collected', game.player.coins > 0);
check('bosses defeated', game.bossKills === 3);

const game2 = scriptedRun('mage', false);
check('mage full run', game2.finished === true && game2.win === true);

G.startRun('rogue', false);
const g3 = G.game;
g3.player.invuln = 0;
g3.player.takeDamage(999, g3);
check('player dead flag', g3.player.dead === true);
step(120);
check('gameover after death', G.state === 'gameover' && G.game.finished);

for (const c of G.CHARACTERS) {
  G.startRun(c.id, false);
  const g = G.game;
  g.player.energy = g.player.maxEnergy;
  for (let i = 0; i < 3; i++) { g.player.useSkill(g); step(30); }
  check('skill ok: ' + c.id, !isNaN(g.player.hp) && g.player.hp > 0);
}

G.startRun('warden', false);
{
  const g = G.game;
  for (const wid of Object.keys(G.WEAPONS)) {
    const w = new G.Weapon(G.WEAPONS[wid]);
    g.player.weapons = [w];
    g.player.cur = 0;
    g.player.energy = g.player.maxEnergy;
    step(40, { d: true }, { x: 900, y: 300, down: true, triggered: false, released: false, clicked: false });
    step(5);
    check('weapon fire ok: ' + wid, g.player.hp > 0);
  }
}

G.startRun('warden', false);
{
  const g = G.game;
  const keysList = ['w', 'a', 's', 'd'];
  let err = null;
  try {
    for (let i = 0; i < 12000; i++) {
      G.keys = {};
      G.keys[keysList[Math.floor(Math.random() * keysList.length)]] = true;
      G.mouse = { x: 100 + Math.random() * 760, y: 100 + Math.random() * 340, down: Math.random() < 0.8, triggered: Math.random() < 0.2, released: false, clicked: false };
      G.debugStep(1 / 60);
      if (g.talentOpen && g.talentChoices.length) G.applyTalentChoice(g, g.talentChoices[0]);
    }
  } catch (e) { err = e; }
  check('random walk no crash', !err);
}

G.save.gems = 500;
G.save.unlocked = ['warden'];
G.saveWrite();
const raw = JSON.parse(localStorage.getItem('yqq_save_v1'));
check('save persist', raw.gems === 500 && raw.unlocked.length === 1);
G.saveLoad();
check('all characters unlocked', G.CHARACTERS.every(c => G.save.unlocked.includes(c.id)));

console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECKS FAILED');
process.exit(failures === 0 ? 0 : 1);
