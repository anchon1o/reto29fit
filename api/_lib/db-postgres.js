// Adaptador real de base de datos. Misma interfaz que db-memoria.js (probada de verdad en
// tests/logica.test.mjs). Usa el paquete genérico 'pg' en vez de '@vercel/postgres': Vercel Postgres
// (el producto nativo, con Neon por debajo) se DESCONTINUÓ en 2025 — ahora Storage → Create Database
// ofrece integraciones de terceros (Prisma Postgres, Neon, Supabase…), cada una con su propio nombre de
// variable de entorno. 'pg' habla el protocolo de Postgres sin más, así que funciona con cualquiera de
// ellas mientras haya una cadena de conexión en alguna de las variables que se buscan abajo.
//
// NO se ha podido probar contra una base de datos real en este entorno (sin red). Antes de confiar en
// él: desplegar, abrir la web, y revisar los logs de la función en Vercel si algo falla.
import pg from 'pg';

const { Pool } = pg;

function cadenaConexion() {
  const c = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!c) throw new Error('Falta la cadena de conexión a Postgres: define DATABASE_URL (o POSTGRES_URL) en las variables de entorno del proyecto en Vercel.');
  return c;
}

let pool;
function getPool() {
  if (!pool) {
    const connectionString = cadenaConexion();
    // La mayoría de proveedores serverless (Prisma Postgres, Neon, Supabase) exigen TLS; si la propia
    // cadena ya trae sslmode=disable, se respeta tal cual.
    const ssl = /sslmode=disable/i.test(connectionString) ? false : { rejectUnauthorized: false };
    pool = new Pool({ connectionString, ssl, max: 3 });
  }
  return pool;
}

// Pequeña plantilla con etiqueta al estilo del 'sql' de @vercel/postgres, para no tener que reescribir
// cada consulta a mano: sql`select * from x where id = ${id}` → pool.query('select * from x where id = $1', [id])
function sql(strings, ...values) {
  let text = strings[0];
  const params = [];
  values.forEach((v, i) => { params.push(v); text += `$${params.length}` + strings[i + 1]; });
  return getPool().query(text, params);
}
sql.query = (text, params) => getPool().query(text, params);

const SQL_ESQUEMA = `
create extension if not exists pgcrypto;
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique check (char_length(display_name) between 1 and 40),
  sort_name text, active boolean not null default true,
  is_placeholder boolean not null default false, compites boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  photo_path text not null, thumb_path text,
  place text check (place is null or char_length(place) <= 120),
  occurred_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'published' check (status in ('published','pending')),
  created_at timestamptz not null default now()
);
create table if not exists encounter_participants (
  encounter_id uuid not null references encounters(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete restrict,
  primary key (encounter_id, participant_id)
);
create index if not exists ix_ep_participant on encounter_participants(participant_id);
create table if not exists encounter_photos (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  photo_path text not null, thumb_path text, created_at timestamptz not null default now()
);
create table if not exists settings (
  id boolean primary key default true check (id),
  title text not null default 'RETO 29 · FIT 2026',
  challenge_code_hash text, moderation_enabled boolean not null default false
);
`;

const camposParticipante = (r) => ({ id: r.id, display_name: r.display_name, sort_name: r.sort_name, active: r.active, is_placeholder: r.is_placeholder, compites: r.compites, created_at: r.created_at });
const camposEncuentro = (r, quienes) => ({ id: r.id, participants: quienes, photo_path: r.photo_path, thumb_path: r.thumb_path, place: r.place, occurred_at: r.occurred_at, note: r.note, status: r.status, created_at: r.created_at });

export function crearDbPostgres() {
  let listo;
  return {
    async init({ semilla, hashInicial }) {
      if (listo) return listo;
      return (listo = (async () => {
        for (const parte of SQL_ESQUEMA.split(';').map((x) => x.trim()).filter(Boolean)) await sql.query(parte);
        await sql`insert into settings (id) values (true) on conflict (id) do nothing`;
        if (hashInicial) await sql`update settings set challenge_code_hash = ${hashInicial} where id and challenge_code_hash is null`;
        for (const p of semilla.participantes) {
          await sql`insert into participants (display_name, sort_name, is_placeholder, compites)
                    values (${p.display_name}, ${p.sort_name}, ${p.is_placeholder}, ${p.compites})
                    on conflict (display_name) do nothing`;
        }
      })().catch((e) => { listo = null; throw e; }));
    },
    async settings() { const { rows } = await sql`select * from settings where id`; return rows[0]; },
    async estado(admin) {
      const partSQL = admin ? sql`select * from participants order by created_at` : sql`select * from participants where active order by created_at`;
      const encSQL = admin ? sql`select * from encounters order by created_at desc` : sql`select * from encounters where status = 'published' order by created_at desc`;
      const [part, enc, ep, fotos] = await Promise.all([partSQL, encSQL, sql`select * from encounter_participants`, sql`select * from encounter_photos`]);
      const porEnc = new Map(); for (const r of ep.rows) (porEnc.get(r.encounter_id) || porEnc.set(r.encounter_id, []).get(r.encounter_id)).push(r.participant_id);
      const idsPublicados = admin ? null : new Set(enc.rows.map((e) => e.id));
      return {
        participants: part.rows.map(camposParticipante),
        encounters: enc.rows.map((r) => camposEncuentro(r, porEnc.get(r.id) || [])),
        encounter_photos: admin ? fotos.rows : fotos.rows.filter((f) => idsPublicados.has(f.encounter_id)),
      };
    },
    async participantesActivos(ids) { const { rows } = await sql`select count(*)::int as n from participants where id = any(${ids}::uuid[]) and active`; return rows[0].n; },
    async buscarEncuentroExacto(quienes) {
      // El grupo coincide si tiene el mismo tamaño y ninguno de los ids está fuera de la lista dada.
      const { rows } = await sql`
        select e.* from encounters e
        where (select count(*) from encounter_participants ep where ep.encounter_id = e.id) = ${quienes.length}
          and not exists (select 1 from encounter_participants ep where ep.encounter_id = e.id and ep.participant_id != all(${quienes}::uuid[]))
        limit 1`;
      if (!rows[0]) return null;
      const { rows: ep } = await sql`select participant_id from encounter_participants where encounter_id = ${rows[0].id}`;
      return camposEncuentro(rows[0], ep.map((r) => r.participant_id));
    },
    async insertarEncuentro(f) {
      const { rows } = await sql`insert into encounters (photo_path, thumb_path, place, occurred_at, note, status)
        values (${f.photo_path}, ${f.thumb_path}, ${f.place}, ${f.occurred_at}, ${f.note}, ${f.status}) returning *`;
      const enc = rows[0];
      for (const pid of f.participants) await sql`insert into encounter_participants (encounter_id, participant_id) values (${enc.id}, ${pid})`;
      return camposEncuentro(enc, f.participants);
    },
    async existeEncuentro(id) { const { rows } = await sql`select 1 from encounters where id = ${id}`; return rows.length > 0; },
    async contarFotos(encounter_id) { const { rows } = await sql`select count(*)::int as n from encounter_photos where encounter_id = ${encounter_id}`; return rows[0].n; },
    async insertarFotoExtra(f) { const { rows } = await sql`insert into encounter_photos (encounter_id, photo_path, thumb_path) values (${f.encounter_id}, ${f.photo_path}, ${f.thumb_path}) returning *`; return rows[0]; },
    async insertarParticipante(f) {
      try { const { rows } = await sql`insert into participants (display_name, compites) values (${f.display_name}, ${f.compites}) returning *`; return camposParticipante(rows[0]); }
      catch (e) { if (e.code === '23505') { const err = new Error('DUPLICADO'); err.code = 'DUPLICADO'; throw err; } throw e; }
    },
    async leer(tabla, id) { const { rows } = await sql.query(`select * from ${tabla} where id = $1`, [id]); return rows[0] || null; },
    async actualizar(tabla, id, cambios) {
      if (tabla === 'encounters' && 'participants' in cambios) {
        const { participants, ...resto } = cambios;
        await sql`delete from encounter_participants where encounter_id = ${id}`;
        for (const pid of participants) await sql`insert into encounter_participants (encounter_id, participant_id) values (${id}, ${pid})`;
        cambios = resto;
      }
      const claves = Object.keys(cambios); if (!claves.length && tabla !== 'encounters') return this.leer(tabla, id);
      try {
        if (tabla === 'settings') {
          if (!claves.length) { const { rows } = await sql`select * from settings where id`; return rows[0]; }
          const sets = claves.map((k, i) => `${k} = $${i + 1}`).join(', ');
          const { rows } = await sql.query(`update settings set ${sets} where id returning *`, claves.map((k) => cambios[k]));
          return rows[0];
        }
        if (!claves.length) return this.leer(tabla, id);
        const sets = claves.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const { rows } = await sql.query(`update ${tabla} set ${sets} where id = $1 returning *`, [id, ...claves.map((k) => cambios[k])]);
        if (!rows[0]) return null;
        if (tabla === 'encounters') { const { rows: ep } = await sql`select participant_id from encounter_participants where encounter_id = ${id}`; return camposEncuentro(rows[0], ep.map((r) => r.participant_id)); }
        return tabla === 'participants' ? camposParticipante(rows[0]) : rows[0];
      } catch (e) { if (e.code === '23505') { const err = new Error('DUPLICADO'); err.code = 'DUPLICADO'; throw err; } throw e; }
    },
    async borrar(tabla, id) {
      try { await sql.query(`delete from ${tabla} where id = $1`, [id]); }
      catch (e) { if (e.code === '23503') { const err = new Error('EN_USO'); err.code = 'EN_USO'; throw err; } throw e; }
    },
    async ponerHash(hash) { await sql`update settings set challenge_code_hash = ${hash} where id`; },
  };
}
