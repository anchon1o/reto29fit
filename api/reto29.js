// Única función serverless: recibe {fn, args} y delega en la lógica compartida.
// Runtime Node (no Edge) porque usamos 'crypto' de Node y el SDK de Postgres.
export const config = { runtime: 'nodejs' };
import { crearLogica } from './_lib/logica.js';
import { crearDbPostgres } from './_lib/db-postgres.js';
import { crearBlobsVercel } from './_lib/blobs-vercel.js';

const atender = crearLogica({ db: crearDbPostgres(), blobs: crearBlobsVercel(), env: process.env });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, code: 'METODO' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
  const { fn, args, code } = body || {};
  const token = (req.headers['x-admin-token'] || '').toString() || undefined;
  const r = await atender({ fn, args, code, token });
  res.status(r.status).json(r.body);
}
