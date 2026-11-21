// Validación de licencias de AVICH Sistemas con TU base de datos (Upstash), alimentada por Paddle.
// Ya no depende de Lemon Squeezy. La extensión manda { licencia, instancia }:
//   licencia  = clave AVICH-XXXX-XXXX-XXXX-XXXX
//   instancia = id del equipo, el mismo con el que se activó en POST /api/licencia (producto:'sistemas')
import { cfg } from './config.js';
import { sha256hex, iguales } from '../cripto.js';
import * as L from '../licencias.js';

const cache = new Map();
const TTL_OK = 60 * 1000, TTL_MAL = 15 * 1000;

// Devuelve { ok, motivo, actualizacionesHasta }.
// `productos` = qué tipos de licencia sirven aquí. Por defecto solo AVICH Sistemas (actualizaciones, instalador);
// la biblioteca de texturas también acepta AVICH 3D (ver validarCliente).
export async function validar(env, clave, instancia, productos = ['sistemas']) {
  clave = L.normalizarClave(clave);
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  if (!/^AVICH(-[A-Z0-9]{4}){4}$/.test(clave)) return { ok: false, motivo: 'invalida' };
  const ck = clave + '|' + String(instancia || '') + '|' + productos.join(',');
  const c = cache.get(ck);
  if (c && c.exp > Date.now()) return c.val;
  let lic;
  try { lic = await L.obtener(env, clave); } catch (e) { console.error('licencia:', e.message); return { ok: false, motivo: 'red' }; }
  let val;
  if (!lic || !productos.includes(L.productoDe(lic))) val = { ok: false, motivo: 'invalida' };
  else {
    const ev = L.evaluar(env, lic);
    if (!ev.valida) val = { ok: false, motivo: ev.motivo };
    else if (!instancia || !(lic.equipos || []).some((e) => e.id === String(instancia))) val = { ok: false, motivo: 'equipo_no_registrado' };
    else val = { ok: true, motivo: null, actualizacionesHasta: lic.actualizaciones_hasta || null };
  }
  cache.set(ck, { val, exp: Date.now() + (val.ok ? TTL_OK : TTL_MAL) });
  if (cache.size > 2000) for (const [k, v] of cache) if (v.exp < Date.now()) cache.delete(k);
  return val;
}

async function claveBibliotecaOk(env, dada) {
  const esperada = cfg(env).claveBiblioteca();
  dada = String(dada || '');
  if (!esperada || !dada) return false;
  return iguales(await sha256hex(esperada), await sha256hex(dada));
}

// Acceso a la biblioteca de texturas: clave compartida (opcional, heredada) o una licencia válida de AVICH Sistemas o AVICH 3D.
export async function validarCliente(env, b) {
  b = b || {};
  if (await claveBibliotecaOk(env, b.clave_biblioteca)) return { ok: true, motivo: null };
  return validar(env, b.licencia, b.instancia, ['sistemas', '3d']);
}
