// MODO DEMO: misma interfaz que el backend real, pero todo vive en este navegador.
// Sirve para probar la web sin desplegar nada. Código: "demo". Admin: cualquier email + "demo".
import { err, uuid, pairKey, kv } from './util.js';

const K = 'reto29_demo_v2';
const NOMBRES = ['Alan','Ancho','Ari','Carlos','Dani Dan','Dani M','Egoitz','Emilia','Fabián','Fernanda','Harold','Jenny','Juli','Lucía','Luís','MA','Manu','Marilú','Pedro','Raquel','Raúl','Renato','Ritxi','Rocío E','Roti','Samuel','Serginho','Tita','Xana'];
const PROFES = [['Cou', 'profesor'], ['Feña', 'profesor'], ['Gala', 'profesora']];   // no compiten: no cuentan para el 29 ni el ranking

function nuevo() {
  const now = new Date().toISOString();
  return {
    settings: { title: 'RETO 29 · FIT 2026', moderation_enabled: false, code: 'demo' },
    participants: [
      ...NOMBRES.map((n) => ({ id: uuid(), display_name: n, sort_name: null, active: true, is_placeholder: false, compites: true, created_at: now })),
      { id: uuid(), display_name: '¿Nº 30?', sort_name: 'zzz', active: true, is_placeholder: true, compites: true, created_at: now },
      ...PROFES.map(([n, c]) => ({ id: uuid(), display_name: n, sort_name: 'zzzz' + n, category: c, active: true, is_placeholder: false, compites: false, created_at: now })),
    ],
    encounters: [], encounter_photos: [], fotos: {},
  };
}

export function crearDemo() {
  let db; try { db = JSON.parse(kv.get(K)); } catch { /* vacío */ }
  let creada = false;
  if (!db || db.participants.some((p) => p.compites === undefined)) { db = nuevo(); creada = true; }   // primera vez o esquema antiguo
  let admin = kv.get(K + '_admin', 'sesion') === '1';
  const nube = window.storage && typeof window.storage.get === 'function' ? window.storage : null;   // artefactos de Claude
  const ligero = () => JSON.stringify({ ...db, fotos: Object.fromEntries(Object.entries(db.fotos).filter(([p]) => p.endsWith('_t.jpg'))) });
  const guardar = () => { const j = ligero(); kv.set(K, j); if (nube) nube.set(K, j, false).catch(() => {}); };
  if (creada) guardar();   // los ids de la semilla deben sobrevivir a un recargo aunque aún no haya ningún encuentro
  const listo = (nube ? nube.get(K, false).then((r) => { if (r?.value) { const cand = JSON.parse(r.value); if (cand.participants?.some((p) => p.compites !== undefined)) db = cand; } }).catch(() => {}) : Promise.resolve()).then(() => { if (creada) guardar(); });
  const espera = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  const acceso = (code) => { if (!admin && db.settings.code && String(code || '').trim().toLowerCase() !== db.settings.code) throw err('CODIGO_INVALIDO'); };
  const aDataUrl = (b) => new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
  const soloAdmin = () => { if (!admin) throw err('NO_ADMIN'); };
  const cuando = (v) => v || new Date().toISOString();
  const activos = () => new Set(db.participants.filter((p) => p.active).map((p) => p.id));
  const mismoGrupo = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  const api = {
    modo: 'demo',
    photoUrl: (p) => db.fotos[p] || db.fotos[String(p).replace(/\.jpg$/, '_t.jpg')] || '',
    async accessInfo() { await espera(); return { code_required: !!db.settings.code, title: db.settings.title }; },
    async getState(code) {
      await espera(); acceso(code);
      const { fotos, settings, ...resto } = db;
      return JSON.parse(JSON.stringify({ ...resto, settings: { title: settings.title, moderation_enabled: settings.moderation_enabled, code_required: !!settings.code } }));
    },
    async uploadPhoto(tipo, { photo, thumb }) {
      const id = uuid(); const photo_path = `${tipo}/${id}.jpg`, thumb_path = `${tipo}/${id}_t.jpg`;
      db.fotos[thumb_path] = await aDataUrl(thumb);
      db.fotos[photo_path] = await aDataUrl(photo);
      return { photo_path, thumb_path };
    },
    // d.quienes: array de ids (>=2). Si ya existe una foto con EXACTAMENTE ese mismo grupo, se ofrece añadirla como extra.
    async addEncounter(code, d) {
      await espera(); acceso(code);
      const act = activos(), quienes = [...new Set(d.quienes)].filter((id) => act.has(id));
      if (quienes.length < 2) throw err('PAREJA_INVALIDA');
      const ya = db.encounters.find((e) => e.status !== 'pending-borrado' && mismoGrupo(e.participants, quienes));
      if (ya) return { created: false, encounter: { ...ya } };
      if (!db.fotos[d.photo_path]) throw err('FOTO_NO_SUBIDA');
      const e = { id: uuid(), participants: quienes, photo_path: d.photo_path, thumb_path: d.thumb_path, place: d.place?.trim() || null, occurred_at: cuando(d.occurred_at), note: d.note?.trim() || null, status: db.settings.moderation_enabled ? 'pending' : 'published', created_at: new Date().toISOString() };
      db.encounters.push(e); guardar();
      return { created: true, encounter: { ...e } };
    },
    async addEncounterPhoto(code, id, f) {
      await espera(); acceso(code);
      if (db.encounter_photos.filter((x) => x.encounter_id === id).length >= 5) throw err('DEMASIADAS_FOTOS');
      const r = { id: uuid(), encounter_id: id, ...f, created_at: new Date().toISOString() };
      db.encounter_photos.push(r); guardar(); return { ...r };
    },

    haySesion: () => admin, emailAdmin: () => 'admin@demo',
    async isAdmin() { return admin; },
    async login(_email, password) { await espera(); if (password !== 'demo') throw err('LOGIN'); admin = true; kv.set(K + '_admin', '1', 'sesion'); },
    async logout() { admin = false; kv.set(K + '_admin', null, 'sesion'); },
    async insert(tabla, fila) {
      soloAdmin();
      if (db[tabla].some((x) => x.display_name && x.display_name.toLowerCase() === String(fila.display_name || '').toLowerCase())) throw err('DUPLICADO');
      const r = { id: uuid(), active: true, compites: true, created_at: new Date().toISOString(), ...fila }; db[tabla].push(r); guardar(); return { ...r };
    },
    async update(tabla, id, cambios) {
      soloAdmin();
      if (tabla === 'settings') { Object.assign(db.settings, cambios); guardar(); return { ...db.settings }; }
      const r = db[tabla].find((x) => x.id === id); if (!r) throw err('API', 'No existe');
      if (tabla === 'encounters' && cambios.participants) { if (cambios.participants.length < 2) throw err('PAREJA_INVALIDA'); }
      if (cambios.display_name) {
        if (db[tabla].some((x) => x.id !== id && x.display_name.toLowerCase() === cambios.display_name.toLowerCase())) throw err('DUPLICADO');
      }
      Object.assign(r, cambios); guardar(); return { ...r };
    },
    async remove(tabla, id) {
      soloAdmin();
      if (tabla === 'participants' && db.encounters.some((e) => e.participants.includes(id))) throw err('EN_USO');
      db[tabla] = db[tabla].filter((x) => x.id !== id);
      if (tabla === 'encounters') db.encounter_photos = db.encounter_photos.filter((f) => f.encounter_id !== id);
      guardar();
    },
    async removePhotos(rutas) { rutas.forEach((p) => delete db.fotos[p]); guardar(); },
    async setCode(code) { soloAdmin(); db.settings.code = String(code || '').trim().toLowerCase() || null; guardar(); },
    listo,

    // --- solo demo: datos de ejemplo para ver la web "viva" ---
    async vaciar() { db = nuevo(); guardar(); },
    async sembrar(yo, n = 140) {
      const act = db.participants.filter((p) => p.active && p.compites), lugares = ['Praza da Quintana', 'Rúa Nova', 'Café Moderna', 'Alameda', 'Sala Capitol', '', '', ''];
      const retrato = (nombres, h) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="hsl(${h} 55% 45%)"/><circle cx="140" cy="170" r="70" fill="hsl(${h + 40} 70% 80%)"/><circle cx="265" cy="185" r="70" fill="hsl(${h + 200} 70% 85%)"/><rect y="290" width="400" height="110" fill="rgba(0,0,0,.35)"/><text x="200" y="358" font-family="sans-serif" font-weight="700" font-size="34" fill="#fff" text-anchor="middle">${nombres.join(' + ').slice(0, 26)}</text></svg>`);
      const pares = []; for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) pares.push([act[i], act[j]]);
      const mio = (x) => x[0].id === yo || x[1].id === yo, azar = (l) => l.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
      const orden = [...azar(pares.filter(mio)).slice(0, 18), ...azar(pares.filter((x) => !mio(x)))];
      let hechos = 0;
      for (const [p, q] of orden) {
        if (hechos >= n) break;
        if (db.encounters.some((e) => mismoGrupo(e.participants, [p.id, q.id]))) continue;
        const id = uuid(), ruta = `enc/${id}_t.jpg`; db.fotos[ruta] = retrato([p.display_name, q.display_name], Math.floor(Math.random() * 360));
        const t = new Date(Date.now() - Math.random() * 12 * 864e5).toISOString();
        db.encounters.push({ id: uuid(), participants: [p.id, q.id], photo_path: `enc/${id}.jpg`, thumb_path: ruta, place: lugares[Math.floor(Math.random() * lugares.length)] || null, occurred_at: t, note: null, status: 'published', created_at: t });
        hechos++;
      }
      // una foto de grupo de ejemplo (3 personas), para que se vea el caso de varias-a-la-vez
      if (act.length >= 3 && yo) {
        const otros = act.filter((p) => p.id !== yo).slice(0, 2);
        if (otros.length === 2 && !db.encounters.some((e) => mismoGrupo(e.participants, [yo, ...otros.map((p) => p.id)]))) {
          const id = uuid(), ruta = `enc/${id}_t.jpg`, nombresG = [db.participants.find((p) => p.id === yo)?.display_name, ...otros.map((p) => p.display_name)];
          db.fotos[ruta] = retrato(nombresG, 210);
          const t = new Date().toISOString();
          db.encounters.push({ id: uuid(), participants: [yo, ...otros.map((p) => p.id)], photo_path: `enc/${id}.jpg`, thumb_path: ruta, place: 'Foto de grupo', occurred_at: t, note: null, status: 'published', created_at: t });
        }
      }
      guardar();
    },
  };
  return api;
}
