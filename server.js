/**
 * 晶域守卫者 · 静态文件服务器
 * 零依赖，仅使用 Node 内置模块。
 *
 * 启动：
 *   node server.js                 # 默认端口 8080
 *   node server.js --port 5173     # 指定端口
 *   $env:PORT=5173; node server.js # 或用环境变量 PORT
 *
 * 未来联机扩展：
 *   server.on('upgrade', ...) 已预留说明位（见 createServer 末尾），
 *   后续可在此挂载 WebSocket 服务，端口仍沿用本文件的配置逻辑，
 *   客户端同样通过环境变量/参数获取端口，避免写死。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { attachWs } = require('./net/game-server');

const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/** 把 URL 路径安全地解析为站点根目录内的文件路径；越界返回 null */
function resolveSafe(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) {
    return null;
  }
  let rel = decoded.split('?')[0];
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === '' || rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(ROOT, rel));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return null;
  return filePath;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

function handleRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 Method Not Allowed');
    return;
  }
  const filePath = resolveSafe(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    serveFile(res, filePath);
  });
}

/** 创建 HTTP 服务（含 WebSocket 联机）；返回实例 */
function createServer() {
  const server = http.createServer(handleRequest);
  attachWs(server);
  return server;
}

/** 解析端口：--port N / --port=N 优先，其次环境变量 PORT，最后默认 3000 */
function parsePort(argv, env) {
  let port = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      port = Number(argv[i + 1]);
      break;
    }
    if (argv[i].startsWith('--port=')) {
      port = Number(argv[i].slice('--port='.length));
      break;
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    port = Number(env.PORT);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    port = 8080; // 默认端口；联机扩展时仍可用 --port / PORT 覆盖
  }
  return port;
}

function main() {
  const port = parsePort(process.argv.slice(2), process.env);
  const server = createServer();
  server.listen(port, () => {
    const addr = server.address();
    const actual = typeof addr === 'object' && addr ? addr.port : port;
    console.log('晶域守卫者服务器已启动: http://localhost:' + actual + '/');
    console.log('联机功能已启用（WebSocket，每房最多 4 人）');
    console.log('按 Ctrl+C 停止');
  });
}

module.exports = { createServer, parsePort, resolveSafe };

if (require.main === module) main();
