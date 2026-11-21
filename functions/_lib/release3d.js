// Versión publicada de AVICH 3D (.rbz) desde /admin. Se guarda en R2 (avich3d.json); si no hay, se usan las variables
// AVICH_ARCHIVO_R2 / AVICH_VERSION_ACTUAL / AVICH_NOTAS_VERSION como antes.
import { getStorage } from './sistemas/almacen.js';
import { listarZip, leerTexto } from './sistemas/zip.js';
import { VERSION_RE, NOMBRE_RE, MAX_RBZ } from './sistemas/release.js';

export { VERSION_RE, NOMBRE_RE };
const CLAVE = 'avich3d.json';
export const RAIZ = 'avich_3d.rb', CARPETA = 'avich_3d/';

export async function leer(env) {
  try {
    const b = await getStorage(env).get(CLAVE);
    return b ? JSON.parse(new TextDecoder().decode(b)) : null;
  } catch (e) { return null; }
}
export const guardar = (env, m) => getStorage(env).put(CLAVE, new TextEncoder().encode(JSON.stringify(m, null, 1)), 'application/json');
export const quitar = (env) => getStorage(env).del(CLAVE);

// {version, notas, objeto} de la versión vigente (manifiesto de /admin o variables de entorno).
export async function actual(env) {
  const m = await leer(env);
  if (m && m.archivo && m.archivo.key) return { version: m.version, notas: m.notas || '', objeto: m.archivo.key };
  return { version: env.AVICH_VERSION_ACTUAL || '', notas: env.AVICH_NOTAS_VERSION || '', objeto: env.AVICH_ARCHIVO_R2 || 'avich_3d.rbz' };
}

// Comprueba que el .rbz sea de AVICH 3D y que la versión escrita coincida con VERSION de avich_3d.rb.
export async function inspeccionar(st, key, version, tam) {
  if (tam > MAX_RBZ) throw new Error('rbz_grande');
  const cab = await st.getRango(key, 0, 3);
  if (!cab || cab.length < 4 || cab[0] !== 0x50 || cab[1] !== 0x4b) throw new Error('rbz_invalido');
  const ents = await listarZip(st, key, tam);
  const nombres = ents.map((e) => e.nombre);
  if (!nombres.includes(RAIZ)) throw new Error('rbz_sin_cargador');
  for (const n of nombres) {
    if (n.includes('..') || n.startsWith('/') || n.includes('\\') || /^[A-Za-z]:/.test(n)) throw new Error('rbz_ruta_peligrosa');
    if (n !== RAIZ && !n.startsWith(CARPETA)) throw new Error('rbz_archivos_ajenos');
  }
  const txt = await leerTexto(st, key, ents.find((e) => e.nombre === RAIZ));
  const m = txt.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m || m[1] !== version) throw new Error('rbz_version_distinta:' + (m ? m[1] : 'sin_version'));
  return { archivos: ents.filter((e) => !e.nombre.endsWith('/')).length, cifrado: nombres.some((n) => /\.rbe$/i.test(n)), firmado: nombres.some((n) => /signature/i.test(n)) };
}
