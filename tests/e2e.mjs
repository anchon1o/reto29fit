// Prueba de flujos completos en MODO DEMO (dev_server.py) con Chromium emulando iPhone.
import { chromium, devices } from 'playwright';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url)); const shots = path.join(dir, 'capturas'); fs.mkdirSync(shots, { recursive: true });
const URL_ = process.env.URL || 'http://localhost:5173';
let fallos = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fallos++; };

async function fotoGrande(page, nombre, color) {
  const b64 = await page.evaluate(async (color) => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 4000; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 3000, 4000);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `hsl(${Math.random() * 360} 70% 60%)`; g.fillRect(Math.random() * 3000, Math.random() * 4000, 90, 90); }
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  }, color);
  const f = path.join(shots, nombre); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}

const browser = await chromium.launch();
process.on('uncaughtException', async (e) => { console.log('FALLO EN', e.message.split('\n')[0]); try { await page.screenshot({ path: path.join(shots, 'fallo.png') }); console.log(await page.locator('main').innerText()); } catch {} process.exit(2); });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errores = []; page.on('pageerror', (e) => errores.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
const txt = (s) => page.locator(s).first().innerText();
const foto = async () => page.locator('input[type=file]:not([capture])').first();
const confirmarModal = async () => { await page.waitForSelector('.modal [data-r="1"]'); await page.click('.modal [data-r="1"]'); };

console.log('1) Primera entrada');
await page.goto(URL_); await page.waitForSelector('input[name=codigo]');
await page.fill('input[name=codigo]', 'malo'); await page.click('button.cta'); await page.waitForSelector('.error');
ok(true, 'código incorrecto rechazado');
await page.fill('input[name=codigo]', 'DEMO '); await page.click('button.cta'); await page.waitForSelector('.grid-nombres');
ok((await page.locator('.nombre').count()) === 30, '30 participantes que compiten en "¿Quién eres?" (los profes no aparecen ahí)');
ok((await page.locator('.nombre.prov').count()) === 1, 'el nº30 aparece como provisional');
await page.locator('.nombre', { hasText: /^Ancho$/ }).click(); await page.waitForSelector('.prog');
ok((await txt('.prog-n')).replace(/\s+/g, '') === '0/29', 'progreso inicial 0/29');

console.log('2) Foto de GRUPO: Ancho + Serginho + Roti cubre las 3 parejas de golpe');
const f1 = await fotoGrande(page, '_foto1.jpg', '#884422');
await page.click('a.cta'); await page.waitForSelector('select[data-ch="nuevo-b"]');
ok(await page.locator('button.cta').isDisabled(), 'guardar deshabilitado sin datos');
await page.selectOption('select[data-ch="nuevo-b"]', { label: 'Serginho' });
await page.click('[data-act="nuevo-mas-tog"]'); await page.waitForSelector('.mas-lista');
await page.locator('.mas-lista .chk', { hasText: 'Roti' }).locator('input').check();
await (await foto()).setInputFiles(f1); await page.waitForSelector('.foto-prev img');
await page.fill('[data-in="nuevo-lugar"]', 'Praza da Quintana');
await page.click('button.cta'); await page.waitForURL(/\/encuentro\//);
await page.waitForSelector('.det-foto img');
ok((await txt('.det-n')).includes('Ancho') && (await txt('.det-n')).includes('Serginho') && (await txt('.det-n')).includes('Roti'), 'el detalle muestra a los 3');
const dim = await page.evaluate(async () => { const i = document.querySelector('.det-foto img'); await i.decode(); const r = await fetch(i.src); const b = await r.blob(); return { w: i.naturalWidth, h: i.naturalHeight, kb: Math.round(b.size / 1024), type: b.type }; });
ok(Math.max(dim.w, dim.h) === 1600 && dim.type === 'image/jpeg', `foto comprimida a ${dim.w}×${dim.h}, ${dim.kb} KB`);
await page.click('[data-act=atras]'); await page.waitForSelector('.prog');
ok((await txt('.prog-n')).replace(/\s+/g, '') === '2/29', 'Ancho pasa a 2/29 (Serginho Y Roti) con UNA sola foto');
await page.screenshot({ path: path.join(shots, '01_grupo.png') });
await page.goto(URL_ + '/matriz'); await page.waitForSelector('.mx');
ok((await page.locator('.c.on').count()) === 6, 'matriz: 6 casillas (3 parejas × 2) con UN solo encuentro de 3 personas');
ok((await page.locator('.c.on.grupo').count()) === 6, 'las 6 llevan la marca de "foto de grupo"');

console.log('3) Desde el otro lado: Serginho ya tiene 1/29 sin subir nada');
await page.goto(URL_ + '/quien'); await page.locator('.nombre', { hasText: /^Serginho$/ }).click(); await page.waitForSelector('.prog');
ok((await txt('.prog-n')).replace(/\s+/g, '') === '2/29', 'Serginho: 2/29 (la foto de grupo también cubre Serginho-Roti)');
await page.goto(URL_ + '/mi-reto'); await page.waitForSelector('.grid-reto');
ok((await page.locator('.tile.hecho').count()) === 2, 'Mi reto de Serginho: 2 casillas hechas (Ancho y Roti)');

console.log('4) Repetir el MISMO grupo exacto → foto extra, no duplica');
await page.goto(URL_ + '/quien'); await page.locator('.nombre', { hasText: /^Ancho$/ }).click();
await page.goto(URL_ + '/nuevo'); await page.selectOption('select[data-ch="nuevo-b"]', { label: 'Serginho' });
await page.click('[data-act="nuevo-mas-tog"]'); await page.locator('.mas-lista .chk', { hasText: 'Roti' }).locator('input').check();
await page.waitForSelector('.aviso'); ok(true, 'avisa de que ya existe ese grupo exacto');
await (await foto()).setInputFiles(f1); await page.waitForSelector('.foto-prev img'); await page.click('button.cta'); await page.waitForURL(/\/encuentro\//);
ok((await page.locator('.det-foto').count()) === 2, 'la 2ª foto se añade al MISMO encuentro (foto extra)');
await page.goto(URL_); await page.waitForSelector('.prog'); ok((await txt('.prog-n')).replace(/\s+/g, '') === '2/29', 'el progreso no cambia con la foto extra');

console.log('5) Foto con un profe: no cuenta para el reto, pero se guarda y se ve en cursiva');
await page.goto(URL_ + '/nuevo'); await page.waitForSelector('select[data-ch="nuevo-b"]');
const opts = await page.locator('select[data-ch="nuevo-b"] option').allInnerTexts();
ok(opts.some((t) => t.includes('Cou')) && opts.some((t) => t.includes('Feña')) && opts.some((t) => t.includes('Gala')), 'Cou, Feña y Gala aparecen como opción para "me encontré con"');
await page.selectOption('select[data-ch="nuevo-b"]', { label: 'Cou' });
const f2 = await fotoGrande(page, '_foto2.jpg', '#227744');
await (await foto()).setInputFiles(f2); await page.waitForSelector('.foto-prev img'); await page.click('button.cta'); await page.waitForURL(/\/encuentro\//);
const cursivaCount = await page.locator('.det-n i').count(); ok(cursivaCount >= 1, 'el nombre del profe sale en cursiva en el detalle');
await page.goto(URL_); await page.waitForSelector('.prog'); ok((await txt('.prog-n')).replace(/\s+/g, '') === '2/29', 'la foto con el profe NO suma al 29');

console.log('6) Hasta 5 fotos extra en el mismo encuentro, la 6ª no');
await page.goto(URL_ + '/quien'); await page.locator('.nombre', { hasText: /^Ari$/ }).click();
await page.goto(URL_ + '/nuevo'); await page.selectOption('select[data-ch="nuevo-b"]', { label: 'Carlos' });
const fx = await fotoGrande(page, '_fotoAC.jpg', '#552299');
await (await foto()).setInputFiles(fx); await page.waitForSelector('.foto-prev img'); await page.click('button.cta'); await page.waitForURL(/\/encuentro\//);
const urlAC = page.url();
for (let i = 0; i < 5; i++) { await page.click('[data-act="mostrar-mas-foto"]'); await (await foto()).setInputFiles(fx); await page.waitForSelector('.foto-prev img'); await page.click('[data-act="guardar-foto-extra"]'); await page.waitForFunction((n) => document.querySelectorAll('.det-foto').length === n, i + 2); }
ok((await page.locator('.det-foto').count()) === 6, '1 principal + 5 extra = 6 fotos, para que "el álbum quede bonito"');
ok((await page.locator('[data-act="mostrar-mas-foto"]').count()) === 0, 'con 5 extra ya no se ofrece añadir más');

console.log('6b) Foto extra en un encuentro de GRUPO no pierde a nadie (el bug que se corrigió)');
await page.goto(URL_ + '/quien'); await page.locator('.nombre', { hasText: /^Ancho$/ }).click(); await page.waitForSelector('.prog');
await page.goto(URL_ + '/nuevo'); await page.waitForSelector('select[data-ch="nuevo-b"]');
await page.selectOption('select[data-ch="nuevo-b"]', { label: 'Fabián' });
await page.click('[data-act="nuevo-mas-tog"]'); await page.waitForSelector('.mas-lista');
await page.locator('.mas-lista .chk', { hasText: 'Harold' }).locator('input').check();
const fg = await fotoGrande(page, '_fotoGrupo3.jpg', '#119933');
await (await foto()).setInputFiles(fg); await page.waitForSelector('.foto-prev img'); await page.click('button.cta'); await page.waitForURL(/\/encuentro\//);
const urlGrupo3 = page.url();
await page.click('[data-act="mostrar-mas-foto"]'); await (await foto()).setInputFiles(fg); await page.waitForSelector('.foto-prev img'); await page.click('[data-act="guardar-foto-extra"]');
await page.waitForSelector('.det-foto:nth-child(4)');
ok(page.url() === urlGrupo3, 'la foto extra se queda en el MISMO encuentro de 3 personas (no navega a /nuevo)');
ok((await txt('.det-n')).includes('Fabián') && (await txt('.det-n')).includes('Harold'), 'el encabezado sigue mostrando a los 3, no solo a los 2 primeros');
await page.goto(URL_ + '/matriz'); await page.waitForSelector('.mx');
ok((await page.locator('.c.on').count()) === 14, 'matriz: 14 casillas (7 parejas × 2: el trío de Ancho, el trío nuevo y Ari-Carlos) — no se ha creado ningún encuentro redundante');

console.log('7) Un visitante normal no puede administrar');
ok((await page.locator('[data-act^="adm-"]').count()) === 0, 'sin botones de edición/borrado para visitantes');

console.log('8) Admin: nombrar al nº30, quitar a alguien de una foto de grupo, borrar');
await page.goto(URL_ + '/admin'); await page.fill('input[name=password]', 'mala'); await page.click('button.cta'); await page.waitForSelector('.error');
ok(true, 'contraseña incorrecta rechazada');
await page.fill('input[name=password]', 'demo'); await page.click('button.cta'); await page.waitForSelector('.tabs');
ok((await txt('.avisos')).includes('nº30'), 'el panel avisa de que falta el nombre del nº30');
await page.screenshot({ path: path.join(shots, '02_admin.png'), fullPage: true });
await page.click('[data-t=gente]'); await page.fill('.adm-item.prov input[name=nombre]', 'NombreReal'); await page.click('.adm-item.prov button.btn'); await page.waitForFunction(() => !document.querySelector('.adm-item.prov'));
ok(true, 'placeholder nº30 renombrado desde admin');
await page.click('[data-t=enc]'); await page.locator('.adm-fila', { hasText: 'Roti' }).locator('a.btn').click(); await page.waitForSelector('.mas-lista');
ok((await page.locator('.mas-lista .chk input:checked').count()) === 3, 'editar: las 3 personas del grupo salen marcadas');
await page.locator('.mas-lista .chk', { hasText: 'Roti' }).locator('input').uncheck();
await page.click('button.cta'); await page.waitForSelector('.tabs');
await page.goto(URL_ + '/quien'); await page.locator('.nombre', { hasText: /^Roti$/ }).click(); await page.waitForSelector('.prog');
ok((await txt('.prog-n')).replace(/\s+/g, '') === '0/29', 'tras quitar a Roti de la foto, vuelve a 0/29');
page.on('dialog', (d) => d.accept());
await page.goto(urlAC); await page.waitForSelector('[data-act="adm-borrar-enc"]'); await page.click('[data-act="adm-borrar-enc"]'); await confirmarModal(); await page.waitForSelector('.prog');
ok(true, 'admin borra un encuentro con confirmación propia');

console.log('9) Anchuras 360 / 390 / 430: sin desbordes ni targets pequeños');
for (const w of [360, 390, 430]) {
  await page.setViewportSize({ width: w, height: 780 });
  for (const ruta of ['/', '/mi-reto', '/ranking', '/nuevo', '/quien', urlGrupo3.replace(URL_, '')]) {
    await page.goto(URL_ + ruta); await page.waitForSelector('main');
    const m = await page.evaluate(() => {
      const desborda = document.documentElement.scrollWidth > window.innerWidth + 1;
      const peq = [...document.querySelectorAll('a[data-link], button, select, input:not(.vh), label.btn')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.height < 43.5); }).map((el) => el.className || el.tagName);
      const f16 = [...document.querySelectorAll('input:not(.vh), select')].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length;
      return { desborda, peq, f16 };
    });
    ok(!m.desborda && !m.peq.length && !m.f16, `${w}px ${ruta}${m.desborda ? ' DESBORDA' : ''}${m.peq.length ? ' targets<44: ' + m.peq.join(',') : ''}${m.f16 ? ' inputs<16px' : ''}`);
  }
}
ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
await browser.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK'); process.exit(fallos ? 1 : 0);
