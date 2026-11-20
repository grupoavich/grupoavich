// Versiones de la extensión (.rbz firmado y cifrado) que reciben los clientes con licencia.
import { getStorage } from './almacen.js';
import { listarZip, leerTexto } from './zip.js';

const CLAVE = 'actualizacion.json';
export const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
export const NOMBRE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.rbz$/;
export const MAX_RBZ = 80 * 1024 * 1024;

export async function leer(env) {
  const b = await getStorage(env).get(CLAVE);
  if (!b) return null;
  try { return JSON.parse(new TextDecoder().decode(b)); } catch (e) { return null; }
}
export const guardar = (env, m) => getStorage(env).put(CLAVE, new TextEncoder().encode(JSON.stringify(m, null, 1)), 'application/json');
export const quitar = (env) => getStorage(env).del(CLAVE);

// Revisa que el .rbz sea realmente de AVICH y que la versión declarada coincida con la que trae por dentro.
// Lee solo el directorio del ZIP y "Avich sistemas.rb" (por rangos), no el archivo entero.
export async function inspeccionar(st, key, version, tam) {
  if (tam > MAX_RBZ) throw new Error('rbz_grande');
  const cab = await st.getRango(key, 0, 3);
  if (!cab || cab.length < 4 || cab[0] !== 0x50 || cab[1] !== 0x4b) throw new Error('rbz_invalido');
  const ents = await listarZip(st, key, tam);
  const nombres = ents.map((e) => e.nombre);
  const raiz = 'Avich sistemas.rb';
  if (!nombres.includes(raiz)) throw new Error('rbz_sin_cargador');
  for (const n of nombres) {
    if (n.includes('..') || n.startsWith('/') || n.includes('\\') || /^[A-Za-z]:/.test(n)) throw new Error('rbz_ruta_peligrosa');
    if (n !== raiz && !n.startsWith('Avich sistemas/')) throw new Error('rbz_archivos_ajenos');
  }
  const txt = await leerTexto(st, key, ents.find((e) => e.nombre === raiz));
  const m = txt.match(/PLUGIN_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m || m[1] !== version) throw new Error('rbz_version_distinta:' + (m ? m[1] : 'sin_version'));
  return {
    archivos: ents.filter((e) => !e.nombre.endsWith('/')).length,
    incluye_dll: nombres.some((n) => /protector\.dll$/i.test(n)),
    cifrado: nombres.some((n) => /\.rbe$/i.test(n)),
    firmado: nombres.some((n) => /signature/i.test(n)),
  };
}
