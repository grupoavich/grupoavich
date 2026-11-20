import { redis } from './redis.js';

export function json(obj, codigo = 200, cabeceras) {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (cabeceras) for (const [k, v] of cabeceras) h.append(k, v);
  return new Response(JSON.stringify(obj), { status: codigo, headers: h });
}

export async function leerJson(request) {
  try { const t = await request.text(); return t ? JSON.parse(t) : {}; } catch (e) { return {}; }
}

export function ipDe(request) {
  const f = request.headers.get('x-forwarded-for');
  return request.headers.get('cf-connecting-ip') || (f ? f.split(',')[0].trim() : '') || 'desconocida';
}

// Límite simple por ventana: devuelve true si se superó.
export async function limitar(env, clave, max, segundos) {
  const k = 'rl:' + clave;
  const n = Number(await redis(env, 'INCR', k));
  if (n === 1) await redis(env, 'EXPIRE', k, segundos);
  return n > max;
}

export function baseUrl(env, request) {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export function emailValido(e) {
  return typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
