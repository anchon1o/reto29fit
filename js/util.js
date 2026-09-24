// Utilidades pequeñas, sin dependencias.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); // Safari < 15.4
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Clave canónica de pareja: independiente del orden. A+B === B+A.
export const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const fFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
export function fmtCuando(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${fFecha.format(d).replace('.', '')}, ${fHora.format(d)}`;
}

// <input type="datetime-local"> trabaja en hora local sin zona.
export function toLocalInput(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  const d = new Date(v);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

// localStorage puede no existir (Safari privado, iframes): se degrada a memoria sin romper.
const mem = new Map();
function caja(tipo) { try { const c = window[tipo]; c.setItem('__t', '1'); c.removeItem('__t'); return c; } catch { return null; } }
const cajas = { local: caja('localStorage'), sesion: caja('sessionStorage') };
export const kv = {
  get(k, tipo = 'local') { try { return cajas[tipo] ? cajas[tipo].getItem(k) : mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
  set(k, v, tipo = 'local') { try { if (!cajas[tipo]) { v == null ? mem.delete(k) : mem.set(k, v); return true; } v == null ? cajas[tipo].removeItem(k) : cajas[tipo].setItem(k, v); return true; } catch { return false; } },
};

let toastT;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}

export const ERRORES = {
  CODIGO_INVALIDO: 'Ese código no es correcto.',
  PAREJA_INVALIDA: 'Elige dos personas distintas.',
  PARTICIPANTE_INVALIDO: 'Alguna de las personas ya no está activa. Recarga la página.',
  FOTO_NO_SUBIDA: 'La foto no llegó a subirse. Inténtalo otra vez.',
  RUTA_FOTO_INVALIDA: 'Hubo un problema con la foto. Inténtalo otra vez.',
  DEMASIADAS_FOTOS: 'Este encuentro ya tiene el máximo de fotos.',
  NOMBRE_VACIO: 'Escribe un nombre.',
  NO_ADMIN: 'Esta cuenta no tiene permisos de administración.',
  RED: 'Sin conexión. Comprueba los datos o el wifi y vuelve a intentarlo.',
  LOGIN: 'Email o contraseña incorrectos.',
  DUPLICADO: 'Ya existe un registro igual (pareja o nombre repetido).',
  EN_USO: 'No se puede borrar porque tiene encuentros asociados. Desactívalo o borra antes sus encuentros.',
};
export const textoError = (e) => ERRORES[e?.code] || e?.message || 'Algo ha fallado.';
export function err(code, message) { const e = new Error(message || code); e.code = code; return e; }
