// Adaptador real: Vercel Blob. NO probado contra la nube real en este entorno (sin red).
// Las fotos se guardan bajo la carpeta fit/ para no mezclarse con las de otras apps que usen el mismo
// almacén. Se guarda como photo_path la URL pública completa que devuelve Vercel Blob.
import { put, del, head } from '@vercel/blob';

// Fotos nuevas: /fit/enc/<uuid>.jpg · fotos subidas por versiones anteriores: /enc/<uuid>.jpg (siguen valiendo)
const RUTA = /^\/(fit\/)?enc\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$/;

// Token del almacén: con prefijo FIT_ si conectaste el Blob con "Custom Prefix" = FIT; si no, el normal.
export function tokenBlob(env = process.env) {
  return env.FIT_BLOB_READ_WRITE_TOKEN || env.FIT_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN || undefined;
}

export function crearBlobsVercel() {
  const token = tokenBlob();
  return {
    valida: (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && x.hostname.endsWith('.public.blob.vercel-storage.com') && RUTA.test(x.pathname); } catch { return false; } },
    async put(path, buffer) { const r = await put(path, buffer, { access: 'public', addRandomSuffix: false, contentType: 'image/jpeg', cacheControlMaxAge: 31536000, token }); return r.url; },
    async existente(url) { try { await head(url, { token }); return true; } catch { return false; } },
    async del(urls) { if (urls.length) await del(urls, { token }); },
  };
}
