// API de la página "Mi cuenta". Acción por ?accion= o body.accion
// login | sesion | datos | quitar_equipo | descargar | portal | salir
import { json, leerJson, ipDe, limitar, baseUrl, emailValido } from '../_lib/util.js';
import * as S from '../_lib/sesion.js';
import * as L from '../_lib/licencias.js';
import { enviar, correoEnlace } from '../_lib/correo.js';
import { enlaceDescarga } from '../_lib/r2.js';
import { api } from '../_lib/paddle.js';

function mismoOrigen(request) { // defensa extra contra CSRF en POST
  const o = request.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await leerJson(request) : {};
    const accion = body.accion || url.searchParams.get('accion');
    if (request.method === 'POST' && !mismoOrigen(request)) return json({ ok: false, motivo: 'origen' }, 403);

    if (accion === 'login') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!emailValido(email)) return json({ ok: false, motivo: 'correo_invalido' }, 400);
      if (await limitar(env, 'login-ip:' + ipDe(request), 20, 3600) || await limitar(env, 'login:' + email, 5, 3600)) {
        return json({ ok: false, motivo: 'demasiados_intentos' }, 429);
      }
      const lics = await L.porEmail(env, email);
      if (lics.length) { // respuesta idéntica exista o no, para no revelar quién es cliente
        const token = await S.crearEnlace(env, email);
        const c = correoEnlace(baseUrl(env, request) + '/mi-cuenta/?t=' + token);
        await enviar(env, { para: email, asunto: c.asunto, html: c.html, texto: c.texto });
      }
      return json({ ok: true });
    }

    if (accion === 'sesion') {
      if (await limitar(env, 'sesion:' + ipDe(request), 30, 600)) return json({ ok: false, motivo: 'demasiados_intentos' }, 429);
      const email = await S.canjearEnlace(env, body.token);
      if (!email) return json({ ok: false, motivo: 'enlace_invalido' });
      return json({ ok: true, email }, 200, [['Set-Cookie', S.cookieSet(await S.firmarSesion(env, email), S.DURACION_SESION)]]);
    }

    if (accion === 'salir') return json({ ok: true }, 200, [['Set-Cookie', S.cookieSet('', 0)]]);

    const email = await S.emailDeSesion(env, request);
    if (!email) return json({ ok: false, motivo: 'sin_sesion' }, 401);
    const lics = await L.porEmail(env, email);

    if (accion === 'datos') {
      return json({
        ok: true, email, licencias: lics.map((l) => L.publica(env, l)),
        version: env.AVICH_VERSION_ACTUAL || null, notas: env.AVICH_NOTAS_VERSION || '',
      });
    }

    if (accion === 'quitar_equipo') {
      const lic = lics.find((l) => l.clave === L.normalizarClave(body.clave));
      if (!lic) return json({ ok: false, motivo: 'no_encontrada' }, 404);
      lic.equipos = (lic.equipos || []).filter((e) => e.id !== String(body.equipo_id));
      await L.guardar(env, lic);
      return json({ ok: true, licencia: L.publica(env, lic) });
    }

    if (accion === 'descargar') {
      const prod = url.searchParams.get('producto') === 'sistemas' ? 'sistemas' : '3d';
      if (!lics.some((l) => L.productoDe(l) === prod && L.evaluar(env, l).valida)) return json({ ok: false, motivo: 'sin_licencia_vigente' }, 403);
      if (prod === 'sistemas') return new Response(null, { status: 302, headers: { Location: '/api/instalador', 'Cache-Control': 'no-store' } });
      const v = env.AVICH_VERSION_ACTUAL || 'ultima';
      const u = await enlaceDescarga(env, env.AVICH_ARCHIVO_R2 || 'avich_3d.rbz', `avich_3d_${v}.rbz`);
      if (!u) return json({ ok: false, motivo: 'descarga_no_configurada' }, 503);
      return new Response(null, { status: 302, headers: { Location: u, 'Cache-Control': 'no-store' } });
    }

    if (accion === 'portal') { // portal de Paddle: cambiar tarjeta, cancelar, facturas
      const lic = lics.find((l) => l.suscripcion && l.cliente);
      if (!lic) return json({ ok: false, motivo: 'sin_suscripcion' }, 404);
      const d = await api(env, 'POST', `/customers/${encodeURIComponent(lic.cliente)}/portal-sessions`, { subscription_ids: lics.filter((l) => l.suscripcion).map((l) => l.suscripcion) });
      const enlace = d && d.urls && d.urls.general && d.urls.general.overview;
      return enlace ? json({ ok: true, url: enlace }) : json({ ok: false, motivo: 'portal_no_disponible' }, 502);
    }

    return json({ ok: false, motivo: 'accion_desconocida' }, 400);
  } catch (e) {
    console.error('[cuenta] error', e);
    return json({ ok: false, motivo: 'error_interno' }, 500);
  }
}
