'use strict';
/**
 * Inventory Management Portal - zero-dependency Node server.
 * Start:  npm start        (node --experimental-sqlite server.js)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/db');
const { ensureSeedAdmin, currentUser } = require('./lib/auth');
const api = require('./lib/api');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

ensureSeedAdmin();

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' ) rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        else res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('Payload too large (max 40 MB)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

  const ctx = {
    method: req.method,
    path: url.pathname.replace(/\/+$/, '') || '/api',
    query: Object.fromEntries(url.searchParams),
    user: currentUser(req),
    body: {},
    headers: {},
    req, res,
  };
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) ctx.body = await readBody(req);
    const out = await api.handle(ctx);
    if (out === undefined) return; // handler already responded
    const status = out.status || 200;
    if (out.file) {
      res.writeHead(status, Object.assign({
        'Content-Type': out.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${out.filename}"`,
      }, ctx.headers)).end(out.file);
      return;
    }
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, ctx.headers))
      .end(JSON.stringify(out.body ?? out));
  } catch (err) {
    const code = err.status || 500;
    if (code >= 500) console.error('[error]', req.method, url.pathname, err);
    res.writeHead(code, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: err.message || 'Server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  Inventory Management Portal running`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log('');
});
