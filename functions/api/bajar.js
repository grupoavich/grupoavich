// GET /api/bajar?clave=AVICH-XXXX-XXXX-XXXX-XXXX
// Enlace de descarga para pasar a un cliente (por WhatsApp o correo): con una clave vigente redirige (302) a una URL temporal
// del .rbz de su producto. Sirve cuando no hay Resend / "Mi cuenta" por correo. La clave es la credencial.
import { ipDe, limitar } from '../_lib/util.js';
import * as L from '../_lib/licencias.js';
import * as R3 from '../_lib/release3d.js';
import { enlaceDescarga } from '../_lib/r2.js';

const texto = (t, c) => new Response(t, { status: c, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return texto('Método no permitido', 405);
  try {
    if (await limitar(env, 'bajar:' + ipDe(request), 20, 60)) return texto('Demasiadas solicitudes. Intenta de nuevo en un minuto.', 429);
    const clave = new URL(request.url).searchParams.get('clave');
    const lic = clave ? await L.obtener(env, clave) : null;
    const ev = L.evaluar(env, lic);
    if (!lic || !ev.valida) return texto('La clave no es válida o ya no está vigente. Escríbenos por WhatsApp.', 403);
    if (L.productoDe(lic) === 'sistemas') return new Response(null, { status: 302, headers: { Location: '/api/instalador', 'Cache-Control': 'no-store' } });
    const v3 = await R3.actual(env);
    const u = await enlaceDescarga(env, v3.objeto, `avich_3d_${v3.version || 'ultima'}.rbz`);
    if (!u) return texto('La descarga todavía no está configurada.', 503);
    return new Response(null, { status: 302, headers: { Location: u, 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('bajar:', e.message);
    return texto('No se pudo preparar la descarga. Intenta de nuevo en unos minutos.', 500);
  }
}
