// Compresión en el cliente antes de subir. Sin librerías:
// <img> + canvas ya respetan la orientación EXIF en Safari ≥13.1 / Chrome ≥81 / Firefox ≥77.
import { err } from './util.js';

// La foto viaja al servidor como base64 dentro de un JSON (más simple y fiable en móvil que subidas
// multipart en dos pasos). Por eso el límite de salida es más estricto que si fuera binario directo:
// base64 pesa ~1.33×, y hay que dejar margen bajo el límite de payload de la función serverless.
const LADO_FOTO = 1600, LADO_MINI = 400, MAX_ENTRADA = 60 * 1024 * 1024, MAX_SALIDA = 1.5 * 1024 * 1024;

function cargar(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => ok({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); ko(err('FORMATO', 'Este móvil no puede leer ese formato de imagen. Prueba con otra foto o haz una captura de pantalla de ella.')); };
    img.src = url;
  });
}

function escalar(img, lado, calidad) {
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const k = Math.min(1, lado / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);      // PNG con transparencia → fondo blanco
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return new Promise((ok, ko) => {
    const fin = (b) => { c.width = c.height = 0; b ? ok(b) : ko(err('CANVAS', 'No se pudo procesar la foto.')); }; // libera memoria en iOS
    if (c.toBlob) c.toBlob(fin, 'image/jpeg', calidad);
    else fetch(c.toDataURL('image/jpeg', calidad)).then((r) => r.blob()).then(fin, ko);
  });
}

export async function prepararFoto(file) {
  if (!file) throw err('SIN_FOTO', 'Elige una foto.');
  const pareceImagen = (file.type || '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name || '');
  if (!pareceImagen) throw err('FORMATO', 'Eso no es una imagen.');
  if (file.size > MAX_ENTRADA) throw err('TAMANO', 'La imagen es demasiado grande.');
  const { img, url } = await cargar(file);
  try {
    if (!img.naturalWidth) throw err('FORMATO', 'No se pudo leer la imagen.');
    let photo = await escalar(img, LADO_FOTO, 0.82);
    if (photo.size > MAX_SALIDA) photo = await escalar(img, 1280, 0.68);
    if (photo.size > MAX_SALIDA) photo = await escalar(img, 1000, 0.6);      // foto muy detallada (mucho ruido): último intento
    const thumb = await escalar(img, LADO_MINI, 0.72);
    return { photo, thumb, preview: URL.createObjectURL(thumb) };
  } finally { URL.revokeObjectURL(url); }
}
