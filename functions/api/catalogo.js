// POST /api/catalogo   { licencia, instancia, version }
// Devuelve el catálogo FIRMADO. Con licencia válida: todo. Sin licencia (prueba): lo gratis y lo demás bloqueado.
import { leerJSON, json, ip } from '../_lib/sistemas/h.js';
import { permitir } from '../_lib/sistemas/limite.js';
import { validarCliente } from '../_lib/sistemas/licencia.js';
import { leer, vistaPara } from '../_lib/sistemas/catalogo.js';
import { firmar } from '../_lib/sistemas/firma.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'metodo' }, 405);
  if (!permitir('cat:' + ip(request), 60, 60 * 1000)) return json({ error: 'demasiadas_solicitudes' }, 429);
  try {
    const b = await leerJSON(request);
    const lic = await validarCliente(env, b);
    const acceso = lic.ok ? 'licencia' : 'prueba';
    const cuerpo = JSON.stringify(vistaPara(env, await leer(env), acceso));
    return json({ catalogo: cuerpo, firma: await firmar(env, cuerpo), acceso, motivo: lic.motivo });
  } catch (e) {
    console.error('catalogo:', e.message);
    return json({ error: 'servidor' }, 500);
  }
}
