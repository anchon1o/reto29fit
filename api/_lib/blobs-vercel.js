// Adaptador real: Vercel Blob. NO probado contra la nube real en este entorno (sin red).
// Guardamos como photo_path la URL pública completa que devuelve Vercel Blob (es estable: mismo host
// para todos los objetos de este Blob Store), no una ruta relativa: así el cliente la usa directamente.
import { put, del, head } from '@vercel/blob';
const RUTA = /\/enc\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$/;

export function crearBlobsVercel() {
  return {
    valida: (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && x.hostname.endsWith('.public.blob.vercel-storage.com') && RUTA.test(x.pathname); } catch { return false; } },
    async put(path, buffer) { const r = await put(path, buffer, { access: 'public', addRandomSuffix: false, contentType: 'image/jpeg', cacheControlMaxAge: 31536000 }); return r.url; },
    async existente(url) { try { await head(url); return true; } catch { return false; } },
    async del(urls) { if (urls.length) await del(urls); },
  };
}
