import { cfg } from './config.js';
import { getStorage } from './almacen.js';

const CLAVE = 'catalogo.json';
export const TIPOS = ['placa', 'accesorio'];
export const ARCHIVOS = ['principal', 'miniatura'];

export const idValido = (s) => /^[a-z0-9][a-z0-9-]{0,59}$/.test(String(s || ''));
export const nombreArchivoSeguro = (s) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(skm|png|jpg|jpeg)$/i.test(String(s || ''));

export async function leer(env) {
  const buf = await getStorage(env).get(CLAVE);
  if (!buf) return { version: 0, items: [], avisos: [] };
  try {
    const c = JSON.parse(new TextDecoder().decode(buf));
    c.items = Array.isArray(c.items) ? c.items : [];
    c.avisos = Array.isArray(c.avisos) ? c.avisos : [];
    c.version = Number(c.version) || 0;
    return c;
  } catch (e) { return { version: 0, items: [], avisos: [] }; }
}
export async function guardar(env, c) {
  c.version = (Number(c.version) || 0) + 1;
  c.actualizado = new Date().toISOString();
  await getStorage(env).put(CLAVE, new TextEncoder().encode(JSON.stringify(c, null, 1)), 'application/json');
  return c;
}

// Lo que ve la extensión (sin rutas internas). Sin licencia, lo "licencia" va bloqueado y sin archivo principal.
export function vistaPara(env, c, acceso) {
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
    version: c.version, generado: new Date().toISOString(), min_extension: cfg(env).minExtension(),
    items, avisos: c.avisos,
  };
}
