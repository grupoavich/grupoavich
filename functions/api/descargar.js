// POST /api/descargar { licencia, instancia, id, archivo }  ó  { ..., ids:[...], archivo:'miniatura' }
// Devuelve URLs temporales (5 min) para bajar directo de R2. Lo bloqueado exige licencia válida.
import { leerJSON, json, ip } from '../_lib/sistemas/h.js';
import { permitir } from '../_lib/sistemas/limite.js';
import { validarCliente } from '../_lib/sistemas/licencia.js';
import { leer, idValido, ARCHIVOS } from '../_lib/sistemas/catalogo.js';
import { getStorage } from '../_lib/sistemas/almacen.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'metodo' }, 405);
  if (!permitir('dl:' + ip(request), 120, 60 * 1000)) return json({ error: 'demasiadas_solicitudes' }, 429);
  try {
    const b = await leerJSON(request);
    const archivo = String(b.archivo || 'principal');
    if (!ARCHIVOS.includes(archivo)) return json({ error: 'archivo' }, 400);
    const ids = Array.isArray(b.ids) ? b.ids.slice(0, 300) : [b.id];
    if (!ids.length || !ids.every(idValido)) return json({ error: 'id' }, 400);

    const cat = await leer(env);
    const st = getStorage(env);
    let lic = null;                                    // se valida solo si hace falta
    const out = {};
    for (const id of ids) {
      const it = cat.items.find((x) => x.id === id);
      const f = it && it.archivos && it.archivos[archivo];
      if (!it || !f) { out[id] = { error: 'no_existe' }; continue; }
      if (archivo === 'principal' && it.acceso === 'licencia') {
        if (!lic) lic = await validarCliente(env, b);
        if (!lic.ok) { out[id] = { error: 'requiere_licencia', motivo: lic.motivo }; continue; }
      }
      out[id] = { url: await st.presignGet(f.key, 300), sha256: f.sha256, bytes: f.bytes, nombre: f.nombre };
    }
    if (b.id && !b.ids) {
      const r = out[b.id];
      return json(r, r && r.error ? (r.error === 'requiere_licencia' ? 403 : 404) : 200);
    }
    return json({ resultados: out });
  } catch (e) {
    console.error('descargar:', e.message);
    return json({ error: 'servidor' }, 500);
  }
}
