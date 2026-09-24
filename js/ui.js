// Piezas compartidas entre vistas públicas y admin.
import { esc } from './util.js';
import { backend, S, compite, nombre } from './store.js';
import { prepararFoto } from './image.js';

export const acts = {};                       // registro de acciones: data-act / data-ch / data-in
export const nav = { ir: () => {}, render: () => {}, ruta: { path: '/', q: new URLSearchParams() } };

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ico = {
  casa: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>'),
  yo: svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c1-4 4-5.6 7.2-5.6s6.2 1.6 7.2 5.6"/>'),
  matriz: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>'),
  copa: svg('<path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.500c0 3 1.3 4.5 3.3 4.800M16.5 6h3c0 3-1.3 4.5-3.3 4.800M12 14v4M8.5 20h7"/>'),
  camara: svg('<path d="M4 8.500h3.200L8.8 6h6.400l1.6 2.500H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.500a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.4"/>'),
  galeria: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4.5 17.5 5-4.5 3.5 3 2.5-2 4 3.5"/>'),
  atras: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.500L19 7.5"/>', 'stroke-width="3"'),
  mas: svg('<path d="M12 5.500v13M5.5 12h13"/>'),
  estrella: svg('<path d="m12 3.8 2.5 5.2 5.7.700-4.2 3.9 1.1 5.600L12 16.400l-5.1 2.800L8 13.6 3.8 9.700l5.7-.7z"/>'),
  lugar: svg('<path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  flecha: svg('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>'),
};

// Selector de foto reutilizable. F = objeto de estado del formulario.
export function fotoPicker(F, ch = 'foto') {
  if (F.preview) {
    return `<div class="foto-prev"><img src="${esc(F.preview)}" alt="Foto elegida">
      <label class="btn btn-mini foto-cambiar">Cambiar foto<input class="vh" type="file" accept="image/*" data-ch="${ch}"></label></div>`;
  }
  if (F.procesando) return `<div class="foto-vacia"><span class="spin"></span> Preparando foto…</div>`;
  return `<div class="foto-botones">
      <label class="btn btn-foto">${ico.camara}<span>Hacer foto</span><input class="vh" type="file" accept="image/*" capture="environment" data-ch="${ch}"></label>
      <label class="btn btn-foto">${ico.galeria}<span>Galería</span><input class="vh" type="file" accept="image/*" data-ch="${ch}"></label>
    </div>${F.errFoto ? `<p class="error">${esc(F.errFoto)}</p>` : ''}`;
}

// Devuelve una función para registrar como acción "foto" que rellena F.
export function manejarFoto(getF) {
  return async (input) => {
    const F = getF(); const file = input.files?.[0]; if (!file) return;
    if (F.preview) URL.revokeObjectURL(F.preview);
    Object.assign(F, { preview: null, blobs: null, rutas: null, procesando: true, errFoto: '' }); nav.render();
    try { const r = await prepararFoto(file); Object.assign(F, { blobs: { photo: r.photo, thumb: r.thumb }, preview: r.preview }); }
    catch (e) { F.errFoto = e.message || 'No se pudo leer la foto.'; }
    F.procesando = false; nav.render();
  };
}

export function confirmar(texto, boton = 'Eliminar') {
  return new Promise((ok) => {
    const d = document.createElement('div'); d.className = 'modal'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="modal-caja"><p>${esc(texto)}</p><div class="dos"><button class="btn" data-r="0">Cancelar</button><button class="btn peligro-lleno" data-r="1">${esc(boton)}</button></div></div>`;
    d.addEventListener('click', (ev) => { const r = ev.target.closest('[data-r]'); if (!r && ev.target !== d) return; ev.stopPropagation(); d.remove(); ok(r?.dataset.r === '1'); });
    document.body.appendChild(d); d.querySelector('[data-r="0"]').focus();
  });
}

export async function subirSiHaceFalta(F, tipo) {      // no resube si ya se subió en un intento previo
  if (!F.rutas) F.rutas = await backend.uploadPhoto(tipo, F.blobs, S.codigo);
  return F.rutas;
}

export const nombreH = (id) => (compite(id) ? esc(nombre(id)) : `<i>${esc(nombre(id))}</i>`);   // profes en cursiva: no compiten

export const img = (ruta, alt = '', cls = '') => (ruta ? `<img class="${cls}" src="${esc(backend.photoUrl(ruta))}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '');
