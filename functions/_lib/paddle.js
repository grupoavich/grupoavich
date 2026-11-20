import { hmacHex, iguales } from './cripto.js';

function apiBase(env) {
  if (env.PADDLE_API_BASE) return env.PADDLE_API_BASE;
  return env.PADDLE_ENV === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}

export async function api(env, metodo, ruta, cuerpo) {
  const r = await fetch(apiBase(env) + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + env.PADDLE_API_KEY, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Paddle ' + r.status + ': ' + JSON.stringify(j.error || j));
  return j.data;
}

// Cabecera: Paddle-Signature: ts=1671552777;h1=<hex>   (h1 = HMAC-SHA256(secreto, `${ts}:${cuerpo}`))
export async function verificarFirma(cabecera, cuerpoCrudo, secreto, toleranciaSeg) {
  if (!cabecera || !secreto) return false;
  const partes = {};
  String(cabecera).split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) partes[p.slice(0, i)] = p.slice(i + 1); });
  if (!partes.ts || !partes.h1) return false;
  const edad = Math.abs(Date.now() / 1000 - Number(partes.ts));
  if (!(edad <= (toleranciaSeg || 300))) return false;
  const esperado = await hmacHex(secreto, `${partes.ts}:${cuerpoCrudo}`);
  return iguales(partes.h1, esperado);
}

export async function emailDeCliente(env, customerId) {
  const c = await api(env, 'GET', '/customers/' + encodeURIComponent(customerId));
  return c.email;
}
