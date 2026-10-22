'use strict';
// POST /api/actualizacion
//   { accion:'manifiesto', licencia, instancia, version }  → manifiesto FIRMADO de la última versión
//   { accion:'descargar',  licencia, instancia }            → URL temporal del .rbz (solo con licencia válida)
const { leerJSON, json, ip } = require('../lib/http');
const { permitir } = require('../lib/limite');
const { validar } = require('../lib/licencia');
const rel = require('../lib/release');
const { firmar } = require('../lib/firma');
const { getStorage } = require('../lib/storage');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  if (!permitir('upd:' + ip(req), 40, 60 * 1000)) return json(res, 429, { error: 'demasiadas_solicitudes' });
  try {
    const b = await leerJSON(req);
    const lic = await validar(b.licencia, b.instancia);
    const m = await rel.leer();
    if (b.accion === 'descargar') {
      if (!m) return json(res, 404, { error: 'sin_version' });
      if (!lic.ok) return json(res, 403, { error: 'requiere_licencia', motivo: lic.motivo });
      return json(res, 200, { url: await getStorage().presignGet(m.archivo.key, 300), version: m.version, sha256: m.archivo.sha256, bytes: m.archivo.bytes });
    }
    // manifiesto (público: avisa a todos; descargar exige licencia)
    const vista = m
      ? { version: m.version, notas: m.notas || '', obligatoria: !!m.obligatoria, publicado: m.publicado, bytes: m.archivo.bytes, sha256: m.archivo.sha256, incluye_dll: !!m.incluye_dll, descargable: lic.ok }
      : { version: null };
    const cuerpo = JSON.stringify(Object.assign({ generado: new Date().toISOString() }, vista));
    return json(res, 200, { actualizacion: cuerpo, firma: firmar(cuerpo), acceso: lic.ok ? 'licencia' : 'prueba', motivo: lic.motivo });
  } catch (e) {
    console.error('actualizacion:', e.message);
    return json(res, 500, { error: 'servidor' });
  }
};
