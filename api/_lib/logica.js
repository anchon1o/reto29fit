// Lógica del servidor, independiente de dónde se guarden los datos (Postgres real o un doble en memoria para pruebas).
// Modelo: un "encuentro" es UNA FOTO con un grupo de participantes (2 o más). Cubre todas las parejas de ese grupo a la vez.
import crypto from 'node:crypto';

const NOMBRES = ['Alan','Ancho','Ari','Carlos','Dani Dan','Dani M','Egoitz','Emilia','Fabián','Fernanda','Harold','Jenny','Juli','Lucía','Luís','MA','Manu','Marilú','Pedro','Raquel','Raúl','Renato','Ritxi','Rocío E','Roti','Samuel','Serginho','Tita','Xana'];
export const SEMILLA = {
  participantes: [
    ...NOMBRES.map((n) => ({ display_name: n, sort_name: null, is_placeholder: false, compites: true })),
    { display_name: '¿Nº 30?', sort_name: 'zzz', is_placeholder: true, compites: true },     // nº30 PROVISIONAL: se renombra en /admin
    { display_name: 'Cou', sort_name: 'zzzzCou', is_placeholder: false, compites: false },    // profes: no compiten (van en cursiva)
    { display_name: 'Feña', sort_name: 'zzzzFeña', is_placeholder: false, compites: false },
    { display_name: 'Gala', sort_name: 'zzzzGala', is_placeholder: false, compites: false },
  ],
};

export const hashCodigo = (c) => crypto.createHash('sha256').update(String(c ?? '').trim().toLowerCase(), 'utf8').digest('hex');
const fallo = (code, status = 400) => Object.assign(new Error(code), { code, status });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const texto = (v, max) => { const t = String(v ?? '').trim().slice(0, max); return t || null; };
const fecha = (v) => { const d = v ? new Date(v) : new Date(); return isNaN(d) || d.getTime() > Date.now() + 864e5 ? new Date().toISOString() : d.toISOString(); };
const MAX_FOTO = 3 * 1024 * 1024;

// Campos que el admin puede tocar en cada tabla (lista blanca).
const EDITABLE = {
  participants: ['display_name', 'sort_name', 'active', 'is_placeholder', 'compites'],
  encounters: ['participants', 'photo_path', 'thumb_path', 'place', 'occurred_at', 'note', 'status'],
  encounter_photos: [],
  settings: ['title', 'moderation_enabled'],
};

export function crearLogica({ db, blobs, env }) {
  // ---- sesión de admin: token firmado (HMAC), sin tabla de usuarios ----
  const pass = () => String(env.ADMIN_PASSWORD || '');
  const secreto = () => crypto.createHash('sha256').update('reto29|' + pass()).digest();
  const firmar = (exp) => crypto.createHmac('sha256', secreto()).update(String(exp)).digest('hex');
  const crearToken = () => { const exp = Date.now() + 12 * 3600e3; return `${exp}.${firmar(exp)}`; };
  function esAdmin(token) {
    if (pass().length < 8 || !token) return false;
    const [exp, firma] = String(token).split('.');
    if (!(+exp > Date.now()) || !firma) return false;
    const a = Buffer.from(firma, 'hex'), b = Buffer.from(firmar(exp), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  let listo;
  const preparar = () => (listo ||= db.init({ semilla: SEMILLA, hashInicial: env.CODIGO_RETO ? hashCodigo(env.CODIGO_RETO) : null }).catch((e) => { listo = null; throw e; }));

  async function exigirAcceso(ctx) {
    if (ctx.admin) return;
    const s = await db.settings();
    if (!s.challenge_code_hash || hashCodigo(ctx.code) === s.challenge_code_hash) return;
    await dormir(400);                               // freno a fuerza bruta
    throw fallo('CODIGO_INVALIDO', 401);
  }
  const soloAdmin = (ctx) => { if (!ctx.admin) throw fallo('NO_ADMIN', 403); };
  async function exigirFoto(a) {
    if (!blobs.valida(a.photo_path) || (a.thumb_path && !blobs.valida(a.thumb_path))) throw fallo('RUTA_FOTO_INVALIDA');
    if (!(await blobs.existente(a.photo_path)) || (a.thumb_path && !(await blobs.existente(a.thumb_path)))) throw fallo('FOTO_NO_SUBIDA');
  }
  const idsValidos = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => UUID.test(String(x)));

  function jpeg(b64) {
    const buf = Buffer.from(String(b64 || ''), 'base64');
    if (buf.length < 100 || buf.length > MAX_FOTO || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw fallo('RUTA_FOTO_INVALIDA');
    return buf;
  }

  const fns = {
    async access_info() { const s = await db.settings(); return { code_required: !!s.challenge_code_hash, title: s.title }; },

    async get_state(_a, ctx) {
      await exigirAcceso(ctx);
      const [s, d] = await Promise.all([db.settings(), db.estado(ctx.admin)]);
      return { settings: { title: s.title, moderation_enabled: s.moderation_enabled, code_required: !!s.challenge_code_hash }, ...d };
    },

    async upload(a, ctx) {                            // foto + miniatura en una sola petición
      await exigirAcceso(ctx);
      if (a.tipo !== 'enc') throw fallo('RUTA_FOTO_INVALIDA');
      const foto = jpeg(a.photo), mini = jpeg(a.thumb), id = crypto.randomUUID();
      const [photo_path, thumb_path] = await Promise.all([blobs.put(`enc/${id}.jpg`, foto), blobs.put(`enc/${id}_t.jpg`, mini)]);
      return { photo_path, thumb_path };
    },

    // a.quienes: array de ids (2 o más). Si ya hay una foto con EXACTAMENTE ese grupo, se devuelve created:false
    // (la interfaz ofrece añadirla como foto extra) en vez de crear un duplicado.
    async add_encounter(a, ctx) {
      await exigirAcceso(ctx);
      const quienes = [...new Set(a.quienes)];
      if (!idsValidos(quienes) || quienes.length < 2) throw fallo('PAREJA_INVALIDA');
      if ((await db.participantesActivos(quienes)) !== quienes.length) throw fallo('PARTICIPANTE_INVALIDO');
      const ya = await db.buscarEncuentroExacto(quienes);
      if (ya) return { created: false, encounter: ya };
      await exigirFoto(a);
      const s = await db.settings();
      const fila = await db.insertarEncuentro({ participants: quienes, photo_path: a.photo_path, thumb_path: a.thumb_path || null, place: texto(a.place, 120), occurred_at: fecha(a.occurred_at), note: texto(a.note, 500), status: s.moderation_enabled ? 'pending' : 'published' });
      return { created: true, encounter: fila };
    },

    // Foto adicional de un encuentro ya existente, solo para que el álbum quede bonito. No cambia a quién cubre. Máx. 5.
    async add_encounter_photo(a, ctx) {
      await exigirAcceso(ctx);
      if (!UUID.test(String(a.encounter_id))) throw fallo('ENCUENTRO_NO_EXISTE');
      if (!(await db.existeEncuentro(a.encounter_id))) throw fallo('ENCUENTRO_NO_EXISTE');
      if ((await db.contarFotos(a.encounter_id)) >= 5) throw fallo('DEMASIADAS_FOTOS');
      await exigirFoto(a);
      return db.insertarFotoExtra({ encounter_id: a.encounter_id, photo_path: a.photo_path, thumb_path: a.thumb_path || null });
    },

    // ---------------- admin ----------------
    async login(a) {
      if (pass().length < 8) throw fallo('ADMIN_NO_CONFIGURADO', 503);
      const x = crypto.createHash('sha256').update(String(a.password ?? '')).digest(), y = crypto.createHash('sha256').update(pass()).digest();
      if (!crypto.timingSafeEqual(x, y)) { await dormir(600); throw fallo('LOGIN', 401); }
      return { token: crearToken() };
    },
    async is_admin(_a, ctx) { return ctx.admin; },

    async admin_insert(a, ctx) {
      soloAdmin(ctx);
      if (a.tabla !== 'participants') throw fallo('TABLA');
      const n = texto(a.fila?.display_name, 40); if (!n) throw fallo('NOMBRE_VACIO');
      return db.insertarParticipante({ display_name: n, compites: a.fila?.compites !== false });
    },
    async admin_update(a, ctx) {
      soloAdmin(ctx);
      const campos = EDITABLE[a.tabla]; if (!campos) throw fallo('TABLA');
      const c = Object.fromEntries(Object.entries(a.cambios || {}).filter(([k]) => campos.includes(k)));
      if ('display_name' in c) { c.display_name = texto(c.display_name, 40); if (!c.display_name) throw fallo('NOMBRE_VACIO'); }
      if ('occurred_at' in c) c.occurred_at = fecha(c.occurred_at);
      if ('status' in c && !['published', 'pending'].includes(c.status)) throw fallo('TABLA');
      if ('participants' in c) { c.participants = [...new Set(c.participants)]; if (!idsValidos(c.participants)) throw fallo('PAREJA_INVALIDA'); }
      if (a.tabla === 'settings') return db.actualizar('settings', null, c);
      if (!UUID.test(String(a.id))) throw fallo('NO_EXISTE', 404);
      const fila = await db.actualizar(a.tabla, a.id, c); if (!fila) throw fallo('NO_EXISTE', 404);
      return fila;
    },
    async admin_remove(a, ctx) { soloAdmin(ctx); if (!EDITABLE[a.tabla] || a.tabla === 'settings') throw fallo('TABLA'); if (!UUID.test(String(a.id))) throw fallo('NO_EXISTE', 404); await db.borrar(a.tabla, a.id); return true; },
    async admin_remove_photos(a, ctx) { soloAdmin(ctx); const u = (a.rutas || []).filter((r) => blobs.valida(r)); if (u.length) await blobs.del(u).catch(() => {}); return true; },
    async admin_set_code(a, ctx) { soloAdmin(ctx); await db.ponerHash(String(a.code || '').trim() ? hashCodigo(a.code) : null); return true; },
  };

  // Punto de entrada único: { fn, args } + cabeceras → { status, body }
  return async function atender({ fn, args, code, token }) {
    try {
      if (!Object.hasOwn(fns, fn)) throw fallo('FUNCION', 404);
      await preparar();
      const ctx = { code, admin: esAdmin(token) };
      return { status: 200, body: { ok: true, data: await fns[fn](args || {}, ctx) } };
    } catch (e) {
      const conocido = typeof e.code === 'string' && /^[A-Z_]+$/.test(e.code);
      if (!conocido) console.error('[reto29]', fn, e);
      return { status: e.status || (conocido ? 400 : 500), body: { ok: false, code: conocido ? e.code : 'SERVIDOR', message: conocido ? undefined : 'Error interno' } };
    }
  };
}
