// Doble mínimo de 'pg' para probar la generación de SQL de db-postgres.js sin red ni base de datos real.
// Responde de forma genérica según la forma de la consulta, lo justo para que el código que la llama
// pueda seguir su curso (leer un id devuelto, etc) sin necesitar una base de datos de verdad.
let n = 0;
class Pool {
  constructor(opts) { this.opts = opts; }
  async query(text, params = []) {
    (global.__consultas ||= []).push({ text, params });
    const t = text.toLowerCase();
    if (t.includes('returning *') && t.startsWith('insert')) return { rows: [{ id: `stub-id-${++n}`, ...Object.fromEntries(params.map((v, i) => [`p${i}`, v])) }] };
    if (t.includes('count(*)::int as n')) return { rows: [{ n: 0 }] };
    if (t.startsWith('update') && t.includes('returning *')) return { rows: [{ id: params[0] }] };
    return { rows: [] };
  }
}
module.exports = { Pool };
