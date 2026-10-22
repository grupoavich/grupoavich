'use strict';
// Versiones de la extensión (.rbz firmado y cifrado) que reciben los clientes con licencia.
const crypto = require('crypto');
const JSZip = require('jszip');
const { getStorage } = require('./storage');
const CLAVE = 'actualizacion.json';
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const NOMBRE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.rbz$/;
const MAX_RBZ = 80 * 1024 * 1024;

async function leer() {
  const b = await getStorage().get(CLAVE);
  if (!b) return null;
  try { return JSON.parse(b.toString('utf8')); } catch (e) { return null; }
}
async function guardar(m) { await getStorage().put(CLAVE, Buffer.from(JSON.stringify(m, null, 1), 'utf8'), 'application/json'); }
async function quitar() { await getStorage().del(CLAVE); }

// Revisa que el .rbz sea realmente de AVICH y que la versión declarada coincida con la que trae por dentro.
async function inspeccionar(buf, version) {
  if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('rbz_invalido');
  if (buf.length > MAX_RBZ) throw new Error('rbz_grande');
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch (e) { throw new Error('rbz_invalido'); }
  const nombres = Object.keys(zip.files);
  const raiz = 'Avich sistemas.rb';
  if (!nombres.includes(raiz)) throw new Error('rbz_sin_cargador');
  for (const n of nombres) {
    if (n.includes('..') || n.startsWith('/') || n.includes('\\') || /^[A-Za-z]:/.test(n)) throw new Error('rbz_ruta_peligrosa');
    if (n !== raiz && !n.startsWith('Avich sistemas/')) throw new Error('rbz_archivos_ajenos');
  }
  const txt = await zip.file(raiz).async('string');
  const m = txt.match(/PLUGIN_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m || m[1] !== version) throw new Error('rbz_version_distinta:' + (m ? m[1] : 'sin_version'));
  return {
    archivos: nombres.filter((n) => !zip.files[n].dir).length,
    incluye_dll: nombres.some((n) => /protector\.dll$/i.test(n)),
    cifrado: nombres.some((n) => /\.rbe$/i.test(n)),
    firmado: nombres.some((n) => /signature/i.test(n)),
  };
}
const huella = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
module.exports = { leer, guardar, quitar, inspeccionar, huella, VERSION_RE, NOMBRE_RE, MAX_RBZ };
