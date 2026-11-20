// POST /api/actualizacion
//   { accion:'manifiesto', licencia, instancia, version }  → manifiesto FIRMADO de la última versión
//   { accion:'descargar',  licencia, instancia }            → URL temporal del .rbz (solo con licencia válida)
import { leerJSON, json, ip } from '../_lib/sistemas/h.js';
import { permitir } from '../_lib/sistemas/limite.js';
import { validar } from '../_lib/sistemas/licencia.js';
import * as rel from '../_lib/sistemas/release.js';
import { firmar } from '../_lib/sistemas/firma.js';
import { getStorage } from '../_lib/sistemas/almacen.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'metodo' }, 405);
  if (!permitir('upd:' + ip(request), 40, 60 * 1000)) return json({ error: 'demasiadas_solicitudes' }, 429);
  try {
    const b = await leerJSON(request);
    const lic = await validar(env, b.licencia, b.instancia);
    const m = await rel.leer(env);
    if (b.accion === 'descargar') {
      if (!m) return json({ error: 'sin_version' }, 404);
      if (!lic.ok) return json({ error: 'requiere_licencia', motivo: lic.motivo }, 403);
      return json({ url: await getStorage(env).presignGet(m.archivo.key, 300), version: m.version, sha256: m.archivo.sha256, bytes: m.archivo.bytes });
    }
    // manifiesto (público: avisa a todos; descargar exige licencia)
    const vista = m
      ? { version: m.version, notas: m.notas || '', obligatoria: !!m.obligatoria, publicado: m.publicado, bytes: m.archivo.bytes, sha256: m.archivo.sha256, incluye_dll: !!m.incluye_dll, descargable: lic.ok }
      : { version: null };
    const cuerpo = JSON.stringify(Object.assign({ generado: new Date().toISOString() }, vista));
    return json({ actualizacion: cuerpo, firma: await firmar(env, cuerpo), acceso: lic.ok ? 'licencia' : 'prueba', motivo: lic.motivo });
  } catch (e) {
    console.error('actualizacion:', e.message);
    return json({ error: 'servidor' }, 500);
  }
}
