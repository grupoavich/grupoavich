// Utilidades de criptografía con Web Crypto (disponible en Cloudflare Workers/Pages y en Node 18+).
const te = new TextEncoder();
const bytes = (x) => (typeof x === 'string' ? te.encode(x) : x);

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function b64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64url(str) {
  const b = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function sha256hex(txt) { return hex(await crypto.subtle.digest('SHA-256', bytes(txt))); }

export async function hmac(clave, msg) {
  const k = await crypto.subtle.importKey('raw', bytes(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, bytes(msg)));
}
export async function hmacHex(clave, msg) { return hex(await hmac(clave, msg)); }
export async function hmacB64url(clave, msg) { return b64url(await hmac(clave, msg)); }

// Comparación en tiempo constante de dos cadenas.
export function iguales(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
