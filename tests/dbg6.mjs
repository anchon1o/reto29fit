import { chromium, devices } from 'playwright';
const b = await chromium.launch(); const c = await b.newContext({ ...devices['iPhone 13'] }); const p = await c.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173'); await p.waitForSelector('input[name=codigo]'); await p.fill('input[name=codigo]', 'demo'); await p.click('button.cta');
await p.waitForSelector('.nombre'); await p.locator('.nombre', { hasText: /^Ari$/ }).click(); await p.waitForSelector('.prog');
await p.goto('http://localhost:5173/nuevo'); await p.waitForSelector('select[data-ch="nuevo-b"]');
await p.selectOption('select[data-ch="nuevo-b"]', { label: 'Carlos' });
const b64 = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width=3000;c.height=4000; const g=c.getContext('2d'); g.fillStyle='#552299'; g.fillRect(0,0,3000,4000); return c.toDataURL('image/jpeg',0.9).split(',')[1]; });
const fs = await import('fs'); fs.writeFileSync('/tmp/fx.jpg', Buffer.from(b64,'base64'));
await p.locator('input[type=file]:not([capture])').first().setInputFiles('/tmp/fx.jpg'); await p.waitForSelector('.foto-prev img'); await p.click('button.cta');
await p.waitForURL(/\/encuentro\//); const urlAC = p.url(); console.log('url', urlAC);
for (let i=0;i<4;i++){
  console.log('vuelta', i, 'fotos:', await p.locator('.det-foto').count());
  const btns = await p.locator('a.btn').allInnerTexts(); console.log('botones:', btns);
  await p.click('a.btn:has-text("Añadir otra foto")');
  await p.waitForSelector('select[data-ch="nuevo-b"]');
  console.log('  tras click, url:', p.url());
  await p.locator('input[type=file]:not([capture])').first().setInputFiles('/tmp/fx.jpg');
  await p.waitForSelector('.foto-prev img');
  await p.click('button.cta');
  await p.waitForURL(u => u.pathname.startsWith('/encuentro/'), {timeout:10000}).catch(e=>console.log('  timeout esperando url', p.url()));
}
console.log('final fotos:', await p.locator('.det-foto').count());
await b.close();
