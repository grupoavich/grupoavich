import { redis } from './redis.js';
import { aleatorio } from './cripto.js';

export const DIA = 86400000;

// Planes: clave interna -> límite de equipos. Los price_id de Paddle vienen de variables de entorno.
export const PLANES = {
  personal_mensual:    { plan: 'Personal',    periodo: 'mensual', maxEquipos: 1, env: 'PADDLE_PRICE_PERSONAL_MENSUAL' },
  personal_anual:      { plan: 'Personal',    periodo: 'anual',   maxEquipos: 1, env: 'PADDLE_PRICE_PERSONAL_ANUAL' },
  empresarial_mensual: { plan: 'Empresarial', periodo: 'mensual', maxEquipos: 5, env: 'PADDLE_PRICE_EMPRESARIAL_MENSUAL' },
  empresarial_anual:   { plan: 'Empresarial', periodo: 'anual',   maxEquipos: 6, env: 'PADDLE_PRICE_EMPRESARIAL_ANUAL' },
};

export function planPorPrecio(env, priceId) {
  for (const k of Object.keys(PLANES)) {
    if (env[PLANES[k].env] && env[PLANES[k].env] === priceId) return Object.assign({ id: k }, PLANES[k]);
  }
  return null;
}

// AVICH-XXXX-XXXX-XXXX-XXXX (sin caracteres confusos; 32 símbolos => sin sesgo con bytes)
export function nuevaClave() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = aleatorio(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += abc[b[i] % abc.length];
  return 'AVICH-' + s.match(/.{4}/g).join('-');
}

export const normalizarClave = (c) => String(c || '').trim().toUpperCase();

export async function obtener(env, clave) {
  const v = await redis(env, 'GET', 'lic:' + normalizarClave(clave));
  return v ? JSON.parse(v) : null;
}

export async function guardar(env, lic) {
  await redis(env, 'SET', 'lic:' + lic.clave, JSON.stringify(lic));
  await redis(env, 'SADD', 'email:' + lic.email.toLowerCase(), lic.clave);
  if (lic.suscripcion) await redis(env, 'SET', 'sub:' + lic.suscripcion, lic.clave);
}

export async function porSuscripcion(env, subId) {
  const c = await redis(env, 'GET', 'sub:' + subId);
  return c ? obtener(env, c) : null;
}

export async function porEmail(env, email) {
  const claves = (await redis(env, 'SMEMBERS', 'email:' + String(email).toLowerCase())) || [];
  const lics = [];
  for (const c of claves) { const l = await obtener(env, c); if (l) lics.push(l); }
  return lics;
}

// ¿Puede usarse ahora? Devuelve { valida, motivo }.
export function evaluar(env, lic, ahora) {
  ahora = ahora || Date.now();
  const gracia = Number(env.GRACIA_PAGO_DIAS || 5); // días extra si el cobro se retrasa
  if (!lic) return { valida: false, motivo: 'clave_invalida' };
  if (lic.estado === 'revocada') return { valida: false, motivo: 'revocada' };
  if (lic.estado === 'pausada') return { valida: false, motivo: 'pausada' };
  const vence = Number(lic.expira || 0);
  if (lic.estado === 'cancelada') {
    return ahora < vence ? { valida: true, motivo: 'cancelada_vigente' } : { valida: false, motivo: 'vencida' };
  }
  if (ahora < vence + gracia * DIA) return { valida: true, motivo: lic.estado === 'pago_pendiente' ? 'pago_pendiente' : 'ok' };
  return { valida: false, motivo: 'vencida' };
}

// Datos seguros para mostrar al usuario.
export function publica(env, lic) {
  const ev = evaluar(env, lic);
  return {
    clave: lic.clave, plan: lic.plan, periodo: lic.periodo, maxEquipos: lic.maxEquipos,
    estado: lic.estado, vigente: ev.valida, motivo: ev.motivo, expira: lic.expira,
    equipos: (lic.equipos || []).map((e) => ({ id: e.id, nombre: e.nombre, desde: e.desde })),
    gestionable: !!lic.suscripcion,
  };
}
