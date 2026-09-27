// Doble mínimo de 'pg' para probar el SQL que genera db-postgres.js sin red ni base de datos real.
// Responde de forma genérica según la forma de la consulta, lo justo para que el código siga su curso.
// global.__antiguas controla qué "ve" la detección de tablas antiguas; las consultas de la transacción
// de migración se apuntan aparte en global.__tx.
let n = 0;
function responder(text, params = []) {
  const t = text.toLowerCase().trim();
  if (t.includes('to_regclass')) return { rows: [global.__antiguas || { ya_migrado: true, hay_antiguas: false, hay_v9: false }] };
  if (t.includes('returning *') && t.startsWith('insert')) return { rows: [{ id: `stub-id-${++n}`, ...Object.fromEntries(params.map((v, i) => [`p${i}`, v])) }] };
  if (t.includes('count(*)::int as n')) return { rows: [{ n: 0 }] };
  if (t.startsWith('update') && t.includes('returning *')) return { rows: [{ id: params[0] }] };
  return { rows: [] };
}
class Pool {
  constructor(opts) { this.opts = opts; }
  async query(text, params = []) { (global.__consultas ||= []).push({ text, params }); return responder(text, params); }
  async connect() {
    return {
      query: async (text, params = []) => { (global.__tx ||= []).push(text); return responder(text, params); },
      release: () => { (global.__tx ||= []).push('(release)'); },
    };
  }
}
module.exports = { Pool };
