// Prueba SOLO el mecanismo de sustitución de parámetros (sql`...${x}...`) de db-postgres.js:
// que cada ${valor} se convierta en el $N correcto y en el orden correcto. No prueba una base de
// datos real (aquí no hay red) — para eso, tests/logica.test.mjs contra db-memoria.js, y la lista
// de comprobación manual del README tras desplegar.
// Requiere el doble de 'pg' en node_modules/pg (ver tests/instalar-stub-pg.mjs si no existe).
global.__consultas = [];
process.env.DATABASE_URL = 'postgres://u:p@host/db';
const { crearDbPostgres } = await import('/home/claude/reto29/api/_lib/db-postgres.js');
const db = crearDbPostgres();

let fallos = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };
const ultima = () => global.__consultas.at(-1);

await db.settings();
ok(ultima().text.trim() === 'select * from settings where id' && ultima().params.length === 0, 'settings(): sin parámetros');

try { await db.participantesActivos(['a', 'b', 'c']); } catch {}
ok(ultima().text.includes('= any($1::uuid[])') && JSON.stringify(ultima().params) === JSON.stringify([['a', 'b', 'c']]), `participantesActivos: placeholder $1 + array — texto: ${ultima().text.trim()}`);

try { await db.buscarEncuentroExacto(['x', 'y']); } catch {}
ok(ultima().text.includes('= $1') && ultima().text.includes('!= all($2::uuid[])') && JSON.stringify(ultima().params) === JSON.stringify([2, ['x', 'y']]), `buscarEncuentroExacto: dos placeholders correlativos ($1 count, $2 array) — texto: ${ultima().text.replace(/\s+/g, ' ').trim()}`);

try { await db.insertarEncuentro({ photo_path: 'p', thumb_path: 't', place: 'plaza', occurred_at: 'ahora', note: null, status: 'published', participants: ['id1', 'id2', 'id3'] }); } catch {}
const insEnc = global.__consultas[global.__consultas.length - 4];
ok(insEnc.text.includes('$1') && insEnc.text.includes('$6') && insEnc.params.length === 6, `insertarEncuentro: 6 placeholders en orden — params: ${JSON.stringify(insEnc.params)}`);
ok(global.__consultas.slice(-3).every((q) => q.text.includes('$1') && q.text.includes('$2') && q.params.length === 2), 'insertarEncuentro: un insert en encounter_participants por participante');

try { await db.actualizar('participants', 'id-x', { display_name: 'Nuevo', active: false }); } catch {}
ok(ultima().text === 'update participants set display_name = $2, active = $3 where id = $1 returning *' && JSON.stringify(ultima().params) === JSON.stringify(['id-x', 'Nuevo', false]), `actualizar(): UPDATE con $1=id y resto correlativo — texto: "${ultima().text}"`);

global.__consultas = [];
try { await db.actualizar('encounters', 'enc-1', { participants: ['p1', 'p2'], place: 'sitio' }); } catch {}
ok(global.__consultas[0].text.includes('delete from encounter_participants') && global.__consultas[0].params[0] === 'enc-1', 'actualizar() con participants: primero borra las filas de encounter_participants');
ok(global.__consultas.length === 5, `actualizar() con participants: borrar + 2 inserts + update + select final = 5 consultas (hubo ${global.__consultas.length})`);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
