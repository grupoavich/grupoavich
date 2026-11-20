// Lector mínimo de ZIP por rangos (sin descargar todo el archivo). Solo lee el directorio central
// y los archivos pequeños que se pidan; así gasta muy poca CPU incluso con .rbz de decenas de MB.
const td = new TextDecoder();

export async function listarZip(st, key, tam) {
  const n = Math.min(tam, 65557);
  const cola = await st.getRango(key, tam - n, tam - 1);
  if (!cola) throw new Error('rbz_invalido');
  const dv = new DataView(cola.buffer, cola.byteOffset, cola.byteLength);
  let e = -1;
  for (let i = cola.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('rbz_invalido');
  const total = dv.getUint16(e + 10, true), cdTam = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
  if (cdOff === 0xffffffff || cdTam === 0xffffffff || total === 0xffff) throw new Error('rbz_invalido'); // zip64 no soportado
  if (cdOff + cdTam > tam) throw new Error('rbz_invalido');
  const cd = await st.getRango(key, cdOff, cdOff + cdTam - 1);
  if (!cd || cd.length < cdTam) throw new Error('rbz_invalido');
  const c = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const out = [];
  let p = 0;
  while (p + 46 <= cd.length && c.getUint32(p, true) === 0x02014b50) {
    const flags = c.getUint16(p + 8, true), metodo = c.getUint16(p + 10, true);
    const csize = c.getUint32(p + 20, true), usize = c.getUint32(p + 24, true);
    const nl = c.getUint16(p + 28, true), el = c.getUint16(p + 30, true), cl = c.getUint16(p + 32, true);
    const off = c.getUint32(p + 42, true);
    out.push({ nombre: td.decode(cd.subarray(p + 46, p + 46 + nl)), flags, metodo, csize, usize, off });
    p += 46 + nl + el + cl;
  }
  if (out.length !== total) throw new Error('rbz_invalido');
  return out;
}

// Contenido (texto) de una entrada pequeña
export async function leerTexto(st, key, ent) {
  if (ent.usize > 1024 * 1024) throw new Error('rbz_invalido');
  const cab = await st.getRango(key, ent.off, ent.off + 29);
  if (!cab || cab.length < 30) throw new Error('rbz_invalido');
  const dv = new DataView(cab.buffer, cab.byteOffset, cab.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) throw new Error('rbz_invalido');
  const ini = ent.off + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  const datos = await st.getRango(key, ini, ini + ent.csize - 1);
  if (!datos) throw new Error('rbz_invalido');
  if (ent.metodo === 0) return td.decode(datos);
  if (ent.metodo !== 8) throw new Error('rbz_invalido');
  const ab = await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  return td.decode(ab);
}
