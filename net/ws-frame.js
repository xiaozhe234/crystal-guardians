/**
 * 零依赖 WebSocket 服务端（RFC 6455）· 文本帧
 * 支持分片重组、ping/pong、close；客户端帧必须带 mask。
 */
'use strict';
const crypto = require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

class WsConnection {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.onMessage = null; // (str) => void
    this.onClose = null;   // () => void
    this._closed = false;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._drain(); });
    socket.on('close', () => this._handleClose());
    socket.on('error', () => {});
  }

  _handleClose() {
    if (this._closed) return;
    this._closed = true;
    if (this.onClose) this.onClose();
  }

  _drain() {
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      let maskKey = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        maskKey = this.buf.slice(off, off + 4);
        off += 4;
      }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (masked && len > 0) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      this.buf = this.buf.slice(off + len);
      if (opcode === 0x8) { // close
        this._sendFrame(0x8, Buffer.alloc(0));
        try { this.socket.end(); } catch (e) {}
        this._handleClose();
        return;
      } else if (opcode === 0x9) { // ping -> pong
        this._sendFrame(0xa, payload);
        continue;
      } else if (opcode === 0xa) { // pong
        continue;
      } else if (opcode === 0x1 || opcode === 0x0) { // text / continuation
        if (opcode === 0x1) this.fragments = [];
        this.fragments.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          if (this.onMessage) {
            try { this.onMessage(msg); } catch (e) { console.error('ws onMessage error:', e); }
          }
        }
      }
      // 其他 opcode 忽略
    }
  }

  _sendFrame(opcode, payload) {
    if (this._closed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) {}
  }

  sendText(str) {
    this._sendFrame(0x1, Buffer.from(String(str), 'utf8'));
  }

  close() {
    try {
      this._sendFrame(0x8, Buffer.alloc(0));
      this.socket.end();
    } catch (e) {}
    this._handleClose();
  }
}

/** 完成 WebSocket 握手并返回连接；握手失败返回 null */
function handleUpgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
  );
  if (head && head.length) socket.unshift(head);
  return new WsConnection(socket);
}

module.exports = { handleUpgrade, WsConnection, acceptKey };