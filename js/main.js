import { esc, fmtCuando, toLocalInput, fromLocalInput, toast, textoError, pairKey } from './util.js';
import { S, D, backend, nombre, compite, encuentroDe, misEncuentros, ordenNombres, ranking, alCambiar, arrancarDesdeCache, refrescar, entrar, elegirYo, olvidarAcceso, aplicarLocal } from './store.js';
import { acts, nav, ico, fotoPicker, manejarFoto, subirSiHaceFalta, confirmar, img, nombreH } from './ui.js';
import { vistaAdmin } from './admin.js';

const app = document.getElementById('app');

// ------------------------------------------------------------------ router
// Dos modos: URLs reales (despliegue normal) o pila en memoria (ROUTER:'memory', para incrustar la web
// en un iframe/vista previa donde no se puede tocar la barra de direcciones).
const MEM = (window.RETO29_CONFIG || {}).ROUTER === 'memory';
const pila = ['/'];
function leerRuta() {
  const u = MEM ? new URL(pila[pila.length - 1], 'http://x') : location;
  return { path: u.pathname.replace(/\/+$/, '') || '/', q: new URLSearchParams(u.search) };
}
function ponerURL(url, replace) {
  if (MEM) { replace ? (pila[pila.length - 1] = url) : pila.push(url); }
  else history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
nav.ruta = leerRuta();
nav.ir = (url, { replace = false } = {}) => { ponerURL(url, replace); nav.ruta = leerRuta(); alCambiarRuta(); render(); window.scrollTo(0, 0); };
window.addEventListener('popstate', () => { if (MEM) return; nav.ruta = leerRuta(); alCambiarRuta(); render(); });
let navegado = false;
function atras(porDefecto = '/') {
  if (MEM) { if (pila.length > 1) { pila.pop(); nav.ruta = leerRuta(); alCambiarRuta(); render(); } else nav.ir(porDefecto, { replace: true }); return; }
  navegado ? history.back() : nav.ir(porDefecto, { replace: true });
}
function alCambiarRuta() { navegado = true; if (nav.ruta.path !== '/nuevo') FN = null; if (!nav.ruta.path.startsWith('/encuentro/')) AE.clear(); }

// ------------------------------------------------------------------ entrada (código + quién eres)
const E = { info: null, error: '', ocupado: false, codigo: '' };

function vistaEntrada() {
  const demo = backend.modo === 'demo';
  return `<main class="entrada">
    <p class="logo-xl">f!t</p>
    <h1 class="titulo-xl">RETO 29</h1>
    <p class="sub">Una foto con cada una de las otras 29 personas del FIT 2026.</p>
    ${E.info === null && !E.error ? `<p class="cargando"><span class="spin"></span> Conectando…</p>` : `
    <form data-submit="entrar" class="form">
      <label class="campo"><span>Código del reto</span>
        <input name="codigo" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="El que venía en el WhatsApp" value="${esc(E.codigo)}" required></label>
      ${E.error ? `<p class="error">${esc(E.error)}</p>` : ''}
      <button class="cta" ${E.ocupado ? 'disabled' : ''}>${E.ocupado ? 'Comprobando…' : 'ENTRAR'}</button>
      ${demo ? `<p class="nota">Modo demo (probando sin desplegar nada): el código es <b>demo</b>. Los datos solo se guardan en este dispositivo.</p>` : ''}
    </form>`}
  </main>`;
}

async function iniciarEntrada() {
  const delEnlace = nav.ruta.q.get('c');
  if (delEnlace) { ponerURL(nav.ruta.path, true); nav.ruta = leerRuta(); }  // el código no se queda en la barra
  const candidato = delEnlace || S.codigo;
  try {
    if (candidato) { await entrar(candidato); return render(); }
  } catch (e) {
    if (e.code !== 'CODIGO_INVALIDO') { E.error = textoError(e); if (S.data) return; }
    else { olvidarAcceso(); E.error = delEnlace ? 'El código del enlace ya no vale. Pide el nuevo.' : ''; }
  }
  try {
    E.info = await backend.accessInfo();
    if (!E.info.code_required) { await entrar(''); return render(); }
  } catch (e) { E.info = {}; E.error = textoError(e); }
  render();
}

acts.entrar = async (form) => {
  E.codigo = form.codigo.value; E.error = ''; E.ocupado = true; render();
  try { await entrar(E.codigo); } catch (e) { E.error = textoError(e); }
  E.ocupado = false; render();
};

function vistaQuien(primera) {
  return `${primera ? `<header class="top"><span class="marca"><b>f!t</b><span>Reto 29</span></span></header>` : cabeceraSub('¿Quién eres?')}
  <main class="pag">
    ${primera ? `<h1 class="h1">¿Quién eres?</h1><p class="sub">Se guarda en este teléfono para no preguntártelo más. Puedes cambiarlo cuando quieras.</p>` : ''}
    <div class="grid-nombres">${D.gente.map((p) => `<button class="nombre ${p.id === S.yo ? 'sel' : ''} ${p.is_placeholder ? 'prov' : ''}" data-act="soy" data-id="${p.id}">${esc(p.display_name)}${p.is_placeholder ? '<small>provisional</small>' : ''}</button>`).join('')}</div>
    ${!primera ? `<p class="centro"><a class="enlace" href="/admin" data-link>Administración</a></p>` : ''}
  </main>`;
}
acts.soy = (el) => { elegirYo(el.dataset.id); if (nav.ruta.path === '/quien') nav.ir('/', { replace: true }); };

// ------------------------------------------------------------------ marco común
function cabecera() {
  return `<header class="top">
    <a class="marca" href="/" data-link aria-label="Inicio"><b>f!t</b><span>Reto 29</span></a>
    <a class="chip-yo" href="/quien" data-link aria-label="Cambiar quién soy">${ico.yo}<span>${esc(nombre(S.yo))}</span></a>
  </header>`;
}
function cabeceraSub(titulo, vuelta = '/') {
  return `<header class="top sub-top"><button class="ic-btn" data-act="atras" data-a="${esc(vuelta)}" aria-label="Volver">${ico.atras}</button><h1>${esc(titulo)}</h1><span class="ic-btn"></span></header>`;
}
acts.atras = (el) => atras(el.dataset.a || '/');

function barraNav() {
  const p = nav.ruta.path;
  const it = (href, icono, txt) => `<a href="${href}" data-link class="${p === href ? 'on' : ''}" ${p === href ? 'aria-current="page"' : ''}>${icono}<span>${txt}</span></a>`;
  return `<nav class="nav" aria-label="Secciones">${it('/', ico.casa, 'Inicio')}${it('/mi-reto', ico.yo, 'Mi reto')}${it('/matriz', ico.matriz, 'Matriz')}${it('/ranking', ico.copa, 'Ranking')}</nav>`;
}

const nombresFoto = (e) => ordenNombres(e).map(nombreH).join(' <span class="x">×</span> ');
const filaEncuentro = (e) => `<a class="fila" href="/encuentro/${e.id}" data-link>
    ${img(e.thumb_path || e.photo_path, '', 'mini')}
    <span class="fila-txt"><b>${nombresFoto(e)}</b>
    <small>${e.place ? esc(e.place) + ' · ' : ''}${fmtCuando(e.occurred_at)}</small></span>${ico.flecha}</a>`;

// ------------------------------------------------------------------ Inicio
function vistaInicio() {
  const n = D.cuenta.get(S.yo) || 0, t = D.total, pct = t ? Math.round((n / t) * 100) : 0;
  const mios = misEncuentros(S.yo).slice(0, 3);
  const falta = t - n;
  return `${cabecera()}<main class="pag">
    ${backend.modo === 'demo' ? `<p class="demo-b">Modo demo: nada sale de este dispositivo. <button class="enlace" data-act="demo-sembrar">Rellenar con ejemplos</button></p>` : ''}
    <section class="prog" aria-label="Mi progreso">
      <p class="prog-t">Mi progreso</p>
      <p class="prog-n"><b>${n}</b><i>/ ${t}</i></p>
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="${t}" aria-valuenow="${n}"><span style="width:${pct}%"></span></div>
      <p class="prog-s">${n === 0 ? 'Empieza por quien tengas al lado.' : falta === 0 ? '¡Reto completado! Tienes foto con todo el grupo.' : `Te ${falta === 1 ? 'falta 1 persona' : `faltan ${falta} personas`}.`}</p>
    </section>
    <a class="cta" href="/nuevo" data-link>${ico.camara} AÑADIR ENCUENTRO</a>
    <h2 class="h2">Mis últimos encuentros</h2>
    ${mios.length ? mios.slice(0, 3).map(filaEncuentro).join('') : `<p class="vacio">Aún no tienes ninguno. La primera foto es la más fácil.</p>`}
  </main>${barraNav()}`;
}

// ------------------------------------------------------------------ Mi reto
function vistaMiReto() {
  const de = D.porId.get(nav.ruta.q.get('p'))?.compites && D.porId.get(nav.ruta.q.get('p'))?.active ? nav.ruta.q.get('p') : S.yo;
  const n = D.cuenta.get(de) || 0;
  const otros = D.gente.filter((p) => p.id !== de);
  return `${cabecera()}<main class="pag">
    <div class="reto-cab"><h1 class="h1">${de === S.yo ? 'Mi reto' : esc(nombre(de))}</h1><p class="reto-n"><b>${n}</b> / ${D.total}</p></div>
    ${de !== S.yo ? `<p class="nota"><a href="/mi-reto" data-link>Volver a mi reto</a></p>` : ''}
    <div class="grid-reto">${otros.map((p) => {
      const e = encuentroDe(de, p.id);
      return e
        ? `<a class="tile hecho" href="/encuentro/${e.id}" data-link>${img(e.thumb_path || e.photo_path, '')}<span class="tick">${ico.check}</span><span class="tile-n">${esc(p.display_name)}</span></a>`
        : `<a class="tile" href="/nuevo?a=${de}&b=${p.id}" data-link><span class="tile-mas">${ico.mas}</span><span class="tile-n">${esc(p.display_name)}</span></a>`;
    }).join('')}</div>
  </main>${barraNav()}`;
}

// ------------------------------------------------------------------ Matriz
const MX = { mini: false, x: 0, y: 0, irA: null };
function vistaMatriz() {
  const g = D.gente, N = g.length;
  let h = `<div class="mx-esq"></div>`;
  h += g.map((p) => `<div class="mx-col ${p.id === S.yo ? 'yo' : ''}"><span>${esc(p.display_name)}</span></div>`).join('');
  for (let i = 0; i < N; i++) {
    h += `<div class="mx-fil ${g[i].id === S.yo ? 'yo' : ''}">${esc(g[i].display_name)}</div>`;
    for (let j = 0; j < N; j++) {
      if (i === j) { h += `<div class="c diag" aria-hidden="true"></div>`; continue; }
      const e = D.parejas.get(pairKey(g[i].id, g[j].id));
      const mio = g[i].id === S.yo || g[j].id === S.yo;
      h += `<button class="c${e ? ' on' : ''}${mio ? ' mio' : ''}${e && e.quienes.length > 2 ? ' grupo' : ''}" data-act="celda" data-i="${i}" data-j="${j}" aria-label="${esc(g[i].display_name)} y ${esc(g[j].display_name)}: ${e ? 'hecho' : 'pendiente'}"></button>`;
    }
  }
  return `${cabecera()}<main class="pag pag-mx">
    <div class="mx-barra"><h1 class="h1">Matriz</h1>
      <div class="seg" role="group" aria-label="Tamaño"><button class="${MX.mini ? '' : 'on'}" data-act="mx-modo" data-m="0">Táctil</button><button class="${MX.mini ? 'on' : ''}" data-act="mx-modo" data-m="1">Entera</button></div></div>
    <p class="leyenda"><i class="ley on"></i> con foto <i class="ley"></i> pendiente <span>· ${D.parejas.size} de ${(N * (N - 1)) / 2} parejas</span></p>
    <div class="mx-wrap ${MX.mini ? 'mini' : ''}" id="mx" style="--n:${N}"><div class="mx">${h}</div></div>
  </main>${barraNav()}`;
}
acts['mx-modo'] = (el) => { MX.mini = el.dataset.m === '1'; MX.x = MX.y = 0; render(); };
acts.celda = (el) => {
  const i = +el.dataset.i, j = +el.dataset.j;
  if (MX.mini) { MX.mini = false; MX.irA = [i, j]; return render(); }   // en la vista entera, tocar = acercarse a esa zona
  const a = D.gente[i].id, b = D.gente[j].id, e = encuentroDe(a, b);
  nav.ir(e ? `/encuentro/${e.id}` : `/nuevo?a=${a}&b=${b}`);
};
function trasMatriz() {
  const w = document.getElementById('mx'); if (!w) return;
  if (MX.irA) { const c = 44; w.scrollLeft = Math.max(0, MX.irA[1] * c - w.clientWidth / 3); w.scrollTop = Math.max(0, MX.irA[0] * c - w.clientHeight / 3); MX.irA = null; }
  else { w.scrollLeft = MX.x; w.scrollTop = MX.y; }
  w.addEventListener('scroll', () => { MX.x = w.scrollLeft; MX.y = w.scrollTop; }, { passive: true });
}

// ------------------------------------------------------------------ Ranking
function vistaRanking() {
  return `${cabecera()}<main class="pag">
    <h1 class="h1">Ranking</h1>
    <p class="sub">Personas distintas con las que ya tiene foto cada cual.</p>
    <ol class="rank">${ranking().map((f) => `<li class="${f.p.id === S.yo ? 'yo' : ''}"><a href="/mi-reto?p=${f.p.id}" data-link><span class="puesto">${f.puesto}</span><span class="rk-n">${esc(f.p.display_name)}</span><span class="rk-v"><b>${f.n}</b>/${D.total}</span></a></li>`).join('')}</ol>
  </main>${barraNav()}`;
}

// ------------------------------------------------------------------ Nuevo encuentro
let FN = null;
function estadoNuevo() {
  if (!FN) {
    const q = nav.ruta.q, okC = (id) => (D.gente.some((p) => p.id === id) ? id : null), okT = (id) => (D.todos.some((p) => p.id === id) ? id : null);
    FN = { a: okC(q.get('a')) || S.yo, b: okT(q.get('b')) || '', mas: [], masAbierto: false, place: '', cuando: null, editarFecha: false, preview: null, blobs: null, rutas: null, procesando: false, ocupado: false, error: '', errFoto: '' };
    if (FN.a === FN.b) FN.b = '';
  }
  return FN;
}
const grupoExistente = (ids) => { const set = new Set(ids); return S.data?.encounters.find((e) => e.participants.length === set.size && e.participants.every((id) => set.has(id))) || null; };
function opcionesGente(sel, excluir) {
  return D.todos.filter((p) => p.id !== excluir).map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''} ${p.compites ? '' : 'class="cursiva"'}>${esc(p.display_name)}</option>`).join('');
}
function vistaNuevo() {
  const F = estadoNuevo();
  const quienes = [F.a, F.b, ...F.mas].filter(Boolean);
  const ya = F.a && F.b ? grupoExistente(quienes) || F.yaServidor : null;
  const otrasPersonas = D.todos.filter((p) => ![F.a, F.b].includes(p.id));
  const listo = F.a && F.b && F.blobs && !F.ocupado;
  return `${cabeceraSub(ya ? 'Otra foto' : 'Nuevo encuentro')}<main class="pag">
    <form class="form" data-submit="guardar-nuevo">
      <div class="dos">
        <label class="campo"><span>Soy</span><select data-ch="nuevo-a">${D.gente.map((p) => `<option value="${p.id}" ${p.id === F.a ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></label>
        <label class="campo"><span>Me encontré con</span><select data-ch="nuevo-b">${opcionesGente(F.b, F.a)}</select></label>
      </div>
      ${F.b ? `<p class="mas-tog"><button type="button" class="enlace" data-act="nuevo-mas-tog">${F.masAbierto ? 'Ocultar' : '+ ¿Salió alguien más en la foto?'}</button></p>` : ''}
      ${F.b && F.masAbierto ? `<div class="campo mas-lista">${otrasPersonas.map((p) => `<label class="chk"><input type="checkbox" data-ch="nuevo-mas" value="${p.id}" ${F.mas.includes(p.id) ? 'checked' : ''}> ${nombreH(p.id)}</label>`).join('')}</div>` : ''}
      ${ya ? `<div class="aviso">${img(ya.thumb_path || ya.photo_path, '', 'mini')}<div><b>Ya tenéis esa foto${ya.status === 'pending' ? ' (pendiente de revisión)' : ''}.</b>
        <small>Puedes añadir otra al mismo grupo. No cambia el progreso.</small>
        ${ya.status !== 'pending' ? `<a href="/encuentro/${ya.id}" data-link>Ver el encuentro</a>` : ''}</div></div>` : ''}
      <div class="campo"><span>Foto</span>${fotoPicker(F)}</div>
      ${ya ? '' : `<label class="campo"><span>Lugar <em>opcional</em></span><input type="text" data-in="nuevo-lugar" value="${esc(F.place)}" maxlength="120" placeholder="¿Dónde fue?" autocomplete="off" enterkeyhint="done"></label>
      ${F.editarFecha
        ? `<label class="campo"><span>Fecha y hora</span><input type="datetime-local" data-in="nuevo-cuando" value="${esc(F.cuando || toLocalInput())}" max="${toLocalInput(new Date(Date.now() + 864e5))}"></label>`
        : `<p class="cuando">Fecha y hora: <b>ahora</b> <button type="button" class="enlace" data-act="nuevo-fecha">Cambiar</button></p>`}`}
      ${F.error ? `<p class="error">${esc(F.error)}</p>` : ''}
      <div class="pie-form"><button class="cta" ${listo ? '' : 'disabled'}>${F.ocupado ? '<span class="spin"></span> Guardando…' : ya ? 'AÑADIR FOTO' : 'GUARDAR ENCUENTRO'}</button></div>
    </form>
  </main>`;
}
acts['nuevo-a'] = (el) => { FN.a = el.value; if (FN.b === FN.a) FN.b = ''; FN.mas = FN.mas.filter((id) => id !== FN.a); FN.yaServidor = null; render(); };
acts['nuevo-b'] = (el) => { FN.b = el.value; FN.mas = FN.mas.filter((id) => id !== FN.b); FN.yaServidor = null; render(); };
acts['nuevo-mas-tog'] = () => { FN.masAbierto = !FN.masAbierto; render(); };
acts['nuevo-mas'] = (el) => { FN.mas = el.checked ? [...FN.mas, el.value] : FN.mas.filter((id) => id !== el.value); FN.yaServidor = null; render(); };
acts['nuevo-lugar'] = (el) => { FN.place = el.value; };
acts['nuevo-cuando'] = (el) => { FN.cuando = el.value; };
acts['nuevo-fecha'] = () => { FN.editarFecha = true; FN.cuando = toLocalInput(); render(); };

acts['guardar-nuevo'] = async () => {
  const F = FN; if (!F || F.ocupado || !F.a || !F.b || !F.blobs) return;
  const quienes = [...new Set([F.a, F.b, ...F.mas])];
  F.ocupado = true; F.error = ''; render();
  try {
    const rutas = await subirSiHaceFalta(F, 'enc');
    const ya = grupoExistente(quienes) || F.yaServidor;
    if (ya) {
      const f = await backend.addEncounterPhoto(S.codigo, ya.id, rutas);
      aplicarLocal((d) => { d.encounter_photos.push(f); });
      toast('Foto añadida'); FN = null; return nav.ir(`/encuentro/${ya.id}`, { replace: true });
    }
    const r = await backend.addEncounter(S.codigo, { quienes, ...rutas, place: F.place, occurred_at: F.editarFecha && F.cuando ? fromLocalInput(F.cuando) : new Date().toISOString() });
    if (!r.created) {   // otro móvil la registró antes: no se duplica; se ofrece añadir la foto
      F.yaServidor = r.encounter; F.ocupado = false;
      if (r.encounter.status === 'published') aplicarLocal((d) => { if (!d.encounters.some((e) => e.id === r.encounter.id)) d.encounters.push(r.encounter); });
      return render();
    }
    if (r.encounter.status === 'pending') { toast('Enviado. Aparecerá cuando lo revise el admin.', 4000); FN = null; return nav.ir('/', { replace: true }); }
    aplicarLocal((d) => { d.encounters.push(r.encounter); });
    toast(quienes.length > 2 ? '¡Hecho! Suma para todo el grupo' : `¡Hecho! Suma para ${nombre(F.a)} y para ${nombre(F.b)}`, 3200);
    FN = null; nav.ir(`/encuentro/${r.encounter.id}`, { replace: true });
  } catch (e) { F.error = textoError(e); F.ocupado = false; render(); }
};
acts.foto = (input) => manejarFoto(() => FN)(input);

// ------------------------------------------------------------------ Detalle de encuentro
// Foto adicional ("para que el álbum quede bonito"): sube directamente A ESTE encuentro, sin pasar por
// /nuevo, para que nunca se pierda a nadie del grupo (una foto de 3+ personas no cabe en "a" + "b").
const AE = new Map();
const estadoAE = (id) => AE.get(id) || AE.set(id, { abierto: false, preview: null, blobs: null, rutas: null, procesando: false, ocupado: false, errFoto: '', error: '' }).get(id);

function vistaEncuentro(id) {
  const e = S.data.encounters.find((x) => x.id === id);
  if (!e) return `${cabeceraSub('Encuentro')}<main class="pag"><p class="vacio">Este encuentro no existe o se ha borrado.</p><a class="btn" href="/" data-link>Ir a inicio</a></main>`;
  const mas = D.fotosExtra.get(e.id) || [];
  const quienes = ordenNombres({ quienes: e.participants });
  const ae = estadoAE(e.id);
  return `${cabeceraSub('Encuentro')}<main class="pag det">
    <h2 class="det-n">${quienes.map(nombreH).join(' <span class="x">×</span> ')}</h2>
    <p class="det-c">${fmtCuando(e.occurred_at)}${e.status === 'pending' ? ' · pendiente de revisión' : ''}</p>
    <div class="det-foto">${img(e.photo_path, quienes.map((id) => nombre(id)).join(' y '))}</div>
    ${mas.map((f) => `<div class="det-foto">${img(f.photo_path, 'Otra foto del encuentro')}${S.admin ? `<button class="btn btn-mini peligro" data-act="adm-borrar-foto" data-id="${f.id}">Borrar esta foto</button>` : ''}</div>`).join('')}
    ${e.place ? `<p class="det-l">${ico.lugar}<span>${esc(e.place)}</span></p>` : ''}
    ${e.note ? `<p class="det-nota">${esc(e.note)}</p>` : ''}
    <p class="nota">Cuenta una vez para cada pareja del grupo, haya las fotos que haya.</p>
    ${mas.length < 5 ? bloqueFotoExtra(e, ae) : ''}
    ${S.admin ? `<div class="dos admin-acc"><a class="btn" href="/admin?e=${e.id}" data-link>Editar</a><button class="btn peligro" data-act="adm-borrar-enc" data-id="${e.id}">Eliminar</button></div>` : ''}
  </main>`;
}
function bloqueFotoExtra(e, ae) {
  if (!ae.abierto) return `<button type="button" class="btn" data-act="mostrar-mas-foto" data-id="${e.id}">${ico.camara} Añadir otra foto</button>`;
  return `<div class="campo">${fotoPicker(ae, 'foto-extra')}</div>
    ${ae.error ? `<p class="error">${esc(ae.error)}</p>` : ''}
    <button type="button" class="btn" data-act="guardar-foto-extra" data-id="${e.id}" ${ae.blobs && !ae.ocupado ? '' : 'disabled'}>${ae.ocupado ? 'Guardando…' : 'Guardar foto'}</button>`;
}
acts['mostrar-mas-foto'] = (el) => { estadoAE(el.dataset.id).abierto = true; render(); };
acts['foto-extra'] = (input) => { const id = nav.ruta.path.split('/')[2]; manejarFoto(() => estadoAE(id))(input); };
acts['guardar-foto-extra'] = async (el) => {
  const id = el.dataset.id, ae = estadoAE(id); if (!ae.blobs || ae.ocupado) return;
  ae.ocupado = true; ae.error = ''; render();
  try {
    const rutas = await subirSiHaceFalta(ae, 'enc');
    const f = await backend.addEncounterPhoto(S.codigo, id, rutas);
    aplicarLocal((d) => { d.encounter_photos.push(f); });
    AE.delete(id); toast('Foto añadida');
  } catch (err) { ae.error = textoError(err); ae.ocupado = false; }
  render();
};

// ------------------------------------------------------------------ render
function render() {
  const { path } = nav.ruta;
  let html;
  if (path === '/admin') html = vistaAdmin();
  else if (!S.data) html = vistaEntrada();
  else if (!S.yo) html = vistaQuien(true);
  else if (path === '/') html = vistaInicio();
  else if (path === '/mi-reto') html = vistaMiReto();
  else if (path === '/matriz') html = vistaMatriz();
  else if (path === '/ranking') html = vistaRanking();
  else if (path === '/nuevo') html = vistaNuevo();
  else if (path === '/quien') html = vistaQuien(false);
  else if (path.startsWith('/encuentro/')) html = vistaEncuentro(path.split('/')[2]);
  else { ponerURL('/', true); nav.ruta = leerRuta(); html = vistaInicio(); }
  app.innerHTML = html;
  document.body.dataset.ruta = path;
  if (path === '/matriz') trasMatriz();
  // Los <input type=file> escuchan directamente: si la pantalla se repinta con el selector de fotos abierto
  // (input ya fuera del DOM), el evento no se pierde.
  app.querySelectorAll('input[type=file][data-ch]').forEach((i) => i.addEventListener('change', (ev) => acts[i.dataset.ch]?.(i, ev)));
}
nav.render = render;

// ------------------------------------------------------------------ eventos (delegación)
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[data-link]');
  if (a && (MEM || (!ev.metaKey && !ev.ctrlKey && !ev.shiftKey))) { ev.preventDefault(); const u = new URL(a.getAttribute('href'), 'http://x'); return nav.ir(u.pathname + u.search); }
  const b = ev.target.closest('[data-act]');
  if (b && !b.disabled && acts[b.dataset.act]) { if (b.tagName === 'BUTTON' && b.type !== 'submit') ev.preventDefault(); acts[b.dataset.act](b, ev); }
});
document.addEventListener('change', (ev) => { const k = ev.target.dataset?.ch; if (k && acts[k] && ev.target.type !== 'file') acts[k](ev.target, ev); });
document.addEventListener('input', (ev) => { const k = ev.target.dataset?.in; if (k && acts[k]) acts[k](ev.target, ev); });
document.addEventListener('submit', (ev) => { const k = ev.target.dataset?.submit; if (k) { ev.preventDefault(); acts[k]?.(ev.target, ev); } });

// Refrescos en segundo plano: nunca pisan un formulario a medias.
const enFormulario = () => ['/nuevo', '/admin'].includes(nav.ruta.path);
alCambiar((motivo) => { if (['refresco', 'entrada'].includes(motivo) && S.yo && enFormulario()) return; render(); });
const refrescoSilencioso = () => { if (S.data && document.visibilityState === 'visible') refrescar().catch((e) => { if (e.code === 'CODIGO_INVALIDO') { olvidarAcceso(); E.info = { code_required: true }; E.error = 'El código del reto ha cambiado. Pide el nuevo.'; render(); } }); };
document.addEventListener('visibilitychange', refrescoSilencioso);
window.addEventListener('online', refrescoSilencioso);
setInterval(refrescoSilencioso, 45000);

// ------------------------------------------------------------------ arranque
(async function arrancar() {
  if (backend.listo) await backend.listo;
  if (S.codigo || !nav.ruta.q.get('c')) arrancarDesdeCache();      // pinta al instante con lo último visto
  if (backend.haySesion()) S.admin = await backend.isAdmin();
  render();
  if (S.admin) { try { await refrescar('admin'); } catch { /* sin red */ } return render(); }   // el admin entra sin código
  if (nav.ruta.path === '/admin') return;
  await iniciarEntrada();
})();
