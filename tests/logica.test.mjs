// Prueba api/_lib/logica.js DE VERDAD (no un mock del propio código) contra el doble en memoria de la base de datos.
// node tests/logica.test.mjs
import { crearLogica } from '../api/_lib/logica.js';
import { crearDbMemoria, crearBlobsMemoria } from '../api/_lib/db-memoria.js';

let fallos = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };
const db = crearDbMemoria(), blobs = crearBlobsMemoria();
const atender = crearLogica({ db, blobs, env: { ADMIN_PASSWORD: 'clave-admin-de-prueba', CODIGO_RETO: 'fit2026' } });
const ir = (fn, args, ctx = {}) => atender({ fn, args, code: ctx.code, token: ctx.token });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(200).fill(0)]).toString('base64');

console.log('1) Acceso');
ok((await ir('access_info')).body.data.code_required === true, 'pide código');
ok((await ir('get_state', {}, { code: 'MAL' })).status === 401, 'código incorrecto → 401');
const st1 = await ir('get_state', {}, { code: 'fit2026' });
ok(st1.status === 200 && st1.body.data.participants.length === 33, 'código correcto: 29 + nº30 + 3 profes = 33 participantes');
const profes = st1.body.data.participants.filter((p) => !p.compites);
ok(profes.length === 3 && profes.every((p) => ['Cou', 'Feña', 'Gala'].includes(p.display_name)), 'Cou, Feña y Gala no compiten');
const [ana, bea, cel] = st1.body.data.participants.filter((p) => p.compites);
const profe = profes[0];

console.log('2) Foto de grupo cubre TODAS las parejas del grupo');
const su = await ir('upload', { tipo: 'enc', photo: JPEG, thumb: JPEG }, { code: 'fit2026' });
ok(su.status === 200, 'sube foto');
const r1 = await ir('add_encounter', { quienes: [ana.id, bea.id, cel.id], ...su.body.data }, { code: 'fit2026' });
ok(r1.body.data.created === true, 'crea encuentro de 3 personas');
const st2 = (await ir('get_state', {}, { code: 'fit2026' })).body.data;
ok(st2.encounters[0].participants.length === 3, 'el encuentro guarda las 3 personas');

console.log('3) Con un profe en la foto, no cuenta para el reto (eso lo calcula el cliente; aquí solo comprobamos que se guarda tal cual)');
const su2 = await ir('upload', { tipo: 'enc', photo: JPEG, thumb: JPEG }, { code: 'fit2026' });
const r2 = await ir('add_encounter', { quienes: [ana.id, profe.id], ...su2.body.data }, { code: 'fit2026' });
ok(r2.body.data.created === true, 'se puede fotografiar con un profe');

console.log('4) Repetir EXACTAMENTE el mismo grupo no duplica');
const su3 = await ir('upload', { tipo: 'enc', photo: JPEG, thumb: JPEG }, { code: 'fit2026' });
const r3 = await ir('add_encounter', { quienes: [bea.id, ana.id, cel.id], ...su3.body.data }, { code: 'fit2026' });   // mismo trío, orden distinto
ok(r3.body.data.created === false && r3.body.data.encounter.id === r1.body.data.encounter.id, 'mismo grupo (orden distinto) = mismo encuentro, no crea otro');

console.log('5) Foto extra ("para que el álbum quede bonito"): hasta 5, no crea parejas nuevas');
for (let i = 0; i < 5; i++) {
  const su = await ir('upload', { tipo: 'enc', photo: JPEG, thumb: JPEG }, { code: 'fit2026' });
  const r = await ir('add_encounter_photo', { encounter_id: r1.body.data.encounter.id, ...su.body.data }, { code: 'fit2026' });
  if (i === 4) ok(r.status === 200, '5ª foto extra: aceptada');
}
const su6 = await ir('upload', { tipo: 'enc', photo: JPEG, thumb: JPEG }, { code: 'fit2026' });
const r6 = await ir('add_encounter_photo', { encounter_id: r1.body.data.encounter.id, ...su6.body.data }, { code: 'fit2026' });
ok(r6.status === 400 && r6.body.code === 'DEMASIADAS_FOTOS', '6ª foto extra: rechazada');

console.log('6) Sin permisos de admin');
ok((await ir('admin_remove', { tabla: 'encounters', id: r1.body.data.encounter.id })).status === 403, 'borrar sin sesión → 403');
ok((await ir('login', { password: 'mala' })).status === 401, 'login con contraseña mala → 401');
const lg = await ir('login', { password: 'clave-admin-de-prueba' });
ok(lg.status === 200 && lg.body.data.token, 'login correcto: token');
const tok = lg.body.data.token;
ok((await ir('is_admin', {}, { token: tok })).body.data === true, 'token válido → is_admin');
ok((await ir('is_admin', {}, { token: '999.abc' })).body.data === false, 'token inventado → no admin');

console.log('7) Admin: renombrar nº30, editar grupo de una foto, borrar');
const n30 = st1.body.data.participants.find((p) => p.is_placeholder);
const ren = await ir('admin_update', { tabla: 'participants', id: n30.id, cambios: { display_name: 'NombreReal', is_placeholder: false } }, { token: tok });
ok(ren.status === 200 && ren.body.data.display_name === 'NombreReal', 'renombra al nº30');
const ed = await ir('admin_update', { tabla: 'encounters', id: r1.body.data.encounter.id, cambios: { place: 'Praza Nova', participants: [ana.id, bea.id] } }, { token: tok });
ok(ed.status === 200 && ed.body.data.participants.length === 2, 'admin puede quitar a una persona de una foto de grupo');
const bo = await ir('admin_remove', { tabla: 'encounters', id: r1.body.data.encounter.id }, { token: tok });
ok(bo.status === 200, 'borra el encuentro');
ok((await ir('get_state', {}, { code: 'fit2026' })).body.data.encounters.length === 1, 'solo queda el encuentro con el profe');

console.log('8) Validaciones');
ok((await ir('add_encounter', { quienes: [ana.id], ...su.body.data }, { code: 'fit2026' })).body.code === 'PAREJA_INVALIDA', 'un solo participante: rechazado');
ok((await ir('add_encounter', { quienes: ['no-es-uuid', ana.id], ...su.body.data }, { code: 'fit2026' })).body.code === 'PAREJA_INVALIDA', 'id con formato inválido: rechazado');
ok((await ir('upload', { tipo: 'enc', photo: 'no-es-jpeg', thumb: JPEG }, { code: 'fit2026' })).body.code === 'RUTA_FOTO_INVALIDA', 'archivo que no es JPEG: rechazado');
ok((await ir('admin_set_code', { code: '' })).status === 403, 'cambiar código sin admin: rechazado');
await ir('admin_set_code', { code: '' }, { token: tok });
ok((await ir('access_info')).body.data.code_required === false, 'admin quita el código: entrada libre');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
