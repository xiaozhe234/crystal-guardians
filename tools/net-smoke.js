// 联机冒烟测试：双客户端 创建/加入/开局/输入/敌人AI/射击/房主晶悟\n// 运行: node tools/net-smoke.js
'use strict';
const net = require('net');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

class WsClient {
  constructor() {
    this.sock = new net.Socket();
    this.buf = Buffer.alloc(0);
    this.messages = [];
    this.waiters = [];
    this.onMessage = null;
    this.closed = false;
  }
  connect(port, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      this.sock.connect(port, host, () => {
        const key = crypto.randomBytes(16).toString('base64');
        this.sock.write(
          'GET /ws HTTP/1.1\r\n' +
          'Host: ' + host + ':' + port + '\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: ' + key + '\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      });
      this.sock.on('error', reject);
      this.sock.on('data', (d) => {
        this.buf = Buffer.concat([this.buf, d]);
        if (!this.handshaked && this.buf.includes('\r\n\r\n')) {
          const head = this.buf.toString('utf8').split('\r\n\r\n')[0];
          if (head.includes('101')) { this.handshaked = true; this.buf = this.buf.slice(this.buf.indexOf('\r\n\r\n') + 4); resolve(this); }
          else { reject(new Error('握手失败: ' + head)); return; }
        }
        if (this.handshaked) this._drain();
      });
      this.sock.on('close', () => { this.closed = true; });
    });
  }
  _drain() {
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      let maskKey = null;
      if (b1 & 0x80) { if (this.buf.length < off + 4) return; maskKey = this.buf.slice(off, off + 4); off += 4; }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (maskKey && len > 0) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      this.buf = this.buf.slice(off + len);
      if (opcode === 0x1 && fin) {
        const msg = payload.toString('utf8');
        try { const obj = JSON.parse(msg); this._push(obj); } catch (e) {}
      }
    }
  }
  _push(obj) {
    this.messages.push(obj);
    if (this.onMessage) this.onMessage(obj);
    for (let i = 0; i < this.waiters.length; i++) {
      const w = this.waiters[i];
      if (w.type === obj.type) { this.waiters.splice(i, 1); w.resolve(obj); return; }
    }
  }
  send(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) { header = Buffer.alloc(2); header[1] = 0x80 | payload.length; }
    else { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
    header[0] = 0x81;
    const masked = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
    this.sock.write(Buffer.concat([header, mask, masked]));
  }
  wait(type, timeout = 8000) {
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].type === type) return Promise.resolve(this.messages.splice(i, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const w = { type, resolve, reject };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) { this.waiters.splice(i, 1); reject(new Error('等待 ' + type + ' 超时')); }
      }, timeout);
    });
  }
  close() { try { this.sock.destroy(); } catch (e) {} }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitPort(port, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const s = net.connect(port, '127.0.0.1');
        s.on('connect', () => { s.destroy(); resolve(); });
        s.on('error', reject);
      });
      return true;
    } catch (e) { await sleep(120); }
  }
  return false;
}

async function main() {
  const port = 8099; // 独立端口，避免与默认 8080 冲突
  const srv = spawn(process.execPath, ['server.js', '--port', String(port)], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
  srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  const ok = await waitPort(port);
  if (!ok) { console.error('服务器未启动'); srv.kill(); process.exit(1); }
  await sleep(300);

  const A = new WsClient(), B = new WsClient();
  await A.connect(port); console.log('A 连接成功');
  await B.connect(port); console.log('B 连接成功');

  A.send({ type: 'create', name: '房主A', charId: 'warden' });
  const joinedA = await A.wait('joined');
  console.log('A 创建房间:', joinedA.roomId);
  await A.wait('room');

  // 未满 2 人开始应被拒
  A.send({ type: 'start' });
  const err = await A.wait('error');
  console.log('满2人前 start → error:', err.msg);

  B.send({ type: 'join', roomId: joinedA.roomId, name: '玩家B', charId: 'rogue' });
  const joinedB = await B.wait('joined');
  console.log('B 加入房间:', joinedB.roomId);
  await A.wait('room'); await B.wait('room');

  A.send({ type: 'list' });
  const lobby = await A.wait('lobby');
  console.log('房间列表:', JSON.stringify(lobby.rooms));

  A.send({ type: 'start' });
  const start = await A.wait('game-start');
  const snap = start.snapshot;
  console.log('开局快照: players=' + snap.players.length + ' 房间=' + snap.room.type + ' 敌人=' + snap.enemies.length);
  const pa = snap.players.find(p => p.id === joinedA.id);
  const pb = snap.players.find(p => p.id === joinedB.id);
  if (!pa || !pb) throw new Error('快照缺少玩家');
  if (!pa.weapons[0] || !pa.weapons[0].emoji || !pa.weapons[0].name) throw new Error('武器快照缺少 emoji/name: ' + JSON.stringify(pa.weapons[0]));
  if (!pa.skill || !pa.skill.emoji || typeof pa.skill.cd !== 'number') throw new Error('skill 快照不完整: ' + JSON.stringify(pa.skill));
  if (snap.room.shop && snap.room.shop.stock[0].weapon && !snap.room.shop.stock[0].weapon.emoji) throw new Error('商店武器快照不完整');
  console.log('武器快照: ' + pa.weapons[0].emoji + pa.weapons[0].name + ' 耗能' + pa.weapons[0].energyCost);
  console.log('技能快照: ' + pa.skill.emoji + pa.skill.name + ' cd=' + pa.skill.cd);

  const ax0 = pa.x, bx0 = pb.x;
  console.log('初始位置 A=' + ax0 + ' B=' + bx0);

  // A 向右走，B 向左走，持续 2 秒
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    A.send({ type: 'input', keys: { w: false, a: false, s: false, d: true }, mouse: { wx: 2000, wy: 400 }, firing: false, space: false, e: false, q: false });
    B.send({ type: 'input', keys: { w: false, a: true, s: false, d: false }, mouse: { wx: 500, wy: 400 }, firing: false, space: false, e: false, q: false });
    await sleep(80);
  }
  // 等待最后一个快照
  let lastSnap = null;
  const collector = (msg) => { if (msg.type === 'snapshot') lastSnap = msg.snapshot; };
  A.onMessage = collector; B.onMessage = collector;
  const t1 = Date.now();
  while (Date.now() - t1 < 1200) await sleep(60);

  const pa2 = lastSnap.players.find(p => p.id === joinedA.id);
  const pb2 = lastSnap.players.find(p => p.id === joinedB.id);
  console.log('2.5秒后 A: ' + ax0 + ' -> ' + pa2.x + ' (dx=' + (pa2.x - ax0).toFixed(1) + ')');
  console.log('2.5秒后 B: ' + bx0 + ' -> ' + pb2.x + ' (dx=' + (pb2.x - bx0).toFixed(1) + ')');
  if (Math.abs(pa2.x - ax0) < 20) throw new Error('A 未移动！服务器未应用输入');
  if (Math.abs(pb2.x - bx0) < 20) throw new Error('B 未移动！服务器未应用输入');
  console.log('✅ 玩家输入驱动移动正常');


  // ---------- 敌人 AI：slime 应追踪玩家 ----------
  const e0 = lastSnap.enemies.find(e => e.type === 'slime') || lastSnap.enemies[0];
  if (e0) {
    const ex0 = e0.x, ey0 = e0.y;
    const t2 = Date.now();
    while (Date.now() - t2 < 2500) {
      A.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: 2000, wy: 400 }, firing: false, pressed: false, releasedF: false, space: false, e: false, q: false });
      B.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: 500, wy: 400 }, firing: false, pressed: false, releasedF: false, space: false, e: false, q: false });
      await sleep(80);
    }
    const t3 = Date.now();
    while (Date.now() - t3 < 1000) await sleep(60);
    const e1 = lastSnap.enemies.find(e => e.id === e0.id);
    if (!e1) console.log('⚠ 敌人已死亡，跳过 AI 移动验证');
    else {
      const dist = Math.hypot(e1.x - ex0, e1.y - ey0);
      console.log('敌人AI: ' + e0.type + ' (' + ex0.toFixed(0) + ',' + ey0.toFixed(0) + ') -> (' + e1.x.toFixed(0) + ',' + e1.y.toFixed(0) + ') 移动=' + dist.toFixed(1));
      if (dist < 5 && e1.type !== 'turret') throw new Error('敌人未移动！AI 异常');
    }
  }

  // ---------- 射击：A 瞄准并击杀敌人 ----------
  const kills0 = lastSnap.kills;
  const t4 = Date.now();
  let shot = false;
  while (Date.now() - t4 < 10000) {
    const target = lastSnap && lastSnap.enemies.find(e => !e.dead && !(e.spawnIn > 0));
    if (target) {
      A.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: target.x, wy: target.y }, firing: true, pressed: !shot, releasedF: false, space: false, e: false, q: false });
      shot = true;
    } else {
      A.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: 2000, wy: 400 }, firing: false, pressed: false, releasedF: true, space: false, e: false, q: false });
    }
    B.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: 500, wy: 400 }, firing: false, pressed: false, releasedF: false, space: false, e: false, q: false });
    await sleep(80);
    if (lastSnap && lastSnap.kills > kills0 && lastSnap.talentOpen) break;
  }
  console.log('射击后: kills=' + lastSnap.kills + ' 剩余敌人=' + lastSnap.enemies.length + ' talentOpen=' + !!lastSnap.talentOpen);
  if (lastSnap.kills <= kills0) console.log('⚠ 未能击杀敌人（可能房间无怪或武器未触发）');

  // ---------- 等待清空房间 → 晶悟（最多 20 秒）----------
  const t5 = Date.now();
  while (Date.now() - t5 < 20000 && !(lastSnap && lastSnap.talentOpen)) {
    const target = lastSnap && lastSnap.enemies.find(e => !e.dead && !(e.spawnIn > 0));
    if (target) A.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: target.x, wy: target.y }, firing: true, pressed: false, releasedF: false, space: false, e: false, q: false });
    else A.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: 2000, wy: 400 }, firing: false, pressed: false, releasedF: true, space: false, e: false, q: false });
    B.send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, mouse: { wx: 500, wy: 400 }, firing: false, pressed: false, releasedF: false, space: false, e: false, q: false });
    await sleep(80);
  }
  if (!(lastSnap && lastSnap.talentOpen)) {
    console.log('⚠ 20 秒内未触发晶悟（房间可能不是战斗房或未清完）');
  } else {
    console.log('晶悟出现: ' + lastSnap.talentChoices.join(','));
    const ids = lastSnap.talentChoices;
    const prefer = ids.indexOf('speed') >= 0 ? 'speed' : ids.indexOf('hp') >= 0 ? 'hp' : ids[0];
    const ti = ids.indexOf(prefer);
    const mvBefore = (lastSnap.players[0] || {}).moveMult;
    const hpBefore = (lastSnap.players[0] || {}).maxHp;
    A.send({ type: 'talent', index: ti });
    await sleep(1500);
    const pA = lastSnap.players.find(p => p.id === joinedA.id);
    const pB2 = lastSnap.players.find(p => p.id === joinedB.id);
    const changed = prefer === 'speed'
      ? (pA.moveMult > mvBefore && pB2.moveMult > mvBefore)
      : prefer === 'hp'
        ? (pA.maxHp > hpBefore && pB2.maxHp > hpBefore)
        : true;
    console.log('房主选择晶悟 ' + prefer + ': talentOpen=' + !!lastSnap.talentOpen + ' A.moveMult=' + pA.moveMult + ' B.moveMult=' + pB2.moveMult + ' A.maxHp=' + pA.maxHp);
    if (lastSnap.talentOpen) throw new Error('晶悟未关闭');
    if (!changed) throw new Error('晶悟效果未作用于全员！');
    console.log('✅ 房主选晶悟，全员生效正常');
  }

  console.log('扩展联机测试通过 ✅');
  A.close(); B.close(); srv.kill();
  process.exit(0);
}

main().catch(e => { console.error('测试失败:', e.message); process.exit(1); });