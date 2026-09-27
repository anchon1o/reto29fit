// Servidor local en MODO REAL: sirve la web y ejecuta la API de verdad (api/_lib/logica.js), con la
// base de datos y las fotos en memoria en vez de Postgres/Blob. Prueba el camino navegador → /api → lógica.
// Uso: ADMIN_PASSWORD=unaclavelarga node tests/servidor-real-local.mjs [puerto]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { crearLogica } from '../api/_lib/logica.js';
import { crearDbMemoria, crearBlobsMemoria } from '../api/_lib/db-memoria.js';
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blobs = crearBlobsMemoria();
const atender = crearLogica({ db: crearDbMemoria(), blobs, env: process.env });
const tipos = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/reto29' && req.method === 'POST') {
    let body = ''; for await (const c of req) body += c;
    let j = {}; try { j = JSON.parse(body); } catch { /* vacío */ }
    const r = await atender({ fn: j.fn, args: j.args, code: j.code, token: req.headers['x-admin-token'] });
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.body));
  }
  const foto = url.pathname.match(/(fit\/)?enc\/[^/]+\.jpg$/)?.[0];   // en local la ruta es relativa; en Vercel Blob es una URL completa
  if (foto && blobs._mem.has(foto)) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(blobs._mem.get(foto)); }
  let f = path.join(raiz, url.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(raiz, 'index.html');
  res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
}).listen(+process.argv[2] || 5174);
