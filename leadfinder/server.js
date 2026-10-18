// Local dev server. On Vercel this file is not used; /api/*.js run as serverless functions.
// Run: node server.js   (Node 18+)
const http = require('http');
const fs = require('fs');
const path = require('path');

try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (_) {}

const routes = {
  '/api/config': require('./api/config'),
  '/api/search': require('./api/search'),
  '/api/leads': require('./api/leads'),
};
const readBody = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (_) { ok({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const handler = routes[url.pathname];
  if (handler) {
    req.query = Object.fromEntries(url.searchParams);
    req.body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return handler(req, res);
  }
  const root = path.join(__dirname, 'public');
  const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log(`LeadFinder running at http://localhost:${process.env.PORT || 3000}`));
