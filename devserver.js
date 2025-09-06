// Simple static server with SSE live-reload on port 8000
// Usage: node devserver.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const ROOT = process.cwd();

// Track EventSource clients
const clients = new Set();

function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`: connected\n\n`);
  clients.add(res);
  req.on('close', () => {
    clients.delete(res);
  });
}

function broadcastReload() {
  for (const res of clients) {
    try {
      res.write(`event: reload\n`);
      res.write(`data: now\n\n`);
    } catch (_) {
      // will be cleaned up on close
    }
  }
}

function contentType(p) {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.ico': return 'image/x-icon';
    case '.wasm': return 'application/wasm';
    case '.map': return 'application/octet-stream';
    default: return 'application/octet-stream';
  }
}

function safeJoin(root, p) {
  const resolved = path.join(root, p);
  if (!resolved.startsWith(root)) return root; // path traversal guard
  return resolved;
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (pathname === '/__livereload') {
    return sseHandler(req, res);
  }

  // Default file mapping
  let filePath = safeJoin(ROOT, decodeURIComponent(pathname));
  try {
    const stat = fs.existsSync(filePath) && fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (_) {
    // fall through to 404
  }

  // If root path, serve index.html
  if (pathname === '/') {
    filePath = path.join(ROOT, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[dev] Serving ${ROOT} at http://localhost:${PORT}`);
  console.log('[dev] Live-reload enabled (SSE)');
});

// Recursive directory watch (basic)
function watchDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.git')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) watchDir(full);
    }
  } catch (_) { /* ignore */ }
  try {
    const watcher = fs.watch(dir, { persistent: true }, (event, filename) => {
      if (!filename) return;
      if (filename.startsWith('.')) return;
      // Debounce a bit to avoid duplicate reloads
      clearTimeout(watchDir._t);
      watchDir._t = setTimeout(broadcastReload, 50);
    });
    watcher.on('error', () => {});
  } catch (_) { /* ignore */ }
}

watchDir(ROOT);
