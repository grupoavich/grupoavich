'use strict';
// Cloudflare R2 (compatible con S3). Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function crear(env) {
  const bucket = env.R2_BUCKET;
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !bucket) {
    throw new Error('Faltan variables de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)');
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // Sin esto las versiones nuevas del SDK añaden un checksum a las URLs firmadas que R2/navegador rechazan.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const noExiste = (e) => e && (e.name === 'NoSuchKey' || e.name === 'NotFound' || (e.$metadata && e.$metadata.httpStatusCode === 404));
  return {
    async get(key) {
      try { const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return Buffer.from(await r.Body.transformToByteArray()); }
      catch (e) { if (noExiste(e)) return null; throw e; }
    },
    async put(key, buf, tipo) { await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: tipo || 'application/octet-stream' })); },
    async head(key) {
      try { const r = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return { bytes: Number(r.ContentLength) }; }
      catch (e) { if (noExiste(e)) return null; throw e; }
    },
    async del(key) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
    async presignGet(key, secs = 300) { return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: secs }); },
    async presignPut(key, tipo, secs = 600) { return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: tipo || 'application/octet-stream' }), { expiresIn: secs }); },
  };
}
module.exports = { crear };
