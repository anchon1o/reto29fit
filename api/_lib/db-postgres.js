// Adaptador real de base de datos. Misma interfaz que db-memoria.js (probada en tests/logica.test.mjs).
// Usa el paquete genérico 'pg' (Vercel Postgres nativo se descontinuó en 2025): vale para Prisma Postgres,
// Neon, Supabase… cualquier Postgres con una cadena de conexión.
//
// PREFIJO fit_: todas las tablas de esta app se llaman fit_* para no chocar con otras apps que compartan
// la misma base de datos. Si encuentra las tablas antiguas sin prefijo Y comprueba que son de esta app
// (columnas propias), las renombra en una transacción. Nunca toca tablas ajenas con nombres parecidos.
//
// NO se ha podido probar contra una base de datos real en este entorno (sin red). Antes de confiar en
// él: desplegar, abrir la web, y revisar los logs de la función en Vercel si algo falla.
import pg from 'pg';

const { Pool } = pg;

// Cadena de conexión: primero las variables con prefijo FIT_ (si conectaste la base de datos en Vercel
// con "Custom Prefix" = FIT), después los nombres habituales. Se descartan las URLs que no son de Postgres
// directo (p. ej. la de Prisma Accelerate, "prisma+postgres://…", que 'pg' no entiende).
// Las integraciones de Vercel con "Custom Prefix" crean nombres como DATABASE_POSTGRES_URL; por eso, si no
// está ninguna de la lista, se prueba cualquier variable terminada en _URL que sea una conexión postgres://.
const VARIABLES_BD = ['FIT_DATABASE_URL', 'FIT_POSTGRES_URL', 'FIT_URL', 'DATABASE_URL', 'POSTGRES_URL', 'DATABASE_POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING'];
const esPostgres = (v) => typeof v === 'string' && /^postgres(ql)?:\/\//i.test(v);
export function cadenaConexion(env = process.env) {
  for (const k of VARIABLES_BD) if (esPostgres(env[k])) return env[k];
  const otra = Object.keys(env).sort().find((k) => /_URL$/.test(k) && esPostgres(env[k]));
  if (otra) return env[otra];
  throw new Error(`Falta la cadena de conexión a Postgres: define una de estas variables en Vercel: ${VARIABLES_BD.join(', ')} (debe empezar por postgres://).`);
}

let pool;
function getPool() {
  if (!pool) {
    const connectionString = cadenaConexion();
    const ssl = /sslmode=disable/i.test(connectionString) ? false : { rejectUnauthorized: false };
    pool = new Pool({ connectionString, ssl, max: 3 });
  }
  return pool;
}

// sql`select * from x where id = ${id}` → pool.query('select * from x where id = $1', [id])
function sql(strings, ...values) {
  let text = strings[0];
  const params = [];
  values.forEach((v) => { params.push(v); text += `$${params.length}` + strings[params.length]; });
  return getPool().query(text, params);
}
sql.query = (text, params) => getPool().query(text, params);

// Nombre lógico (el que usa logica.js) → tabla real con prefijo. Lista cerrada: nada ajeno entra en el SQL.
const TABLA = {
  participants: 'fit_participants', encounters: 'fit_encounters', encounter_participants: 'fit_encounter_participants',
  encounter_photos: 'fit_encounter_photos', settings: 'fit_settings',
};
const T = (logico) => { const t = TABLA[logico]; if (!t) throw new Error('TABLA'); return t; };

const SQL_ESQUEMA = `
create extension if not exists pgcrypto;
create table if not exists fit_participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique check (char_length(display_name) between 1 and 40),
  sort_name text, active boolean not null default true,
  is_placeholder boolean not null default false, compites boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists fit_encounters (
  id uuid primary key default gen_random_uuid(),
  photo_path text not null, thumb_path text,
  place text check (place is null or char_length(place) <= 120),
  occurred_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'published' check (status in ('published','pending')),
  created_at timestamptz not null default now()
);
create table if not exists fit_encounter_participants (
  encounter_id uuid not null references fit_encounters(id) on delete cascade,
  participant_id uuid not null references fit_participants(id) on delete restrict,
  primary key (encounter_id, participant_id)
);
create index if not exists fit_ix_ep_participant on fit_encounter_participants(participant_id);
create table if not exists fit_encounter_photos (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references fit_encounters(id) on delete cascade,
  photo_path text not null, thumb_path text, created_at timestamptz not null default now()
);
create table if not exists fit_settings (
  id boolean primary key default true check (id),
  title text not null default 'RETO 29 · FIT 2026',
  challenge_code_hash text, moderation_enabled boolean not null default false
);
`;

// Versiones anteriores creaban las tablas SIN prefijo. Solo se consideran nuestras si existen todas y
// tienen las columnas propias de esta app (compites, challenge_code_hash, encounter_participants…).
const SQL_DETECTAR_ANTIGUAS = `
select
  to_regclass('public.fit_settings') is not null as ya_migrado,
  (to_regclass('public.participants') is not null
   and to_regclass('public.encounters') is not null
   and to_regclass('public.encounter_participants') is not null
   and to_regclass('public.encounter_photos') is not null
   and to_regclass('public.settings') is not null
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'participants' and column_name = 'compites')
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'challenge_code_hash')
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'encounter_participants' and column_name = 'participant_id')
  ) as hay_antiguas,
  (to_regclass('public.delete_requests') is not null
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'delete_requests' and column_name = 'requested_by')
  ) as hay_v9`;
const RENOMBRAR = [
  'alter table participants rename to fit_participants',
  'alter table encounters rename to fit_encounters',
  'alter table encounter_participants rename to fit_encounter_participants',
  'alter table encounter_photos rename to fit_encounter_photos',
  'alter table settings rename to fit_settings',
  'alter index if exists ix_ep_participant rename to fit_ix_ep_participant',
];

async function migrarSiHaceFalta() {
  const { rows } = await sql.query(SQL_DETECTAR_ANTIGUAS);
  const r = rows[0] || {};
  if (r.ya_migrado || !r.hay_antiguas) return false;
  const cli = await getPool().connect();
  try {
    await cli.query('begin');
    for (const q of RENOMBRAR) await cli.query(q);
    if (r.hay_v9) await cli.query('alter table delete_requests rename to fit_delete_requests_sin_uso');   // resto de la v9, vacío
    await cli.query('commit');
    return true;
  } catch (e) { await cli.query('rollback').catch(() => {}); throw e; }
  finally { cli.release(); }
}

const camposParticipante = (r) => ({ id: r.id, display_name: r.display_name, sort_name: r.sort_name, active: r.active, is_placeholder: r.is_placeholder, compites: r.compites, created_at: r.created_at });
const camposEncuentro = (r, quienes) => ({ id: r.id, participants: quienes, photo_path: r.photo_path, thumb_path: r.thumb_path, place: r.place, occurred_at: r.occurred_at, note: r.note, status: r.status, created_at: r.created_at });
const duplicado = (e) => { if (e.code === '23505') { const err = new Error('DUPLICADO'); err.code = 'DUPLICADO'; throw err; } throw e; };

export function crearDbPostgres() {
  let listo;
  return {
    async init({ semilla, hashInicial }) {
      if (listo) return listo;
      return (listo = (async () => {
        await migrarSiHaceFalta();
        for (const parte of SQL_ESQUEMA.split(';').map((x) => x.trim()).filter(Boolean)) await sql.query(parte);
        await sql`insert into fit_settings (id, challenge_code_hash) values (true, ${hashInicial}) on conflict (id) do nothing`;
        // Versiones anteriores sembraban un «¿Nº 30?» provisional: se quita si nadie llegó a usarlo.
        await sql`delete from fit_participants p where p.is_placeholder and not exists (select 1 from fit_encounter_participants ep where ep.participant_id = p.id)`;
        for (const p of semilla.participantes) {
          await sql`insert into fit_participants (display_name, sort_name, is_placeholder, compites)
                    values (${p.display_name}, ${p.sort_name}, ${p.is_placeholder}, ${p.compites})
                    on conflict (display_name) do nothing`;
        }
      })().catch((e) => { listo = null; throw e; }));
    },
    async settings() { const { rows } = await sql`select * from fit_settings where id`; return rows[0]; },
    async estado(admin) {
      const partSQL = admin ? sql`select * from fit_participants order by created_at` : sql`select * from fit_participants where active order by created_at`;
      const encSQL = admin ? sql`select * from fit_encounters order by created_at desc` : sql`select * from fit_encounters where status = 'published' order by created_at desc`;
      const [part, enc, ep, fotos] = await Promise.all([partSQL, encSQL, sql`select * from fit_encounter_participants`, sql`select * from fit_encounter_photos`]);
      const porEnc = new Map(); for (const r of ep.rows) (porEnc.get(r.encounter_id) || porEnc.set(r.encounter_id, []).get(r.encounter_id)).push(r.participant_id);
      const idsPublicados = admin ? null : new Set(enc.rows.map((e) => e.id));
      return {
        participants: part.rows.map(camposParticipante),
        encounters: enc.rows.map((r) => camposEncuentro(r, porEnc.get(r.id) || [])),
        encounter_photos: admin ? fotos.rows : fotos.rows.filter((f) => idsPublicados.has(f.encounter_id)),
      };
    },
    async participantesActivos(ids) { const { rows } = await sql`select count(*)::int as n from fit_participants where id = any(${ids}::uuid[]) and active`; return rows[0].n; },
    async buscarEncuentroExacto(quienes) {
      const { rows } = await sql`
        select e.* from fit_encounters e
        where (select count(*) from fit_encounter_participants ep where ep.encounter_id = e.id) = ${quienes.length}
          and not exists (select 1 from fit_encounter_participants ep where ep.encounter_id = e.id and ep.participant_id != all(${quienes}::uuid[]))
        limit 1`;
      if (!rows[0]) return null;
      const { rows: ep } = await sql`select participant_id from fit_encounter_participants where encounter_id = ${rows[0].id}`;
      return camposEncuentro(rows[0], ep.map((r) => r.participant_id));
    },
    async insertarEncuentro(f) {
      const { rows } = await sql`insert into fit_encounters (photo_path, thumb_path, place, occurred_at, note, status)
        values (${f.photo_path}, ${f.thumb_path}, ${f.place}, ${f.occurred_at}, ${f.note}, ${f.status}) returning *`;
      const enc = rows[0];
      for (const pid of f.participants) await sql`insert into fit_encounter_participants (encounter_id, participant_id) values (${enc.id}, ${pid})`;
      return camposEncuentro(enc, f.participants);
    },
    async existeEncuentro(id) { const { rows } = await sql`select 1 from fit_encounters where id = ${id}`; return rows.length > 0; },
    async contarFotos(encounter_id) { const { rows } = await sql`select count(*)::int as n from fit_encounter_photos where encounter_id = ${encounter_id}`; return rows[0].n; },
    async insertarFotoExtra(f) { const { rows } = await sql`insert into fit_encounter_photos (encounter_id, photo_path, thumb_path) values (${f.encounter_id}, ${f.photo_path}, ${f.thumb_path}) returning *`; return rows[0]; },
    async insertarParticipante(f) {
      try { const { rows } = await sql`insert into fit_participants (display_name, compites) values (${f.display_name}, ${f.compites}) returning *`; return camposParticipante(rows[0]); }
      catch (e) { duplicado(e); }
    },
    async leer(tabla, id) { const { rows } = await sql.query(`select * from ${T(tabla)} where id = $1`, [id]); return rows[0] || null; },
    async actualizar(tabla, id, cambios) {
      const t = T(tabla);
      if (tabla === 'encounters' && 'participants' in cambios) {
        const { participants, ...resto } = cambios;
        await sql`delete from fit_encounter_participants where encounter_id = ${id}`;
        for (const pid of participants) await sql`insert into fit_encounter_participants (encounter_id, participant_id) values (${id}, ${pid})`;
        cambios = resto;
      }
      const claves = Object.keys(cambios);
      try {
        if (tabla === 'settings') {
          if (!claves.length) { const { rows } = await sql`select * from fit_settings where id`; return rows[0]; }
          const sets = claves.map((k, i) => `${k} = $${i + 1}`).join(', ');
          const { rows } = await sql.query(`update ${t} set ${sets} where id returning *`, claves.map((k) => cambios[k]));
          return rows[0];
        }
        let fila;
        if (!claves.length) fila = await this.leer(tabla, id);
        else {
          const sets = claves.map((k, i) => `${k} = $${i + 2}`).join(', ');
          fila = (await sql.query(`update ${t} set ${sets} where id = $1 returning *`, [id, ...claves.map((k) => cambios[k])])).rows[0];
        }
        if (!fila) return null;
        if (tabla === 'encounters') { const { rows: ep } = await sql`select participant_id from fit_encounter_participants where encounter_id = ${id}`; return camposEncuentro(fila, ep.map((r) => r.participant_id)); }
        return tabla === 'participants' ? camposParticipante(fila) : fila;
      } catch (e) { duplicado(e); }
    },
    async borrar(tabla, id) {
      try { await sql.query(`delete from ${T(tabla)} where id = $1`, [id]); }
      catch (e) { if (e.code === '23503') { const err = new Error('EN_USO'); err.code = 'EN_USO'; throw err; } throw e; }
    },
    async ponerHash(hash) { await sql`update fit_settings set challenge_code_hash = ${hash} where id`; },
  };
}
