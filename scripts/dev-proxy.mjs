#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const TARGET_HOST = 'carmy-api.mr-rny-buria.workers.dev';
const ALLOWED_ORIGIN = 'https://rdxburia.github.io';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf'
};

const server = http.createServer((req, res) => {
  // CORS preflight handling for local requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cache-Control, X-Carmy-Last-Activity',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8080'}`);
  const pathname = parsedUrl.pathname;

  // 1. Forward /api/ requests to production Worker
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname + parsedUrl.search;
    const proxyHeaders = { ...req.headers };
    proxyHeaders['host'] = TARGET_HOST;
    proxyHeaders['origin'] = ALLOWED_ORIGIN;
    delete proxyHeaders['referer'];

    const proxyReq = https.request({
      hostname: TARGET_HOST,
      port: 443,
      path: apiPath,
      method: req.method,
      headers: proxyHeaders
    }, proxyRes => {
      // Log only method, path and status; never log tokens or headers
      console.log(`${req.method} ${apiPath} -> ${proxyRes.statusCode}`);

      const responseHeaders = { ...proxyRes.headers };
      responseHeaders['access-control-allow-origin'] = req.headers.origin || '*';
      responseHeaders['access-control-allow-methods'] = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
      responseHeaders['access-control-allow-headers'] = 'Authorization, Content-Type, Cache-Control, X-Carmy-Last-Activity';

      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error(`PROXY_ERROR: ${req.method} ${apiPath} - ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Proxy Gateway Error: ' + err.message }));
      } else {
        res.destroy();
      }
    });

    req.on('error', () => {
      try { proxyReq.destroy(); } catch (_) {}
    });

    req.pipe(proxyReq);
    return;
  }

  // 2. Serve static files
  let safePath = pathname.replace(/^\/+/, '');
  if (!safePath || safePath === '') safePath = 'index.html';

  let filePath = path.resolve(rootDir, safePath);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (_) {
    // If file doesn't exist, try appending .html
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found: ' + pathname);
      return;
    }
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found: ' + pathname);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.html') {
    let content = fs.readFileSync(filePath, 'utf8');
    const headerPath = path.join(rootDir, 'partials', 'public-header.html');
    const footerPath = path.join(rootDir, 'partials', 'public-footer.html');
    if (fs.existsSync(headerPath)) {
      content = content.replace('<!-- TD_SHARED_HEADER -->', fs.readFileSync(headerPath, 'utf8'));
    }
    if (fs.existsSync(footerPath)) {
      content = content.replace('<!-- TD_SHARED_FOOTER -->', fs.readFileSync(footerPath, 'utf8'));
    }
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(content);
    return;
  }

  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local dev proxy listening on http://localhost:${PORT}`);
  console.log(`Proxying /api/* -> https://${TARGET_HOST}/api/*`);
});
