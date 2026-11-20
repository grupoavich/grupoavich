import { redis } from './redis.js';
import { b64url, deB64url, hmacB64url, sha256hex, aleatorio, iguales } from './cripto.js';

const COOKIE = 'avich_sesion';
export const DURACION_SESION = 30 * 86400; // segundos
const DURACION_ENLACE = 15 * 60;

function secreto(env) {
  const s = env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Falta SESSION_SECRET (mínimo 16 caracteres)');
  return s;
}

export async function firmarSesion(env, email) {
  const cuerpo = b64url(new TextEncoder().encode(JSON.stringify({ e: email.toLowerCase(), x: Math.floor(Date.now() / 1000) + DURACION_SESION })));
  return cuerpo + '.' + await hmacB64url(secreto(env), cuerpo);
}

export async function emailDeSesion(env, request) {
  const c = (request.headers.get('cookie') || '').split(/;\s*/).find((p) => p.startsWith(COOKIE + '='));
  if (!c) return null;
  const [cuerpo, firma] = c.slice(COOKIE.length + 1).split('.');
  if (!cuerpo || !firma) return null;
  if (!iguales(firma, await hmacB64url(secreto(env), cuerpo))) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(deB64url(cuerpo)));
    return d.x > Math.floor(Date.now() / 1000) ? d.e : null;
  } catch (e) { return null; }
}

export const cookieSet = (valor, segundos) => `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;

// Enlace mágico: token aleatorio, guardado como hash, de un solo uso.
export async function crearEnlace(env, email) {
  const token = b64url(aleatorio(32));
  await redis(env, 'SET', 'ml:' + await sha256hex(token), email.toLowerCase(), 'EX', DURACION_ENLACE);
  return token;
}

export async function canjearEnlace(env, token) {
  const h = await sha256hex(String(token || ''));
  const email = await redis(env, 'GET', 'ml:' + h);
  if (!email) return null;
  await redis(env, 'DEL', 'ml:' + h);
  return email;
}
