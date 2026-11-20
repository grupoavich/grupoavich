// Cliente mínimo S3/R2 con firma SigV4 (Web Crypto), sin dependencias. Sustituye a @aws-sdk.
// Soporta: URLs firmadas GET/PUT (idénticas a las del SDK) y peticiones firmadas por cabecera (GET con rango, PUT, HEAD, DELETE).
import { sha256hex, hex } from '../cripto.js';

const te = new TextEncoder();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const VACIO = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const cacheClaves = new Map();

const hmacRaw = async (kc, msg) => new Uint8Array(await crypto.subtle.sign('HMAC', kc, te.encode(msg)));
const imp = (raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

// Clave de firma derivada (se reutiliza durante el día para no repetir 4 HMAC por cada URL)
async function claveFirma(secretKey, dia, region) {
  const id = dia + '|' + region + '|' + secretKey;
  let k = cacheClaves.get(id);
  if (!k) {
    let b = await hmacRaw(await imp(te.encode('AWS4' + secretKey)), dia);
    b = await hmacRaw(await imp(b), region);
    b = await hmacRaw(await imp(b), 's3');
    b = await hmacRaw(await imp(b), 'aws4_request');
    k = await imp(b);
    if (cacheClaves.size > 8) cacheClaves.clear();
    cacheClaves.set(id, k);
  }
  return k;
}
const fechaAmz = (f) => (f || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const rutaCan = (ruta) => ruta.split('/').map(enc).join('/');

// URL firmada. Igual que el SDK de AWS v3: incluye X-Amz-Content-Sha256=UNSIGNED-PAYLOAD y x-id.
export async function presignar({ metodo = 'GET', host, ruta, region, accessKey, secretKey, expira = 300, fecha, extra }) {
  const d = fechaAmz(fecha), dia = d.slice(0, 8);
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const q = Object.assign({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${accessKey}/${alcance}`,
    'X-Amz-Date': d,
    'X-Amz-Expires': String(expira),
    'X-Amz-SignedHeaders': 'host',
    'x-id': metodo === 'PUT' ? 'PutObject' : 'GetObject',
  }, extra || {});
  const consulta = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const rc = rutaCan(ruta);
  const canonica = [metodo, rc, consulta, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aFirmar = ['AWS4-HMAC-SHA256', d, alcance, await sha256hex(canonica)].join('\n');
  const firma = hex(await hmacRaw(await claveFirma(secretKey, dia, region), aFirmar));
  return `https://${host}${rc}?${consulta}&X-Amz-Signature=${firma}`;
}

// Cabecera Authorization para una petición normal (firma host, x-amz-content-sha256 y x-amz-date).
export async function firmarCabeceras({ metodo, host, ruta, region, accessKey, secretKey, hashCuerpo, fecha }) {
  const d = fechaAmz(fecha), dia = d.slice(0, 8);
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const ph = hashCuerpo || VACIO;
  const firmadas = 'host;x-amz-content-sha256;x-amz-date';
  const canonica = [metodo, rutaCan(ruta), '', `host:${host}\nx-amz-content-sha256:${ph}\nx-amz-date:${d}\n`, firmadas, ph].join('\n');
  const aFirmar = ['AWS4-HMAC-SHA256', d, alcance, await sha256hex(canonica)].join('\n');
  const firma = hex(await hmacRaw(await claveFirma(secretKey, dia, region), aFirmar));
  return { 'x-amz-date': d, 'x-amz-content-sha256': ph, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${alcance}, SignedHeaders=${firmadas}, Signature=${firma}` };
}
