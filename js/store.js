// Estado de la app + TODOS los cálculos derivados (progreso, ranking, matriz).
// No se guarda ningún contador: todo sale de qué participantes salen en cada foto.
import { crearBackend } from './backend-vercel.js';
import { crearDemo } from './backend-demo.js';
import { pairKey, kv } from './util.js';

const cfg = window.RETO29_CONFIG || {};
export const backend = cfg.MODO === 'demo' ? crearDemo() : crearBackend(cfg);

const K_YO = 'reto29_yo', K_COD = 'reto29_codigo', K_CACHE = 'reto29_cache_' + backend.modo;
const ls = kv;

export const S = {
  data: null,            // respuesta cruda de get_state
  yo: ls.get(K_YO),      // id del participante elegido en ESTE dispositivo (no es seguridad)
  codigo: ls.get(K_COD) || '',
  admin: false,
  cargando: false,
  firma: '',
};

// ---- derivados (se recalculan al cambiar data) ----
export let D = vacio();
function vacio() { return { gente: [], todos: [], porId: new Map(), parejas: new Map(), cuenta: new Map(), total: 0, encuentros: [], porPersona: new Map(), fotosExtra: new Map() }; }

const coll = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
export const ordenar = (arr) => [...arr].sort((x, y) => coll.compare(x.sort_name || x.display_name, y.sort_name || y.display_name));

function derivar() {
  const d = S.data; if (!d) { D = vacio(); return; }
  const todos = ordenar(d.participants.filter((p) => p.active));
  const gente = todos.filter((p) => p.compites);                       // solo quien compite entra en el reto/ranking/matriz
  const porId = new Map(d.participants.map((p) => [p.id, p]));
  const compiteActivo = new Set(gente.map((p) => p.id));
  const encuentros = d.encounters.filter((e) => e.status === 'published').map((e) => ({ ...e, quienes: (e.participants || []).filter((id) => porId.get(id)?.active) })).filter((e) => e.quienes.length >= 2);
  encuentros.sort((x, y) => (x.occurred_at < y.occurred_at ? 1 : -1));

  const parejas = new Map(), cuenta = new Map(gente.map((p) => [p.id, 0])), porPersona = new Map(todos.map((p) => [p.id, []]));
  for (const e of encuentros) {
    for (const id of e.quienes) porPersona.get(id)?.push(e);
    for (let i = 0; i < e.quienes.length; i++) for (let j = i + 1; j < e.quienes.length; j++) {
      const [x, y] = [e.quienes[i], e.quienes[j]];
      if (!compiteActivo.has(x) || !compiteActivo.has(y)) continue;      // una foto con un profe no cuenta para el reto
      const k = pairKey(x, y);
      if (!parejas.has(k)) { parejas.set(k, e); cuenta.set(x, cuenta.get(x) + 1); cuenta.set(y, cuenta.get(y) + 1); }
    }
  }
  const fotosExtra = new Map();
  for (const f of d.encounter_photos || []) (fotosExtra.get(f.encounter_id) || fotosExtra.set(f.encounter_id, []).get(f.encounter_id)).push(f);
  D = { gente, todos, porId, parejas, cuenta, total: Math.max(0, gente.length - 1), encuentros, porPersona, fotosExtra };
}

export const nombre = (id) => D.porId.get(id)?.display_name || '¿?';
export const compite = (id) => !!D.porId.get(id)?.compites;
export const encuentroDe = (x, y) => D.parejas.get(pairKey(x, y)) || null;
export const misEncuentros = (id) => D.porPersona.get(id) || [];
// Orden de nombres al presentar una foto: yo primero si estoy; si no, por orden de la lista de personas.
export function ordenNombres(e) {
  const ids = [...e.quienes];
  const i = (id) => D.todos.findIndex((p) => p.id === id);
  ids.sort((x, y) => (x === S.yo ? -1 : y === S.yo ? 1 : i(x) - i(y)));
  return ids;
}

// Ranking: personas distintas encontradas (solo quien compite). Empates comparten puesto (1,2,2,4).
export function ranking() {
  const filas = D.gente.map((p) => ({ p, n: D.cuenta.get(p.id) || 0 })).sort((x, y) => y.n - x.n || coll.compare(x.p.display_name, y.p.display_name));
  let puesto = 0, ant = null;
  filas.forEach((f, i) => { if (f.n !== ant) { puesto = i + 1; ant = f.n; } f.puesto = puesto; });
  return filas;
}

const oyentes = new Set();
export const alCambiar = (fn) => oyentes.add(fn);
const avisar = (motivo) => oyentes.forEach((fn) => fn(motivo));

function poner(data, motivo) {
  const firma = JSON.stringify(data);
  const cambio = firma !== S.firma;
  S.data = data; S.firma = firma; derivar();
  if (S.yo && !D.porId.get(S.yo)?.active) { S.yo = null; ls.set(K_YO, null); }
  if (cambio) { ls.set(K_CACHE, firma); avisar(motivo); }
  return cambio;
}

export function arrancarDesdeCache() {
  const c = ls.get(K_CACHE); if (!c) return false;
  try { S.data = JSON.parse(c); S.firma = c; derivar(); return true; } catch { return false; }
}

let cola = Promise.resolve();
export function refrescar(motivo = 'refresco') {       // en serie: un refresco tras un alta/borrado nunca se salta
  const tarea = cola.then(async () => { S.cargando = true; try { poner(await backend.getState(S.codigo), motivo); } finally { S.cargando = false; } });
  cola = tarea.catch(() => {});
  return tarea;
}

export async function entrar(codigo) {            // valida el código contra el servidor
  const data = await backend.getState(codigo);
  S.codigo = (codigo || '').trim(); ls.set(K_COD, S.codigo || null);
  poner(data, 'entrada');
}

export function elegirYo(id) { S.yo = id; ls.set(K_YO, id); avisar('yo'); }
export function olvidarAcceso() { S.codigo = ''; ls.set(K_COD, null); ls.set(K_CACHE, null); S.data = null; S.firma = ''; derivar(); }

// Aplica en local el resultado de un alta para que la pantalla responda al instante.
export function aplicarLocal(fn) { const d = JSON.parse(S.firma); fn(d); poner(d, 'local'); }
