'use strict';
// POST /api/admin?accion=login|logout|lista|subida|publicar|eliminar|avisos   (todo menos login pide sesión)
const crypto = require('crypto');
const { leerJSON, json, ip } = require('../lib/http');
const { permitir } = require('../lib/limite');
const ses = require('../lib/sesion');
const { getStorage } = require('../lib/storage');
const { leer, guardar, idValido, nombreArchivoSeguro, TIPOS, ARCHIVOS } = require('../lib/catalogo');
const rel = require('../lib/release');

const MAX_PRINCIPAL = 40 * 1024 * 1024, MAX_MINIATURA = 1024 * 1024;
const limpia = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

function tipoReal(buf) {
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) return 'skm';
  if (buf.length > 8 && buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  return null;
}
const extDe = (nombre) => { const e = nombre.toLowerCase().split('.').pop(); return e === 'jpeg' ? 'jpg' : e; };

module.exports = async (req, res) => {
  const accion = new URL(req.url, 'http://x').searchParams.get('accion');
  try {
    if (accion === 'login') {
      if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
      if (!permitir('login:' + ip(req), 8, 15 * 60 * 1000)) return json(res, 429, { error: 'demasiados_intentos' });
      const b = await leerJSON(req);
      if (!ses.passwordOk(b.password)) { await new Promise((r) => setTimeout(r, 600)); return json(res, 401, { error: 'clave_incorrecta' }); }
      return json(res, 200, { ok: true }, { 'Set-Cookie': ses.crearCookie() });
    }
    if (accion === 'logout') return json(res, 200, { ok: true }, { 'Set-Cookie': ses.cookieBorrar() });

    if (!ses.autenticado(req)) return json(res, 401, { error: 'sesion' });
    const st = getStorage();

    if (accion === 'lista') {
      const c = await leer();
      const r = await rel.leer();
      return json(res, 200, { version: c.version, items: c.items, avisos: c.avisos, release: r ? { version: r.version, notas: r.notas, obligatoria: !!r.obligatoria, publicado: r.publicado, bytes: r.archivo.bytes, incluye_dll: !!r.incluye_dll } : null });
    }
    if (req.method !== 'POST' || !String(req.headers['content-type'] || '').includes('application/json')) return json(res, 400, { error: 'formato' });
    const b = await leerJSON(req);

    if (accion === 'subida') {                       // URL firmada para que el navegador suba el archivo directo a R2
      if (!idValido(b.id) || !ARCHIVOS.includes(b.archivo) || !nombreArchivoSeguro(b.nombre)) return json(res, 400, { error: 'datos' });
      const c = await leer();
      const it = c.items.find((x) => x.id === b.id);
      const ver = (it ? it.version : 0) + 1;
      const key = `archivos/${b.id}/v${ver}/${b.archivo}-${b.nombre}`;
      const tipo = { skm: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg' }[extDe(b.nombre)];
      return json(res, 200, { key, ver, url: await st.presignPut(key, tipo, 600), tipo });
    }

    if (accion === 'publicar') {
      if (!idValido(b.id)) return json(res, 400, { error: 'id' });
      if (!TIPOS.includes(b.tipo)) return json(res, 400, { error: 'tipo' });
      const nombre = limpia(b.nombre, 80);
      if (!nombre) return json(res, 400, { error: 'nombre' });
      const acceso = b.acceso === 'gratis' ? 'gratis' : 'licencia';
      const c = await leer();
      let it = c.items.find((x) => x.id === b.id);
      const nuevo = !it;
      if (nuevo) it = { id: b.id, version: 0, archivos: {} };

      // archivos recién subidos: se verifican, se miden y se les calcula la huella SHA-256
      const nuevos = {};
      for (const a of ARCHIVOS) {
        const f = b.archivos && b.archivos[a];
        if (!f || !f.key) continue;
        if (!String(f.key).startsWith(`archivos/${b.id}/`) || f.key.includes('..')) return json(res, 400, { error: 'ruta' });
        const nombreF = f.key.split('/').pop().replace(/^(principal|miniatura)-/, '');
        if (!nombreArchivoSeguro(nombreF)) return json(res, 400, { error: 'archivo_nombre' });
        const buf = await st.get(f.key);
        if (!buf) return json(res, 400, { error: 'archivo_no_subido', archivo: a });
        if (buf.length > (a === 'principal' ? MAX_PRINCIPAL : MAX_MINIATURA)) return json(res, 400, { error: 'archivo_grande', archivo: a });
        const real = tipoReal(buf);
        if (!real || real !== extDe(nombreF)) return json(res, 400, { error: 'archivo_invalido', archivo: a });
        if (b.tipo === 'placa' && a === 'principal' && real !== 'skm') return json(res, 400, { error: 'placa_requiere_skm' });
        if (b.tipo === 'accesorio' && a === 'principal' && real === 'skm') return json(res, 400, { error: 'accesorio_requiere_imagen' });
        nuevos[a] = { key: f.key, nombre: nombreF, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
      }
      if (!it.archivos.principal && !nuevos.principal) return json(res, 400, { error: 'falta_principal' });

      const d = b.datos || {};
      const datos = b.tipo === 'placa'
        ? { codigo: limpia(d.codigo, 40), largo: num(d.largo, 1, 10000) || 2440, ancho: num(d.ancho, 1, 10000) || 1830, espesor: num(d.espesor, 0.1, 200) || 18, veta: !!d.veta }
        : { codigo: limpia(d.codigo, 40), unidad: limpia(d.unidad, 20) || 'unidades' };

      const hayArchivosNuevos = Object.keys(nuevos).length > 0;
      for (const a of Object.keys(nuevos)) {            // borra el archivo anterior de ese tipo
        const viejo = it.archivos[a];
        if (viejo && viejo.key !== nuevos[a].key) { try { await st.del(viejo.key); } catch (e) {} }
        it.archivos[a] = nuevos[a];
      }
      Object.assign(it, { tipo: b.tipo, nombre, marca: limpia(b.marca, 40), categoria: limpia(b.categoria, 40), acceso, datos });
      if (nuevo || hayArchivosNuevos) it.version += 1;  // la versión solo sube si cambian los archivos (la extensión así sabe que hay que bajar de nuevo)
      it.actualizado = new Date().toISOString();
      if (nuevo) c.items.push(it);
      c.items.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
      await guardar(c);
      return json(res, 200, { ok: true, version: it.version, catalogo: c.version });
    }

    if (accion === 'eliminar') {
      if (!idValido(b.id)) return json(res, 400, { error: 'id' });
      const c = await leer();
      const it = c.items.find((x) => x.id === b.id);
      if (!it) return json(res, 404, { error: 'no_existe' });
      for (const a of ARCHIVOS) if (it.archivos && it.archivos[a]) { try { await st.del(it.archivos[a].key); } catch (e) {} }
      c.items = c.items.filter((x) => x.id !== b.id);
      await guardar(c);
      return json(res, 200, { ok: true });
    }

    // ── Versiones de la extensión (.rbz firmado y cifrado) ──
    if (accion === 'subida_release') {
      if (!rel.VERSION_RE.test(String(b.version)) || !rel.NOMBRE_RE.test(String(b.nombre))) return json(res, 400, { error: 'datos' });
      const key = `releases/${b.version}/${b.nombre}`;
      return json(res, 200, { key, url: await st.presignPut(key, 'application/octet-stream', 900) });
    }
    if (accion === 'publicar_release') {
      const version = String(b.version);
      if (!rel.VERSION_RE.test(version)) return json(res, 400, { error: 'version' });
      if (!b.key || !String(b.key).startsWith(`releases/${version}/`) || String(b.key).includes('..') || !rel.NOMBRE_RE.test(String(b.key).split('/').pop())) return json(res, 400, { error: 'ruta' });
      const buf = await st.get(b.key);
      if (!buf) return json(res, 400, { error: 'archivo_no_subido' });
      let info;
      try { info = await rel.inspeccionar(buf, version); } catch (e) { return json(res, 400, { error: String(e.message).split(':')[0], detalle: e.message }); }
      const previa = await rel.leer();
      await rel.guardar({
        version, notas: limpia(b.notas, 600), obligatoria: !!b.obligatoria, publicado: new Date().toISOString(),
        incluye_dll: info.incluye_dll, cifrado: info.cifrado, firmado: info.firmado,
        archivo: { key: b.key, nombre: b.key.split('/').pop(), bytes: buf.length, sha256: rel.huella(buf) },
      });
      if (previa && previa.archivo && previa.archivo.key !== b.key) { try { await st.del(previa.archivo.key); } catch (e) {} }
      return json(res, 200, { ok: true, version, advertencias: [].concat(info.cifrado ? [] : ['El paquete NO está cifrado (.rbe)']).concat(info.firmado ? [] : ['No se ve el archivo de firma de SketchUp']) });
    }
    if (accion === 'quitar_release') {
      const previa = await rel.leer();
      if (previa && previa.archivo) { try { await st.del(previa.archivo.key); } catch (e) {} }
      await rel.quitar();
      return json(res, 200, { ok: true });
    }

    if (accion === 'avisos') {
      const c = await leer();
      c.avisos = (Array.isArray(b.avisos) ? b.avisos : []).slice(0, 5).map((a, i) => ({
        id: limpia(a.id || ('a' + (i + 1)), 20), texto: limpia(a.texto, 200), url: /^https:\/\//.test(a.url || '') ? limpia(a.url, 300) : '',
      })).filter((a) => a.texto);
      await guardar(c);
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'accion' });
  } catch (e) {
    console.error('admin:', e.message);
    return json(res, 500, { error: 'servidor' });
  }
};
