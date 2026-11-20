// GET /api/instalador
// Redirige (302) a una URL temporal (5 min) del .rbz de la ÚLTIMA versión publicada en /admin.
// Es público a propósito: la prueba gratuita empieza al abrir la extensión, así que quien aún no
// tiene licencia también debe poder instalarla. (Las ACTUALIZACIONES automáticas siguen pidiendo licencia.)
import { ip, texto } from '../_lib/sistemas/h.js';
import { permitir } from '../_lib/sistemas/limite.js';
import * as rel from '../_lib/sistemas/release.js';
import { getStorage } from '../_lib/sistemas/almacen.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return texto('Método no permitido', 405);
  if (!permitir('inst:' + ip(request), 30, 60 * 1000)) return texto('Demasiadas solicitudes. Intenta de nuevo en un minuto.', 429);
  try {
    const m = await rel.leer(env);
    if (!m || !m.archivo || !m.archivo.key) return texto('Todavía no hay una versión publicada para descargar.', 404);
    const url = await getStorage(env).presignGet(m.archivo.key, 300);
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('instalador:', e.message);
    return texto('No se pudo preparar la descarga. Intenta de nuevo en unos minutos.', 500);
  }
}
