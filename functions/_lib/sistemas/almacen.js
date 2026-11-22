// Cloudflare R2 por su API S3. Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { presignar, firmarCabeceras } from './s3.js';
import { sha256hex } from '../cripto.js';

export function getStorage(env, fetchFn) {
  const cuenta = String(env.R2_ACCOUNT_ID || ''), bucket = env.R2_BUCKET, ak = env.R2_ACCESS_KEY_ID, sk = env.R2_SECRET_ACCESS_KEY;
  if (!cuenta || !ak || !sk || !bucket) throw new Error('Faltan variables de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)');
  const host = env.R2_HOST || `${cuenta}.r2.cloudflarestorage.com`;
  const base = env.R2_BASE_URL || `https://${host}`;       // R2_BASE_URL solo se usa en pruebas
  const ruta = (key) => `/${bucket}/${key}`;
  const f = fetchFn || fetch;
  const cred = { host, region: 'auto', accessKey: ak, secretKey: sk };

  async function pedir(metodo, key, { cuerpo, tipo, rango } = {}) {
    const hashCuerpo = cuerpo ? await sha256hex(cuerpo) : undefined;
    const cab = await firmarCabeceras(Object.assign({ metodo, ruta: ruta(key), hashCuerpo }, cred));
    if (tipo) cab['Content-Type'] = tipo;
    if (rango) cab.Range = rango;
    const url = base + ruta(key).split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
    return f(url, { method: metodo, headers: cab, body: cuerpo });
  }

  // R2 a veces responde 500/503 «InternalError… try again» de forma pasajera: se reintenta (la firma se rehace cada vez).
  async function pedirConReintento(metodo, key, op) {
    let r;
    for (let i = 0; i < 4; i++) {
      try { r = await pedir(metodo, key, op); } catch (e) { if (i === 3) throw e; r = null; }
      if (r && r.status < 500) return r;
      if (i < 3) await new Promise((ok) => setTimeout(ok, 250 * (i + 1) * (i + 1)));
    }
    return r;
  }
  const falla = async (r, que) => { throw new Error(`R2 ${que}: HTTP ${r.status} ${(await r.text().catch(() => '')).replace(/<[^>]+>/g, ' ').slice(0, 160)}`); };

  return {
    async get(key) {
      const r = await pedirConReintento('GET', key);
      if (r.status === 404) return null;
      if (!r.ok) await falla(r, 'get');
      return new Uint8Array(await r.arrayBuffer());
    },
    async getRango(key, ini, fin) {      // bytes ini..fin (inclusive); devuelve menos si el archivo es más corto
      const r = await pedirConReintento('GET', key, { rango: `bytes=${ini}-${fin}` });
      if (r.status === 404 || r.status === 416) return null;
      if (!r.ok) await falla(r, 'getRango');
      return new Uint8Array(await r.arrayBuffer());
    },
    async put(key, bytes, tipo) {
      const r = await pedirConReintento('PUT', key, { cuerpo: bytes, tipo: tipo || 'application/octet-stream' });
      if (!r.ok) await falla(r, 'put');
    },
    async head(key) {
      const r = await pedirConReintento('HEAD', key);
      if (r.status === 404) return null;
      if (!r.ok) await falla(r, 'head');
      return { bytes: Number(r.headers.get('content-length')) };
    },
    async del(key) {
      const r = await pedirConReintento('DELETE', key);
      if (!r.ok && r.status !== 404) await falla(r, 'del');
    },
    presignGet: (key, secs = 300) => presignar(Object.assign({ metodo: 'GET', ruta: ruta(key), expira: secs }, cred)),
    presignPut: (key, _tipo, secs = 600) => presignar(Object.assign({ metodo: 'PUT', ruta: ruta(key), expira: secs }, cred)),
  };
}
