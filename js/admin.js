// Panel /admin. La protección REAL está en el servidor (contraseña única + token firmado): esto es solo la interfaz.
import { esc, fmtCuando, toLocalInput, fromLocalInput, toast, textoError, norm, pairKey } from './util.js';
import { S, D, backend, nombre, compite, ordenar, refrescar, ordenNombres } from './store.js';
import { acts, nav, fotoPicker, img, manejarFoto, confirmar, nombreH } from './ui.js';

const A = { tab: 'enc', login: { error: '', ocupado: false }, filtro: '', edit: null, enlace: '' };

const cab = () => `<header class="top sub-top"><a class="ic-btn" href="/" data-link aria-label="Salir del panel">✕</a><h1>Administración</h1><button class="ic-btn txt" data-act="adm-salir">Salir</button></header>`;

export function vistaAdmin() {
  if (!S.admin) {
    return `<header class="top sub-top"><a class="ic-btn" href="/" data-link aria-label="Volver">✕</a><h1>Administración</h1><span class="ic-btn"></span></header>
    <main class="pag"><form class="form" data-submit="adm-login">
      <label class="campo"><span>Contraseña de administración</span><input name="password" type="password" autocomplete="current-password" required></label>
      ${A.login.error ? `<p class="error">${esc(A.login.error)}</p>` : ''}
      <button class="cta" ${A.login.ocupado ? 'disabled' : ''}>${A.login.ocupado ? 'Entrando…' : 'ENTRAR'}</button>
      ${backend.modo === 'demo' ? '<p class="nota">Modo demo: la contraseña es <b>demo</b>.</p>' : ''}
    </form></main>`;
  }
  if (!S.data) return `${cab()}<main class="pag"><p class="cargando"><span class="spin"></span> Cargando…</p></main>`;
  const e = nav.ruta.q.get('e');
  if (e) return vistaEditar(e);
  const tabs = [['enc', 'Encuentros'], ['gente', 'Participantes'], ['ajustes', 'Ajustes']];
  return `${cab()}<main class="pag adm">
    <div class="seg ancho tabs" role="tablist">${tabs.map(([k, t]) => `<button class="${A.tab === k ? 'on' : ''}" data-act="adm-tab" data-t="${k}">${t}</button>`).join('')}</div>
    ${{ enc: tabEncuentros, gente: tabGente, ajustes: tabAjustes }[A.tab]()}
  </main>`;
}

acts['adm-login'] = async (f) => {
  A.login = { error: '', ocupado: true }; nav.render();
  try { await backend.login('', f.password.value); S.admin = true; await refrescar('admin'); }
  catch (e) { A.login.error = textoError(e); }
  A.login.ocupado = false; nav.render();
};
acts['adm-salir'] = async () => { await backend.logout(); S.admin = false; try { await refrescar('admin'); } catch { /* sin código */ } nav.ir('/', { replace: true }); };
acts['adm-tab'] = (el) => { A.tab = el.dataset.t; nav.render(); };

async function hacer(fn, ok) {            // ejecuta, refresca desde servidor y avisa
  try { await fn(); await refrescar('admin'); if (ok) toast(ok); }
  catch (e) { toast(textoError(e), 4500); }
  nav.render();
}

// ---------------------------------------------------------------- Encuentros
function avisos() {
  const d = S.data, out = [];
  const pend = d.encounters.filter((e) => e.status === 'pending').length;
  if (pend) out.push(`${pend} encuentro(s) pendientes de revisión.`);
  const act = d.participants.filter((p) => p.active && p.compites);
  if (act.length !== 30) out.push(`Hay ${act.length} participantes activos que compiten (deberían ser 30).`);
  if (act.some((p) => p.is_placeholder)) out.push('Falta poner nombre al participante nº30 (pestaña Participantes).');
  const vistos = new Map();
  for (const p of d.participants) { const k = norm(p.display_name); if (vistos.has(k)) out.push(`Nombres casi iguales: «${vistos.get(k)}» y «${p.display_name}».`); else vistos.set(k, p.display_name); }
  return out.length ? `<ul class="avisos">${out.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
}
function tabEncuentros() {
  const f = norm(A.filtro);
  const lista = [...S.data.encounters].sort((x, y) => (x.status !== y.status ? (x.status === 'pending' ? -1 : 1) : x.created_at < y.created_at ? 1 : -1))
    .filter((e) => !f || norm(e.participants.map(nombre).join(' ') + ' ' + (e.place || '')).includes(f));
  return `${avisos()}
    <label class="campo"><input type="search" data-in="adm-filtro" value="${esc(A.filtro)}" placeholder="Buscar por nombre o lugar" autocomplete="off"></label>
    <p class="nota">${lista.length} de ${S.data.encounters.length} encuentros · más recientes primero</p>
    <div id="adm-lista">${lista.map((e) => `<div class="fila adm-fila">${img(e.thumb_path || e.photo_path, '', 'mini')}
      <span class="fila-txt"><b>${e.participants.map(nombreH).join(' × ')}</b><small>${e.status === 'pending' ? '<mark>pendiente</mark> · ' : ''}${e.place ? esc(e.place) + ' · ' : ''}${fmtCuando(e.occurred_at)}${(D.fotosExtra.get(e.id) || []).length ? ' · +' + D.fotosExtra.get(e.id).length + ' fotos' : ''}</small></span>
      ${e.status === 'pending' ? `<button class="btn btn-mini" data-act="adm-aprobar" data-id="${e.id}">Aprobar</button>` : ''}
      <a class="btn btn-mini" href="/admin?e=${e.id}" data-link>Editar</a></div>`).join('') || '<p class="vacio">Nada por aquí.</p>'}</div>`;
}
acts['adm-filtro'] = (el) => { A.filtro = el.value; const pos = el.selectionStart; nav.render(); const n = document.querySelector('[data-in="adm-filtro"]'); n?.focus(); n?.setSelectionRange(pos, pos); };
acts['adm-aprobar'] = (el) => hacer(() => backend.update('encounters', el.dataset.id, { status: 'published' }), 'Publicado');

async function borrarEncuentro(id) {
  const e = S.data.encounters.find((x) => x.id === id); if (!e) return;
  if (!(await confirmar(`¿Eliminar el encuentro de ${e.participants.map(nombre).join(', ')}?`))) return;
  const fotos = [e.photo_path, e.thumb_path, ...(S.data.encounter_photos || []).filter((f) => f.encounter_id === id).flatMap((f) => [f.photo_path, f.thumb_path])];
  await hacer(async () => { await backend.remove('encounters', id); await backend.removePhotos(fotos); }, 'Encuentro eliminado');
  nav.ir(S.admin && nav.ruta.path === '/admin' ? '/admin' : '/', { replace: true });
}
acts['adm-borrar-enc'] = (el) => borrarEncuentro(el.dataset.id);
acts['adm-borrar-foto'] = async (el) => {
  const f = S.data.encounter_photos.find((x) => x.id === el.dataset.id); if (!f || !(await confirmar('¿Borrar esta foto adicional?'))) return;
  hacer(async () => { await backend.remove('encounter_photos', f.id); await backend.removePhotos([f.photo_path, f.thumb_path]); }, 'Foto borrada');
};

function vistaEditar(id) {
  const e = S.data.encounters.find((x) => x.id === id);
  const cabE = `<header class="top sub-top"><a class="ic-btn" href="/admin" data-link aria-label="Volver">‹</a><h1>Editar encuentro</h1><span class="ic-btn"></span></header>`;
  if (!e) return `${cabE}<main class="pag"><p class="vacio">No existe.</p></main>`;
  if (!A.edit || A.edit.id !== id) A.edit = { id, quienes: [...e.participants], place: e.place || '', note: e.note || '', cuando: toLocalInput(new Date(e.occurred_at)), status: e.status, preview: null, blobs: null, procesando: false, error: '', ocupado: false };
  const F = A.edit, gente = ordenar(S.data.participants);
  return `${cabE}<main class="pag"><form class="form" data-submit="adm-guardar-enc">
    <div class="campo"><span>Quiénes salen (${F.quienes.length})</span>
      <div class="mas-lista">${gente.map((p) => `<label class="chk ${p.active ? '' : 'inactivo'}"><input type="checkbox" data-ch="adm-e-quien" value="${p.id}" ${F.quienes.includes(p.id) ? 'checked' : ''}> ${nombreH(p.id)}${p.active ? '' : ' <small>(inactivo)</small>'}</label>`).join('')}</div></div>
    <div class="campo"><span>Foto</span>${F.preview || F.procesando ? fotoPicker(F, 'adm-foto') : `<div class="foto-prev">${img(e.thumb_path || e.photo_path, '')}<label class="btn btn-mini foto-cambiar">Sustituir foto<input class="vh" type="file" accept="image/*" data-ch="adm-foto"></label></div>`}</div>
    <label class="campo"><span>Lugar</span><input type="text" data-in="adm-e-place" value="${esc(F.place)}" maxlength="120"></label>
    <label class="campo"><span>Fecha y hora</span><input type="datetime-local" data-in="adm-e-cuando" value="${esc(F.cuando)}"></label>
    <label class="campo"><span>Nota</span><input type="text" data-in="adm-e-note" value="${esc(F.note)}" maxlength="500"></label>
    <label class="campo"><span>Estado</span><select data-ch="adm-e-status"><option value="published" ${F.status === 'published' ? 'selected' : ''}>Publicado</option><option value="pending" ${F.status === 'pending' ? 'selected' : ''}>Pendiente (oculto)</option></select></label>
    ${F.error ? `<p class="error">${esc(F.error)}</p>` : ''}
    <button class="cta" ${F.ocupado || F.procesando ? 'disabled' : ''}>${F.ocupado ? 'Guardando…' : 'GUARDAR CAMBIOS'}</button>
    <button type="button" class="btn peligro" data-act="adm-borrar-enc" data-id="${e.id}">Eliminar encuentro</button>
  </form></main>`;
}
acts['adm-e-quien'] = (el) => { A.edit.quienes = el.checked ? [...A.edit.quienes, el.value] : A.edit.quienes.filter((id) => id !== el.value); };
for (const k of ['status']) acts[`adm-e-${k}`] = (el) => { A.edit[k] = el.value; };
for (const k of ['place', 'note', 'cuando']) acts[`adm-e-${k}`] = (el) => { A.edit[k] = el.value; };
acts['adm-foto'] = (input) => manejarFoto(() => A.edit)(input);
acts['adm-guardar-enc'] = async () => {
  const F = A.edit, e = S.data.encounters.find((x) => x.id === F.id); if (!e || F.ocupado) return;
  if (F.quienes.length < 2) { F.error = 'Deja al menos dos personas.'; return nav.render(); }
  F.ocupado = true; F.error = ''; nav.render();
  try {
    const cambios = { participants: F.quienes, place: F.place.trim() || null, note: F.note.trim() || null, occurred_at: fromLocalInput(F.cuando), status: F.status };
    let viejas = [];
    if (F.blobs) { const r = await backend.uploadPhoto('enc', F.blobs, S.codigo); Object.assign(cambios, r); viejas = [e.photo_path, e.thumb_path]; }
    await backend.update('encounters', F.id, cambios);
    await backend.removePhotos(viejas);
    await refrescar('admin'); toast('Guardado'); A.edit = null; nav.ir('/admin', { replace: true });
  } catch (err) { F.error = textoError(err); F.ocupado = false; nav.render(); }
};

// ---------------------------------------------------------------- Participantes
function tabGente() {
  const gente = ordenar(S.data.participants), act = gente.filter((p) => p.active && p.compites).length;
  return `<p class="nota">${act} activos que compiten, de ${gente.filter((p) => p.compites).length}. Cada uno tiene ${Math.max(0, act - 1)} encuentros posibles. Los profes (en cursiva) no compiten.</p>
    ${gente.map((p) => `<form class="adm-item ${p.is_placeholder ? 'prov' : ''} ${p.active ? '' : 'inactivo'}" data-submit="adm-p-guardar" data-id="${p.id}">
      ${p.is_placeholder ? '<p class="error">Provisional: escribe aquí el nombre real del nº30 y guarda.</p>' : ''}
      <input type="text" name="nombre" value="${esc(p.is_placeholder ? '' : p.display_name)}" placeholder="${p.is_placeholder ? 'Nombre del participante nº30' : ''}" maxlength="40" required autocomplete="off" class="${p.compites ? '' : 'cursiva'}">
      <div class="adm-bot">
      <label class="chk-inline"><input type="checkbox" data-act="adm-p-compite" data-id="${p.id}" ${p.compites ? 'checked' : ''}> Compite</label>
      <button class="btn btn-mini">Guardar</button>
      <button type="button" class="btn btn-mini" data-act="adm-p-activo" data-id="${p.id}">${p.active ? 'Desactivar' : 'Activar'}</button>
      <button type="button" class="btn btn-mini peligro" data-act="adm-p-borrar" data-id="${p.id}">Borrar</button>
      <small>${D.cuenta.get(p.id) ?? 0} enc.</small></div></form>`).join('')}
    <form class="adm-item nuevo" data-submit="adm-p-nuevo"><input type="text" name="nombre" placeholder="Añadir participante" maxlength="40" required autocomplete="off"><div class="adm-bot"><label class="chk-inline"><input type="checkbox" name="compite" checked> Compite</label><button class="btn btn-mini">Añadir</button></div></form>`;
}
acts['adm-p-guardar'] = (f) => hacer(() => backend.update('participants', f.dataset.id, { display_name: f.nombre.value.trim(), is_placeholder: false, sort_name: null }), 'Nombre guardado');
acts['adm-p-activo'] = (el) => { const p = S.data.participants.find((x) => x.id === el.dataset.id); hacer(() => backend.update('participants', p.id, { active: !p.active })); };
acts['adm-p-compite'] = (el) => { const p = S.data.participants.find((x) => x.id === el.dataset.id); hacer(() => backend.update('participants', p.id, { compites: el.checked })); };
acts['adm-p-borrar'] = async (el) => { const p = S.data.participants.find((x) => x.id === el.dataset.id); if (await confirmar(`¿Borrar a ${p.display_name}? Solo se puede si no tiene encuentros.`)) hacer(() => backend.remove('participants', p.id), 'Borrado'); };
acts['adm-p-nuevo'] = (f) => hacer(() => backend.insert('participants', { display_name: f.nombre.value.trim(), compites: f.compite.checked }), 'Añadido');

// ---------------------------------------------------------------- Ajustes
function tabAjustes() {
  const s = S.data.settings;
  return `<form class="form" data-submit="adm-codigo">
      <h2 class="h2">Código del reto</h2>
      <p class="nota">Ahora mismo: <b>${s.code_required ? 'se pide código' : 'entrada libre (sin código)'}</b>. El código no se puede consultar (se guarda cifrado); solo cambiarlo. Al cambiarlo, todos tendrán que usar el nuevo.</p>
      <label class="campo"><span>Nuevo código <em>vacío = sin código</em></span><input type="text" name="codigo" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
      <button class="btn">Cambiar código</button>
      ${A.enlace ? `<p class="nota">Enlace para WhatsApp (entra sin teclear nada):</p><p class="enlace-wa">${esc(A.enlace)}</p><button type="button" class="btn btn-mini" data-act="adm-copiar">Copiar enlace</button>` : ''}
    </form>
    <div class="form"><h2 class="h2">Moderación</h2>
      <p class="nota">${s.moderation_enabled ? 'Activada: los encuentros nuevos quedan ocultos hasta que los apruebes.' : 'Desactivada: los encuentros se publican al instante (recomendado).'}</p>
      <button class="btn" data-act="adm-moderacion">${s.moderation_enabled ? 'Desactivar moderación previa' : 'Activar moderación previa'}</button></div>
    ${backend.modo === 'demo' ? `<div class="form"><h2 class="h2">Demo</h2><button class="btn" data-act="demo-sembrar">Rellenar con encuentros de ejemplo</button><button class="btn peligro" data-act="demo-vaciar">Vaciar la demo</button></div>` : ''}
    <p class="nota">modo ${backend.modo}</p>`;
}
acts['adm-codigo'] = (f) => { const c = f.codigo.value.trim(); hacer(async () => { await backend.setCode(c); A.enlace = c ? `${location.origin}/?c=${encodeURIComponent(c)}` : ''; }, c ? 'Código cambiado' : 'Código quitado'); };
acts['adm-copiar'] = async () => { try { await navigator.clipboard.writeText(A.enlace); toast('Copiado'); } catch { toast('Mantén pulsado el enlace para copiarlo'); } };
acts['adm-moderacion'] = () => hacer(() => backend.update('settings', null, { moderation_enabled: !S.data.settings.moderation_enabled }));

// ---------------------------------------------------------------- solo modo demo
acts['demo-sembrar'] = async () => { await backend.sembrar(S.yo); await refrescar('admin'); toast('Ejemplos añadidos'); nav.render(); };
acts['demo-vaciar'] = async () => { if (!(await confirmar('¿Vaciar todos los datos de la demo?', 'Vaciar'))) return; await backend.vaciar(); await refrescar('admin'); toast('Demo vacía'); nav.render(); };
