'use strict';
const cfg = require('./config');
const { getStorage } = require('./storage');
const CLAVE = 'catalogo.json';
const TIPOS = ['placa', 'accesorio'];
const ARCHIVOS = ['principal', 'miniatura'];

const idValido = (s) => /^[a-z0-9][a-z0-9-]{0,59}$/.test(String(s || ''));
const nombreArchivoSeguro = (s) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(skm|png|jpg|jpeg)$/i.test(String(s || ''));

async function leer() {
  const buf = await getStorage().get(CLAVE);
  if (!buf) return { version: 0, items: [], avisos: [] };
  try {
    const c = JSON.parse(buf.toString('utf8'));
    c.items = Array.isArray(c.items) ? c.items : [];
    c.avisos = Array.isArray(c.avisos) ? c.avisos : [];
    c.version = Number(c.version) || 0;
    return c;
  } catch (e) { return { version: 0, items: [], avisos: [] }; }
}
async function guardar(c) {
  c.version = (Number(c.version) || 0) + 1;
  c.actualizado = new Date().toISOString();
  await getStorage().put(CLAVE, Buffer.from(JSON.stringify(c, null, 1), 'utf8'), 'application/json');
  return c;
}

// Lo que ve la extensión (sin rutas internas). Sin licencia, lo "licencia" va bloqueado y sin archivo principal.
function vistaPara(c, acceso) {
  const items = c.items.map((it) => {
    const bloqueado = it.acceso === 'licencia' && acceso !== 'licencia';
    const archivos = {};
    for (const a of ARCHIVOS) {
      const f = it.archivos && it.archivos[a];
      if (!f) continue;
      if (a === 'principal' && bloqueado) continue;
      archivos[a] = { nombre: f.nombre, sha256: f.sha256, bytes: f.bytes };
    }
    return {
      id: it.id, tipo: it.tipo, nombre: it.nombre, marca: it.marca || '', categoria: it.categoria || '',
      acceso: it.acceso, version: it.version, actualizado: it.actualizado || '',
      datos: it.datos || {}, bloqueado, archivos,
    };
  });
  return {
    version: c.version, generado: new Date().toISOString(), min_extension: cfg.minExtension(),
    items, avisos: c.avisos,
  };
}
module.exports = { leer, guardar, vistaPara, idValido, nombreArchivoSeguro, TIPOS, ARCHIVOS };
