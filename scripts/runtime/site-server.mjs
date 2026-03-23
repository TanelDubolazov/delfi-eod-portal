import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(__dirname, '..', '..');
const siteRoot = process.env.SITE_DIST
  ? path.resolve(process.env.SITE_DIST)
  : path.join(runtimeRoot, 'web', 'dist');
const port = Number.parseInt(process.env.PORT || '4321', 10);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

function resolveFile(urlPathname) {
  const decoded = decodeURIComponent(urlPathname.split('?')[0]);
  const cleanPath = decoded.replace(/^\/+/, '');
  const target = cleanPath === '' ? 'index.html' : cleanPath;
  const abs = path.resolve(siteRoot, target);
  if (!abs.startsWith(siteRoot)) return null;

  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  const asIndex = path.join(abs, 'index.html');
  if (fs.existsSync(asIndex) && fs.statSync(asIndex).isFile()) return asIndex;
  return null;
}

if (!fs.existsSync(path.join(siteRoot, 'index.html'))) {
  console.error(`Site dist not found at ${siteRoot}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    send(res, 400, 'Bad Request');
    return;
  }

  const file = resolveFile(req.url);
  if (!file) {
    send(res, 404, 'Not Found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const contentType = mime.get(ext) || 'application/octet-stream';
  try {
    const body = fs.readFileSync(file);
    send(res, 200, body, contentType);
  } catch {
    send(res, 500, 'Internal Server Error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Static site running at http://127.0.0.1:${port}`);
});
