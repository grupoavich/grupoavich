// Firma RSA-SHA256 (PKCS#1 v1.5) del texto EXACTO que se manda al cliente (igual que antes, ahora con Web Crypto).
import { cfg } from './config.js';

const te = new TextEncoder();
const cacheClaves = new Map();

function derLen(n) {
  if (n < 128) return [n];
  const b = []; while (n > 0) { b.unshift(n & 255); n >>= 8; }
  return [0x80 | b.length, ...b];
}
const cat = (...as) => { const o = new Uint8Array(as.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of as) { o.set(a, p); p += a.length; } return o; };

// "BEGIN RSA PRIVATE KEY" (PKCS#1) -> PKCS#8, que es lo único que acepta Web Crypto.
function pkcs1aPkcs8(pkcs1) {
  const version = Uint8Array.from([0x02, 0x01, 0x00]);
  const alg = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const octeto = cat(Uint8Array.from([0x04, ...derLen(pkcs1.length)]), pkcs1);
  const cuerpo = cat(version, alg, octeto);
  return cat(Uint8Array.from([0x30, ...derLen(cuerpo.length)]), cuerpo);
}

async function importar(pem) {
  if (cacheClaves.has(pem)) return cacheClaves.get(pem);
  if (/ENCRYPTED/.test(pem)) throw new Error('SIGNING_PRIVATE_KEY está protegida con contraseña; usa una sin contraseña');
  const esPkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
  // Solo quedan los caracteres base64 (se ignoran comillas, saltos, espacios y \n escritos a mano).
  // Si hay cabecera y pie, se toma solo lo que está entre ellos (ignora texto sobrante antes o después).
  const bloque = pem.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----/);
  const cuerpo = bloque ? bloque[1] : pem.replace(/-----[^-]+-----/g, '');
  const b64 = cuerpo.replace(/\\n/g, '').replace(/[^A-Za-z0-9+\/]/g, '');
  let der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (esPkcs1) der = pkcs1aPkcs8(der);
  const k = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  cacheClaves.set(pem, k);
  return k;
}

export async function firmar(env, texto) {
  const pem = cfg(env).privateKey();
  if (!pem) throw new Error('SIGNING_PRIVATE_KEY no está configurada');
  const k = await importar(pem);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, te.encode(texto)));
  let s = ''; for (let i = 0; i < sig.length; i++) s += String.fromCharCode(sig[i]);
  return btoa(s);
}

// Describe la forma de la clave SIN revelarla (para el Diagnóstico).
export function formaClave(env) {
  const t = cfg(env).privateKey();
  const b = t.match(/-----BEGIN ([A-Z ]*)-----([\s\S]*?)-----END ([A-Z ]*)-----/);
  const cuerpo = (b ? b[2] : t).replace(/\\n/g, '').replace(/[^A-Za-z0-9+\/]/g, '');
  return 'largo ' + t.length + ', ' + (b ? 'cabecera "' + b[1] + '"' : 'SIN cabecera BEGIN/END') + ', base64 ' + cuerpo.length + ' (resto ' + (cuerpo.length % 4) + ')';
}
