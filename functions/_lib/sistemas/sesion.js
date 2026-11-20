import { cfg } from './config.js';
import { hmacHex, sha256hex, iguales } from '../cripto.js';

const COOKIE = 'avich_admin';
const DURACION_S = 12 * 3600;
const firmar = (env, txt) => hmacHex(cfg(env).sessionSecret(), txt);

export async function passwordOk(env, p) {
  const real = cfg(env).adminPassword();
  if (!real || !cfg(env).sessionSecret()) return false;
  return iguales(await sha256hex(String(p)), await sha256hex(real));
}
export async function crearCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  const v = `${exp}.${await firmar(env, 'admin|' + exp)}`;
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_S}`;
}
export const cookieBorrar = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export async function autenticado(env, request) {
  if (!cfg(env).sessionSecret()) return false;
  const m = String(request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!m) return false;
  const [exp, firma] = m.slice(COOKIE.length + 1).split('.');
  if (!exp || !firma || Number(exp) < Date.now() / 1000) return false;
  return iguales(firma, await firmar(env, 'admin|' + exp));
}
