import { sha256hex, hmac, hex } from './cripto.js';

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// URL firmada (SigV4) de descarga para Cloudflare R2 / S3. Sin dependencias.
export async function urlFirmada({ host, ruta, region, accessKey, secretKey, expira, fecha, extra }) {
  const d = (fecha || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dia = d.slice(0, 8);
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const q = Object.assign({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${alcance}`,
    'X-Amz-Date': d,
    'X-Amz-Expires': String(expira || 600),
    'X-Amz-SignedHeaders': 'host',
  }, extra || {});
  const consulta = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const rutaCanonica = ruta.split('/').map(enc).join('/');
  const canonica = ['GET', rutaCanonica, consulta, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aFirmar = ['AWS4-HMAC-SHA256', d, alcance, await sha256hex(canonica)].join('\n');
  let k = await hmac('AWS4' + secretKey, dia);
  k = await hmac(k, region); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  const firma = hex(await hmac(k, aFirmar));
  return `https://${host}${rutaCanonica}?${consulta}&X-Amz-Signature=${firma}`;
}

// Enlace de descarga del archivo configurado en R2.
export async function enlaceDescarga(env, objeto, nombreArchivo) {
  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  return urlFirmada({
    host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    ruta: `/${env.R2_BUCKET}/${objeto}`,
    region: 'auto',
    accessKey: env.R2_ACCESS_KEY_ID,
    secretKey: env.R2_SECRET_ACCESS_KEY,
    expira: 600,
    extra: nombreArchivo ? { 'response-content-disposition': `attachment; filename="${nombreArchivo}"` } : {},
  });
}
