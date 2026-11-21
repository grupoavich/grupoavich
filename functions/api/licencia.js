// API que usa el plugin de SketchUp. POST /api/licencia  { accion, clave, equipo_id, equipo_nombre, version }
// acciones: activar | validar | desactivar | version
import { json, leerJson, ipDe, limitar } from '../_lib/util.js';
import * as L from '../_lib/licencias.js';
import { enlaceDescarga } from '../_lib/r2.js';

function cmpVersion(a, b) { // >0 si a > b
  const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ ok: false, motivo: 'metodo_no_permitido' }, 405);
  try {
    if (await limitar(env, 'lic:' + ipDe(request), 120, 600)) return json({ ok: false, motivo: 'demasiados_intentos' }, 429);
    const b = await leerJson(request);
    const clave = L.normalizarClave(b.clave);
    const equipoId = String(b.equipo_id || '');
    if (!/^AVICH(-[A-Z0-9]{4}){4}$/.test(clave)) return json({ ok: false, motivo: 'clave_invalida' });
    if (!/^[A-Za-z0-9-]{8,64}$/.test(equipoId)) return json({ ok: false, motivo: 'equipo_invalido' }, 400);

    const lic = await L.obtener(env, clave);
    const ev = L.evaluar(env, lic);
    if (!ev.valida) return json({ ok: false, motivo: ev.motivo });
    // Cada clave sirve solo para su producto. Si no se indica 'producto', se asume AVICH 3D (compatibilidad).
    const producto = L.productoDe(lic);
    if (String(b.producto || '3d') !== producto) return json({ ok: false, motivo: 'clave_de_otro_producto', producto });
    lic.equipos = lic.equipos || [];
    const i = lic.equipos.findIndex((e) => e.id === equipoId);
    const resumen = { producto, plan: lic.plan, periodo: lic.periodo, expira: lic.expira, max_equipos: lic.maxEquipos };

    if (b.accion === 'activar') {
      const nombre = String(b.equipo_nombre || 'Equipo').slice(0, 60);
      if (i >= 0) { lic.equipos[i].nombre = nombre; }
      else {
        if (lic.equipos.length >= lic.maxEquipos) {
          return json({ ok: false, motivo: 'limite_equipos', max_equipos: lic.maxEquipos, equipos: lic.equipos.map((e) => e.nombre) });
        }
        lic.equipos.push({ id: equipoId, nombre, desde: Date.now() });
      }
      await L.guardar(env, lic);
      return json(Object.assign({ ok: true, usados: lic.equipos.length }, resumen));
    }
    if (b.accion === 'desactivar') {
      if (i >= 0) { lic.equipos.splice(i, 1); await L.guardar(env, lic); }
      return json({ ok: true, usados: lic.equipos.length });
    }
    if (i < 0) return json({ ok: false, motivo: 'equipo_no_registrado' });
    if (b.accion === 'validar') return json(Object.assign({ ok: true, usados: lic.equipos.length, aviso: ev.motivo }, resumen));
    if (b.accion === 'version') {
      if (producto !== '3d') return json({ ok: false, motivo: 'usa_api_actualizacion' });
      const actual = env.AVICH_VERSION_ACTUAL || '';
      const hay = !!actual && cmpVersion(actual, b.version) > 0;
      const url = hay ? await enlaceDescarga(env, env.AVICH_ARCHIVO_R2 || 'avich_3d.rbz', `avich_3d_${actual}.rbz`) : null;
      return json({ ok: true, hay_nueva: hay && !!url, version: actual, notas: env.AVICH_NOTAS_VERSION || '', url });
    }
    return json({ ok: false, motivo: 'accion_desconocida' }, 400);
  } catch (e) {
    console.error('[licencia] error', e);
    return json({ ok: false, motivo: 'error_interno' }, 500);
  }
}
