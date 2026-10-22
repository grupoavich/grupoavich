'use strict';
// POST /api/descargar { licencia, instancia, id, archivo }  ó  { ..., ids:[...], archivo:'miniatura' }
// Devuelve URLs temporales (5 min) para bajar directo de R2. Lo bloqueado exige licencia válida.
const { leerJSON, json, ip } = require('../lib/http');
const { permitir } = require('../lib/limite');
const { validar } = require('../lib/licencia');
const { leer, idValido, ARCHIVOS } = require('../lib/catalogo');
const { getStorage } = require('../lib/storage');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  if (!permitir('dl:' + ip(req), 120, 60 * 1000)) return json(res, 429, { error: 'demasiadas_solicitudes' });
  try {
    const b = await leerJSON(req);
    const archivo = String(b.archivo || 'principal');
    if (!ARCHIVOS.includes(archivo)) return json(res, 400, { error: 'archivo' });
    const ids = Array.isArray(b.ids) ? b.ids.slice(0, 300) : [b.id];
    if (!ids.length || !ids.every(idValido)) return json(res, 400, { error: 'id' });

    const cat = await leer();
    const st = getStorage();
    let lic = null;                                    // se valida solo si hace falta
    const out = {};
    for (const id of ids) {
      const it = cat.items.find((x) => x.id === id);
      const f = it && it.archivos && it.archivos[archivo];
      if (!it || !f) { out[id] = { error: 'no_existe' }; continue; }
      if (archivo === 'principal' && it.acceso === 'licencia') {
        if (!lic) lic = await validar(b.licencia, b.instancia);
        if (!lic.ok) { out[id] = { error: 'requiere_licencia', motivo: lic.motivo }; continue; }
      }
      out[id] = { url: await st.presignGet(f.key, 300), sha256: f.sha256, bytes: f.bytes, nombre: f.nombre };
    }
    if (b.id && !b.ids) {
      const r = out[b.id];
      return json(res, r && r.error ? (r.error === 'requiere_licencia' ? 403 : 404) : 200, r);
    }
    return json(res, 200, { resultados: out });
  } catch (e) {
    console.error('descargar:', e.message);
    return json(res, 500, { error: 'servidor' });
  }
};
