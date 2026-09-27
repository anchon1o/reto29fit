// Prueba el SQL que genera db-postgres.js contra un doble de 'pg' (sin red ni base de datos real):
// parámetros $N en orden, prefijo fit_ en TODAS las tablas, migración segura de tablas antiguas y
// elección de la variable de conexión. Requiere node_modules/pg (node tests/instalar-stub-pg.mjs).
global.__consultas = []; global.__tx = [];
process.env.DATABASE_URL = 'postgres://u:p@host/db';
const { crearDbPostgres, cadenaConexion } = await import('../api/_lib/db-postgres.js');

let fallos = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };
const ultima = () => global.__consultas.at(-1);
const intenta = async (f) => { try { await f(); } catch { /* el doble devuelve filas vacías */ } };
const SEMILLA = { participantes: [{ display_name: 'Ana', sort_name: null, is_placeholder: false, compites: true }] };

console.log('1) Consultas con parámetros en orden');
const db = crearDbPostgres();
await db.settings();
ok(ultima().text.trim() === 'select * from fit_settings where id' && ultima().params.length === 0, 'settings()');
await intenta(() => db.participantesActivos(['a', 'b', 'c']));
ok(ultima().text.includes('from fit_participants where id = any($1::uuid[])') && JSON.stringify(ultima().params) === JSON.stringify([['a', 'b', 'c']]), 'participantesActivos: $1 = lista');
await intenta(() => db.buscarEncuentroExacto(['x', 'y']));
ok(ultima().text.includes('= $1') && ultima().text.includes('!= all($2::uuid[])') && JSON.stringify(ultima().params) === JSON.stringify([2, ['x', 'y']]), 'buscarEncuentroExacto: $1 tamaño, $2 lista');
await intenta(() => db.insertarEncuentro({ photo_path: 'p', thumb_path: 't', place: 'plaza', occurred_at: 'ahora', note: null, status: 'published', participants: ['id1', 'id2', 'id3'] }));
const insEnc = global.__consultas[global.__consultas.length - 4];
ok(insEnc.text.includes('insert into fit_encounters') && insEnc.params.length === 6, 'insertarEncuentro: 6 parámetros');
ok(global.__consultas.slice(-3).every((q) => q.text.includes('insert into fit_encounter_participants') && q.params.length === 2), 'un insert por participante en fit_encounter_participants');
await intenta(() => db.actualizar('participants', 'id-x', { display_name: 'Nuevo', active: false }));
ok(ultima().text === 'update fit_participants set display_name = $2, active = $3 where id = $1 returning *' && JSON.stringify(ultima().params) === JSON.stringify(['id-x', 'Nuevo', false]), `actualizar(): "${ultima().text}"`);
global.__consultas = [];
await intenta(() => db.actualizar('encounters', 'enc-1', { participants: ['p1', 'p2'], place: 'sitio' }));
ok(global.__consultas[0].text.includes('delete from fit_encounter_participants') && global.__consultas.length === 5, 'actualizar() con participantes: borrar + 2 inserts + update + lectura');
let rechaza = false; try { await db.borrar('otra_tabla; drop table x', 'id'); } catch (e) { rechaza = e.message === 'TABLA'; }
ok(rechaza, 'un nombre de tabla que no es de la lista se rechaza antes de llegar al SQL');

console.log('2) Prefijo fit_ en todo: ninguna consulta toca tablas sin prefijo');
global.__consultas = [];
await intenta(() => db.init({ semilla: SEMILLA, hashInicial: 'h' }));
await intenta(() => db.estado(true)); await intenta(() => db.estado(false));
await intenta(() => db.contarFotos('e')); await intenta(() => db.insertarFotoExtra({ encounter_id: 'e', photo_path: 'p', thumb_path: 't' }));
await intenta(() => db.insertarParticipante({ display_name: 'Z', compites: true })); await intenta(() => db.leer('encounters', 'e'));
await intenta(() => db.borrar('encounter_photos', 'f')); await intenta(() => db.ponerHash('h2')); await intenta(() => db.existeEncuentro('e'));
await intenta(() => db.actualizar('settings', null, { moderation_enabled: true }));
const SIN_PREFIJO = /\b(from|into|update|join|table( if not exists)?|references|on)\s+(participants|encounters|encounter_participants|encounter_photos|settings)\b/i;
const malas = global.__consultas.filter((q) => !q.text.includes('to_regclass') && SIN_PREFIJO.test(q.text));
ok(global.__consultas.length > 15 && malas.length === 0, `${global.__consultas.length} consultas revisadas, ninguna sin prefijo${malas.length ? ': ' + malas.map((q) => q.text.slice(0, 60)).join(' | ') : ''}`);
ok(global.__consultas.some((q) => q.text.includes('create table if not exists fit_participants')), 'crea fit_participants (y el resto de fit_*)');

console.log('3) Migración de tablas antiguas sin prefijo');
{
  global.__antiguas = { ya_migrado: false, hay_antiguas: true, hay_v9: true }; global.__tx = [];
  await intenta(() => crearDbPostgres().init({ semilla: SEMILLA, hashInicial: 'h' }));
  const tx = global.__tx;
  ok(tx[0] === 'begin' && tx.includes('commit') && tx.at(-1) === '(release)', 'se hace dentro de una transacción (begin … commit)');
  ok(tx.includes('alter table participants rename to fit_participants') && tx.includes('alter table settings rename to fit_settings') && tx.includes('alter table encounter_participants rename to fit_encounter_participants'), 'renombra las 5 tablas propias a fit_*');
  ok(tx.includes('alter table delete_requests rename to fit_delete_requests_sin_uso'), 'aparta también la tabla sobrante de la v9');
  ok(tx.indexOf('commit') > tx.indexOf('alter table settings rename to fit_settings'), 'el commit va después de todos los cambios');
}
{
  global.__antiguas = { ya_migrado: false, hay_antiguas: false, hay_v9: false }; global.__tx = [];
  await intenta(() => crearDbPostgres().init({ semilla: SEMILLA, hashInicial: 'h' }));
  ok(global.__tx.length === 0, 'si hay tablas "participants"/"settings" que NO son de esta app, no se toca nada');
  global.__antiguas = { ya_migrado: true, hay_antiguas: true, hay_v9: false }; global.__tx = [];
  await intenta(() => crearDbPostgres().init({ semilla: SEMILLA, hashInicial: 'h' }));
  ok(global.__tx.length === 0, 'si ya existen las fit_*, no se vuelve a migrar');
  global.__antiguas = undefined;
}

console.log('4) Variable de conexión');
ok(cadenaConexion({ FIT_DATABASE_URL: 'postgres://fit', DATABASE_URL: 'postgres://otra' }) === 'postgres://fit', 'FIT_DATABASE_URL tiene prioridad sobre DATABASE_URL');
ok(cadenaConexion({ DATABASE_URL: 'prisma+postgres://accelerate', POSTGRES_URL: 'postgresql://directa' }) === 'postgresql://directa', 'salta la URL de Prisma Accelerate (prisma+postgres://), que pg no entiende');
ok(cadenaConexion({ DATABASE_URL: 'prisma+postgres://accelerate', DATABASE_POSTGRES_URL: 'postgres://directa', DATABASE_PRISMA_DATABASE_URL: 'prisma+postgres://otra' }) === 'postgres://directa', 'con las variables de tu proyecto: si DATABASE_URL no sirve, usa DATABASE_POSTGRES_URL');
ok(cadenaConexion({ DATABASE_URL: 'postgres://directa', DATABASE_PRISMA_DATABASE_URL: 'prisma+postgres://otra' }) === 'postgres://directa', 'y si DATABASE_URL sí es directa, usa esa');
ok(cadenaConexion({ OTRO_PREFIJO_POSTGRES_URL: 'postgres://x' }) === 'postgres://x', 'con cualquier otro prefijo, la encuentra igual');
let sinVar = false; try { cadenaConexion({}); } catch (e) { sinVar = /FIT_DATABASE_URL/.test(e.message); } ok(sinVar, 'sin ninguna variable, el error dice cuáles puede usar');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
