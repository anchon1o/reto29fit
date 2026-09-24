// Crea node_modules/pg (un doble mínimo) para poder ejecutar tests/db-postgres.test.mjs sin el
// paquete 'pg' real ni una base de datos. En un entorno con `npm install` normal esto no hace falta:
// el 'pg' real ya está en node_modules. Uso: node tests/instalar-stub-pg.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(raiz, 'node_modules', 'pg');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pg', version: '0.0.0-stub', main: 'index.js', type: 'commonjs' }, null, 2));
fs.copyFileSync(path.join(raiz, 'api/_lib/_stubs/pg-stub.cjs'), path.join(dir, 'index.js'));
console.log('node_modules/pg (doble) instalado.');
