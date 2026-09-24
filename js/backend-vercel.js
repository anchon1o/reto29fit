// Cliente del backend real: una única función serverless /api/reto29 que recibe {fn, args}.
import { err, kv } from './util.js';

const TOK = 'reto29_admin_token';
const b64 = (blob) => new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(fr.result.split(',')[1]); fr.onerror = ko; fr.readAsDataURL(blob); });

export function crearBackend({ API_BASE } = {}) {
  const base = (API_BASE || '').replace(/\/+$/, '') || '/api/reto29';
  let token = kv.get(TOK, 'sesion') || null;

  async function llamar(fn, args, code) {
    let r;
    try {
      r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) }, body: JSON.stringify({ fn, args, code }) });
    } catch { throw err('RED'); }
    let j = null; try { j = await r.json(); } catch { /* respuesta vacía */ }
    if (!j || !j.ok) { if (j?.code === 'NO_ADMIN' && token) { token = null; kv.set(TOK, null, 'sesion'); } throw err(j?.code || 'API', j?.message); }
    return j.data;
  }

  return {
    modo: 'vercel',
    photoUrl: (p) => p || '',                          // ya es la URL pública completa de Vercel Blob
    accessInfo: () => llamar('access_info'),
    getState: (code) => llamar('get_state', {}, code),

    async uploadPhoto(tipo, { photo, thumb }, code) {
      const [fotoB64, thumbB64] = await Promise.all([b64(photo), b64(thumb)]);
      return llamar('upload', { tipo, photo: fotoB64, thumb: thumbB64 }, code);
    },
    addEncounter: (code, d) => llamar('add_encounter', { quienes: d.quienes, photo_path: d.photo_path, thumb_path: d.thumb_path, place: d.place, occurred_at: d.occurred_at, note: d.note }, code),
    addEncounterPhoto: (code, id, f) => llamar('add_encounter_photo', { encounter_id: id, photo_path: f.photo_path, thumb_path: f.thumb_path }, code),

    // ----- admin -----
    haySesion: () => !!token, emailAdmin: () => 'admin',
    async isAdmin() { if (!token) return false; try { return await llamar('is_admin'); } catch { return false; } },
    async login(_email, password) { const r = await llamar('login', { password }); token = r.token; kv.set(TOK, token, 'sesion'); },
    async logout() { token = null; kv.set(TOK, null, 'sesion'); },
    insert: (tabla, fila) => llamar('admin_insert', { tabla, fila }),
    update: (tabla, id, cambios) => llamar('admin_update', { tabla, id, cambios }),
    remove: (tabla, id) => llamar('admin_remove', { tabla, id }),
    removePhotos: (rutas) => llamar('admin_remove_photos', { rutas }),
    setCode: (code) => llamar('admin_set_code', { code }),
  };
}
