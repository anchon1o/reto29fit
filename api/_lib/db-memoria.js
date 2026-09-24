// Doble en memoria del adaptador de base de datos, con la MISMA interfaz que db-postgres.js.
// Sirve para probar api/_lib/logica.js de verdad (sin red) y como referencia de qué debe hacer cada consulta SQL real.
import crypto from 'node:crypto';

export function crearDbMemoria() {
  let s = null;
  const t = { participants: [], encounters: [], encounter_photos: [] };
  const uuid = () => crypto.randomUUID();
  const activo = (id) => t.participants.find((p) => p.id === id)?.active;

  return {
    async init({ semilla, hashInicial }) {
      if (s) return;
      s = { id: true, title: 'RETO 29 · FIT 2026', challenge_code_hash: hashInicial ?? null, moderation_enabled: false };
      const now = new Date().toISOString();
      for (const p of semilla.participantes) t.participants.push({ id: uuid(), active: true, created_at: now, sort_name: null, is_placeholder: false, compites: true, ...p });
    },
    async settings() { return s; },
    async estado(admin) {
      return {
        participants: t.participants.filter((p) => admin || p.active),
        encounters: t.encounters.filter((e) => admin || e.status === 'published').map((e) => ({ ...e, participants: [...e.participants] })),
        encounter_photos: t.encounter_photos.filter((f) => admin || t.encounters.find((e) => e.id === f.encounter_id)?.status === 'published'),
      };
    },
    async participantesActivos(ids) { return ids.filter((id) => activo(id)).length; },
    async buscarEncuentroExacto(quienes) {
      const set = new Set(quienes);
      const e = t.encounters.find((x) => x.participants.length === set.size && x.participants.every((id) => set.has(id)));
      return e ? { ...e, participants: [...e.participants] } : null;
    },
    async insertarEncuentro(fila) { const r = { id: uuid(), created_at: new Date().toISOString(), ...fila }; t.encounters.push(r); return { ...r }; },
    async existeEncuentro(id) { return t.encounters.some((e) => e.id === id); },
    async contarFotos(encounter_id) { return t.encounter_photos.filter((f) => f.encounter_id === encounter_id).length; },
    async insertarFotoExtra(fila) { const r = { id: uuid(), created_at: new Date().toISOString(), ...fila }; t.encounter_photos.push(r); return { ...r }; },
    async insertarParticipante(fila) {
      if (t.participants.some((p) => p.display_name.toLowerCase() === fila.display_name.toLowerCase())) { const e = new Error('DUPLICADO'); e.code = 'DUPLICADO'; throw e; }
      const r = { id: uuid(), active: true, sort_name: null, is_placeholder: false, created_at: new Date().toISOString(), ...fila }; t.participants.push(r); return { ...r };
    },
    async leer(tabla, id) { return t[tabla]?.find((x) => x.id === id) || null; },
    async actualizar(tabla, id, cambios) {
      if (tabla === 'settings') { Object.assign(s, cambios); return { ...s }; }
      const r = t[tabla].find((x) => x.id === id); if (!r) return null;
      if (cambios.display_name && t[tabla].some((x) => x.id !== id && x.display_name?.toLowerCase() === cambios.display_name.toLowerCase())) { const e = new Error('DUPLICADO'); e.code = 'DUPLICADO'; throw e; }
      Object.assign(r, cambios); return { ...r };
    },
    async borrar(tabla, id) {
      if (tabla === 'participants' && t.encounters.some((e) => e.participants.includes(id))) { const e = new Error('EN_USO'); e.code = 'EN_USO'; throw e; }
      t[tabla] = t[tabla].filter((x) => x.id !== id);
      if (tabla === 'encounters') t.encounter_photos = t.encounter_photos.filter((f) => f.encounter_id !== id);
    },
    async ponerHash(hash) { s.challenge_code_hash = hash; },
    _tablas: t,
  };
}

export function crearBlobsMemoria() {
  const RUTA = /^enc\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$/;
  const mem = new Map();
  return {
    valida: (p) => RUTA.test(String(p || '')),
    async put(p, buf) { mem.set(p, buf); return p; },
    async existente(p) { return mem.has(p); },
    async del(ps) { ps.forEach((p) => mem.delete(p)); },
    _mem: mem,
  };
}
