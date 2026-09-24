# RETO 29 · FIT 2026

Web móvil compartida para el reto fotográfico: 30 personas, 29 encuentros cada una, 435 parejas únicas —
más Cou, Feña y Gala (profes), que salen en las fotos pero no compiten. Sin cuentas para el alumnado,
fotos y datos en Vercel (gratis), administración protegida por contraseña.

## Probar sin desplegar nada
`dist/reto29-demo.html` es **la web entera en un solo archivo**, en modo demo (código `demo`, admin con
contraseña `demo`, botón «Rellenar con ejemplos»). Se abre con doble clic o en cualquier vista previa.
Es el mismo código que el despliegue real; solo cambia que los datos viven en el dispositivo. Se
regenera con `python3 tools/bundle.py`.

## Cómo funciona una foto ahora: GRUPOS, no solo parejas
Una foto puede llevar a **2 o más personas**. Si subes una foto de Ancho + Serginho + Roti, esa única
foto cubre **las 3 parejas a la vez** (Ancho-Serginho, Ancho-Roti, Serginho-Roti): a los tres les suma en
su contador, aunque solo haya un registro. El formulario, por rapidez, sigue pidiendo primero "Soy" +
"Me encontré con" (el caso normal, 2 personas); si la foto es de grupo, hay un enlace **"+ ¿Salió alguien
más?"** que despliega una lista de casillas para añadir al resto sin ralentizar el caso simple.

Si repites exactamente el mismo grupo de personas, no se duplica: se ofrece añadirla como **foto extra**
al mismo encuentro (hasta 5 por encuentro), solo para que el álbum quede bonito — no cambia el progreso
de nadie.

**Cou, Feña y Gala** son participantes como los demás (aparecen en el selector "Me encontré con" y en la
matriz de administración), pero llevan `compites: false`: no cuentan para el 29/29 de nadie, no salen en
el ranking ni en "¿Quién eres?", y su nombre se muestra siempre **en cursiva**.

## Arquitectura (todo en Vercel, gratis)
- **Frontend**: HTML + CSS + módulos ES nativos, sin build. `js/main.js` (rutas y vistas públicas),
  `js/admin.js` (panel), `js/store.js` (todos los cálculos: progreso, ranking, matriz — nada se guarda
  precalculado), `js/backend-vercel.js` (cliente real) / `js/backend-demo.js` (modo demo, un doble con la
  misma interfaz).
- **Backend**: una única función serverless, `api/reto29.js`, que recibe `{fn, args}` y delega en
  `api/_lib/logica.js` — la lógica de negocio, sin nada de Vercel dentro (recibe `db` y `blobs` como
  parámetros). Esto permite probarla de verdad sin red: `tests/logica.test.mjs` la ejecuta contra
  `api/_lib/db-memoria.js`, un doble en memoria con la MISMA interfaz que el adaptador real.
- **Datos**: Vercel Postgres (Neon), adaptador en `api/_lib/db-postgres.js`.
- **Fotos**: Vercel Blob, adaptador en `api/_lib/blobs-vercel.js`. Se comprimen en el móvil antes de subir
  (1600 px, ~300 KB) y viajan como base64 dentro del JSON — más simple y fiable en móvil que un flujo de
  subida en dos pasos; por eso el límite de compresión es algo más estricto (1,5 MB) que si fuera binario
  directo.
- **Administración**: sin tabla de usuarios. Una contraseña (`ADMIN_PASSWORD`) y un token firmado
  (HMAC-SHA256) con 12 h de caducidad, guardado en `sessionStorage`. Los anónimos no tienen ningún
  permiso especial: todo pasa por `logica.js`, que valida el código del reto en cada alta y exige el
  token en cada acción de admin.

## Puesta en marcha (~10 min)
1. En [vercel.com](https://vercel.com), crea un proyecto a partir de este repositorio.
2. **Storage → Create → Postgres** (Neon) y **Storage → Create → Blob**: conéctalos al proyecto. Vercel
   añade solas las variables `POSTGRES_URL` y `BLOB_READ_WRITE_TOKEN`.
3. **Settings → Environment Variables**, añade:
   - `ADMIN_PASSWORD`: la contraseña de administración (mínimo 8 caracteres).
   - `CODIGO_RETO`: el código que se compartirá por WhatsApp (opcional; sin él, entrada libre).
4. Despliega. En el primer `get_state` la función crea las tablas y siembra los 29 + «¿Nº 30?» + Cou,
   Feña y Gala automáticamente (ver `SEMILLA` en `api/_lib/logica.js`).
5. Enlace para compartir: `https://TU-DOMINIO/?c=TU-CODIGO` (entra sin teclear nada). Desde
   `/admin → Ajustes` se puede cambiar el código más adelante.
6. Cuando se sepa el nombre del nº30: `/admin → Participantes` → la ficha «Provisional» → nombre → Guardar.

`config.js` solo se usa para el **modo demo** (`MODO: "demo"`). Para el despliegue real, bórralo o pon
`MODO: "real"`: el frontend habla directamente con `/api/reto29` en el mismo dominio.

## Qué se ha probado y qué no
Tres baterías, las tres en verde:
1. **`node tests/logica.test.mjs`** — prueba `api/_lib/logica.js` **de verdad** (no un simulacro del
   propio código) contra `db-memoria.js`: fotos de grupo cubriendo todas las parejas a la vez, no
   duplicar el mismo grupo, hasta 5 fotos extra y la 6ª rechazada, login/token/permisos de admin,
   validaciones (participante inválido, JPEG falso, etc).
2. **`tests/e2e.mjs`** (Playwright, Chromium emulando iPhone, modo demo vía `dev_server.py`) — el flujo
   completo en el navegador: foto de 3 personas, verlo desde cualquiera de los tres, matriz con la marca
   de "foto de grupo", profes en cursiva y sin sumar al 29, admin quitando a alguien de una foto de grupo,
   anchuras 360/390/430 sin desbordes ni objetivos táctiles pequeños.
3. **`tests/bundle.mjs`** — el HTML único (`dist/reto29-demo.html`) dentro de un iframe aislado con
   `localStorage` bloqueado (como una vista previa incrustada), para comprobar que no se rompe sin
   almacenamiento persistente.

Ejecutar todo: `tests/run.sh` (arranca `dev_server.py`, corre `e2e.mjs`, para el servidor).

**No probado, porque este entorno no tiene red**: `db-postgres.js` y `blobs-vercel.js` contra un Vercel
real. Están escritos siguiendo la interfaz que `logica.js` espera (la misma que `db-memoria.js`, ya
probada), pero antes de confiar en ellos del todo:
1. Desplegar y abrir la web: el primer `get_state` debe crear las tablas solo (revisar logs de la función
   en Vercel si no aparecen los 33 participantes).
2. Añadir un encuentro de 2 y otro de 3 personas con fotos reales desde un iPhone (cámara y galería).
3. Repetir el mismo grupo → debe ofrecer foto extra, no duplicar.
4. `/admin` con la contraseña, editar y borrar un encuentro de prueba.
5. Revisar en el dashboard de Vercel Blob que las fotos de prueba se han limpiado tras borrar.

## Estructura
```
index.html  config.js (solo modo demo)  vercel.json
css/app.css
js/main.js            router + vistas públicas + alta de encuentros
js/admin.js           panel /admin
js/store.js           estado y cálculos derivados (progreso, ranking, parejas, a partir de grupos)
js/backend-vercel.js  cliente real → /api/reto29
js/backend-demo.js    mismo interfaz en localStorage (modo demo)
js/image.js  js/ui.js  js/util.js
api/reto29.js               única función serverless
api/_lib/logica.js          lógica de negocio (sin nada de Vercel dentro)
api/_lib/db-postgres.js     adaptador real (Neon)      api/_lib/blobs-vercel.js   adaptador real (Blob)
api/_lib/db-memoria.js      doble en memoria, para pruebas
tests/logica.test.mjs  e2e.mjs  bundle.mjs  run.sh
tools/bundle.py → dist/reto29-demo.html
```
