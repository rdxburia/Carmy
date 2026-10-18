#!/usr/bin/env node
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', err => {
  console.warn('Preview server handled exception:', err.message || err);
});

const PORT = parseInt(process.env.PORT, 10) || 8080;
const rootDir = path.resolve(__dirname, '..');

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
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  // Handle CORS preflight for all endpoints on localhost
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cache-Control, X-Carmy-Last-Activity',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // Normalize path: support both / and /Carmy/ roots transparently
  let rawPath = req.url.split('?')[0].split('#')[0];
  let normalizedPath = rawPath.replace(/^\/Carmy\/?/, '/');
  if (normalizedPath === '/' || normalizedPath === '') normalizedPath = '/index.html';

  // Proxy /api/ requests to Cloudflare Worker with legitimate Origin
  if (normalizedPath.startsWith('/api/')) {
    const proxyHeaders = { ...req.headers };
    proxyHeaders['host'] = 'carmy-api.mr-rny-buria.workers.dev';
    proxyHeaders['origin'] = 'https://rdxburia.github.io';
    delete proxyHeaders['referer'];

    const apiPath = req.url.replace(/^\/Carmy/, '');
    const options = {
      hostname: 'carmy-api.mr-rny-buria.workers.dev',
      port: 443,
      path: apiPath,
      method: req.method,
      headers: proxyHeaders
    };

    const proxyReq = https.request(options, proxyRes => {
      const responseHeaders = { ...proxyRes.headers };
      responseHeaders['access-control-allow-origin'] = '*';
      responseHeaders['access-control-allow-methods'] = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
      responseHeaders['access-control-allow-headers'] = 'Authorization, Content-Type, Cache-Control, X-Carmy-Last-Activity';
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error('Worker proxy notice:', err.message || err);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, error: 'Worker Proxy Unavailable: ' + err.message }));
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

  const filePath = path.join(rootDir, normalizedPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found: ' + rawPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });

  if (filePath.endsWith('config.js')) {
    let content = fs.readFileSync(filePath, 'utf8');
    // In local preview, route /api calls through the local proxy
    content = content.replace('https://carmy-api.mr-rny-buria.workers.dev', `http://localhost:${PORT}`);
    res.end(content);
    return;
  }

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
    // Inject TORQ_API_BASE to point to local proxy
    content = content.replace('<head>', `<head><script>window.TORQ_API_BASE='http://localhost:${PORT}';</script>`);
    res.end(content);
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local Torq Desk preview server is live at http://localhost:${PORT}`);
  console.log(`Also accessible at http://localhost:${PORT}/Carmy/`);
  console.log(`Worker API proxy enabled for https://carmy-api.mr-rny-buria.workers.dev`);
});

module.exports = server;
