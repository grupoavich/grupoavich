// POST /api/admin?accion=login|logout|lista|diagnostico|subida|publicar|eliminar|avisos|subida_release|publicar_release|quitar_release|licencia_crear|licencia_ver|licencia_revocar|licencia_quitar_equipo
// (todo menos login/logout pide sesión)
import { leerJSON, json, ip } from '../_lib/sistemas/h.js';
import { permitir } from '../_lib/sistemas/limite.js';
import * as ses from '../_lib/sistemas/sesion.js';
import { getStorage } from '../_lib/sistemas/almacen.js';
import { leer, guardar, idValido, nombreArchivoSeguro, TIPOS, ARCHIVOS } from '../_lib/sistemas/catalogo.js';
import * as rel from '../_lib/sistemas/release.js';
import { firmar, formaClave } from '../_lib/sistemas/firma.js';
import { sha256hex } from '../_lib/cripto.js';
import { redis } from '../_lib/redis.js';
import * as L from '../_lib/licencias.js';

const MAX_PRINCIPAL = 40 * 1024 * 1024, MAX_MINIATURA = 1024 * 1024;
const MAX_HASH_SERVIDOR = 4 * 1024 * 1024;     // por encima de esto el navegador debe mandar la huella (ahorra CPU)
const limpia = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const HEX64 = /^[0-9a-f]{64}$/;

function tipoReal(b) {
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b) return 'skm';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  return null;
}
const extDe = (nombre) => { const e = nombre.toLowerCase().split('.').pop(); return e === 'jpeg' ? 'jpg' : e; };

// Huella SHA-256: la calcula el navegador del admin (así el servidor no gasta CPU con archivos grandes).
async function huella(st, key, tam, dada) {
  const d = String(dada || '').toLowerCase();
  if (HEX64.test(d)) return d;
  if (tam <= MAX_HASH_SERVIDOR) { const b = await st.get(key); return b ? sha256hex(b) : null; }
  return null;
}

export async function onRequest({ request, env }) {
  const accion = new URL(request.url).searchParams.get('accion');
  let autenticado = false;
  try {
    if (accion === 'login') {
      if (request.method !== 'POST') return json({ error: 'metodo' }, 405);
      if (!permitir('login:' + ip(request), 8, 15 * 60 * 1000)) return json({ error: 'demasiados_intentos' }, 429);
      const b = await leerJSON(request);
      if (!(await ses.passwordOk(env, b.password))) { await new Promise((r) => setTimeout(r, 600)); return json({ error: 'clave_incorrecta' }, 401); }
      return json({ ok: true }, 200, { 'Set-Cookie': await ses.crearCookie(env) });
    }
    if (accion === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': ses.cookieBorrar() });

    if (!(await ses.autenticado(env, request))) return json({ error: 'sesion' }, 401);
    autenticado = true;
    // Si el almacenamiento no está bien configurado NO se cae todo: el diagnóstico debe poder explicarlo.
    let st = null, stError = null;
    try { st = getStorage(env); } catch (e) { stError = e; }
    if (!st && accion !== 'diagnostico') return json({ error: 'almacenamiento', detalle: String(stError && stError.message).slice(0, 220) }, 500);

    if (accion === 'lista') {
      const c = await leer(env);
      const r = await rel.leer(env);
      return json({ version: c.version, items: c.items, avisos: c.avisos, release: r ? { version: r.version, notas: r.notas, obligatoria: !!r.obligatoria, publicado: r.publicado, bytes: r.archivo.bytes, incluye_dll: !!r.incluye_dll } : null });
    }
    if (request.method !== 'POST' || !String(request.headers.get('content-type') || '').includes('application/json')) return json({ error: 'formato' }, 400);
    const b = await leerJSON(request);

    // ---- Licencias (crear de prueba / consultar / revocar / quitar equipo)
    if (accion && accion.indexOf('licencia_') === 0) {
      if (request.method !== 'POST') return json({ error: 'metodo' }, 405);
      const vista = (l) => ({ clave: l.clave, producto: L.productoDe(l), email: l.email, plan: l.plan, periodo: l.periodo, estado: l.estado, maxEquipos: l.maxEquipos, expira: l.expira, vigente: L.evaluar(env, l).valida, motivo: L.evaluar(env, l).motivo, equipos: (l.equipos || []).map((e) => ({ id: e.id, nombre: e.nombre })) });
      if (accion === 'licencia_crear') {
        const email = limpia(b.email, 120).toLowerCase(), plan = limpia(b.plan, 40) || 'Prueba';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'correo_invalido' }, 400);
        const dias = num(b.dias, 1, 3650), maxEq = num(b.maxEquipos, 1, 50);
        if (dias === null || maxEq === null) return json({ error: 'numeros_invalidos' }, 400);
        const lic = { clave: L.nuevaClave(), producto: b.producto === 'sistemas' ? 'sistemas' : '3d', email, plan, periodo: 'manual', maxEquipos: maxEq, estado: 'activa', suscripcion: null, cliente: null, expira: Date.now() + dias * L.DIA, equipos: [], creada: Date.now() };
        await L.guardar(env, lic);
        return json({ ok: true, licencia: vista(lic) });
      }
      const lic = await L.obtener(env, b.clave);
      if (!lic) return json({ error: 'no_existe' }, 404);
      if (accion === 'licencia_ver') return json({ ok: true, licencia: vista(lic) });
      if (accion === 'licencia_revocar') { lic.estado = 'revocada'; await L.guardar(env, lic); return json({ ok: true, licencia: vista(lic) }); }
      if (accion === 'licencia_quitar_equipo') { lic.equipos = (lic.equipos || []).filter((e) => e.id !== b.equipo); await L.guardar(env, lic); return json({ ok: true, licencia: vista(lic) }); }
      return json({ error: 'accion' }, 400);
    }

    // Diagnóstico: dice qué falta o qué está mal configurado (sin mostrar ningún secreto)
    if (accion === 'diagnostico') {
      const nombres = ['SIGNING_PRIVATE_KEY', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
      const faltan = nombres.filter((k) => !String(env[k] || '').trim());
      const avisos = [];
      if (env.R2_ACCOUNT_ID && !/^[0-9a-f]{32}$/i.test(String(env.R2_ACCOUNT_ID))) avisos.push('R2_ACCOUNT_ID no parece un Account ID (deben ser 32 letras y números, sin espacios ni comillas).');
      if (env.R2_BUCKET && String(env.R2_BUCKET) !== String(env.R2_BUCKET).trim()) avisos.push('R2_BUCKET tiene espacios al inicio o al final.');
      if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
        try { await redis(env, 'PING'); } catch (e) { avisos.push('No se pudo conectar con la base de datos de licencias (Upstash): ' + String(e.message).slice(0, 120)); }
      }
      let almacen = { ok: false, detalle: 'No se probó' };
      if (!st) almacen = { ok: false, detalle: String(stError && stError.message).slice(0, 220) };
      else try {
        await st.put('diagnostico/servidor.txt', new TextEncoder().encode('ok'), 'text/plain');
        const g = await st.get('diagnostico/servidor.txt');
        await st.del('diagnostico/servidor.txt');
        almacen = g && new TextDecoder().decode(g) === 'ok' ? { ok: true } : { ok: false, detalle: 'Se escribió pero no se pudo leer' };
      } catch (e) { almacen = { ok: false, detalle: String(e.name + ': ' + e.message).replace(/[\u0000-\u001f]/g, ' ').slice(0, 220) }; }
      let firma = { ok: false };
      try { await firmar(env, 'prueba'); firma = { ok: true }; } catch (e) { firma = { ok: false, detalle: String(e.message).slice(0, 120) + ' | ' + formaClave(env) }; }
      let url = null;
      if (st) try { url = await st.presignPut('diagnostico/navegador.txt', 'text/plain', 300); } catch (e) { /* ya se verá en almacen */ }
      return json({ faltan, avisos, almacen, firma, url, almacenamiento: 'r2' });
    }

    if (accion === 'subida') {                       // URL firmada para que el navegador suba el archivo directo a R2
      if (!idValido(b.id) || !ARCHIVOS.includes(b.archivo) || !nombreArchivoSeguro(b.nombre)) return json({ error: 'datos' }, 400);
      const c = await leer(env);
      const it = c.items.find((x) => x.id === b.id);
      const ver = (it ? it.version : 0) + 1;
      const key = `archivos/${b.id}/v${ver}/${b.archivo}-${b.nombre}`;
      const tipo = { skm: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg' }[extDe(b.nombre)];
      return json({ key, ver, url: await st.presignPut(key, tipo, 600), tipo });
    }

    if (accion === 'publicar') {
      if (!idValido(b.id)) return json({ error: 'id' }, 400);
      if (!TIPOS.includes(b.tipo)) return json({ error: 'tipo' }, 400);
      const nombre = limpia(b.nombre, 80);
      if (!nombre) return json({ error: 'nombre' }, 400);
      const acceso = b.acceso === 'gratis' ? 'gratis' : 'licencia';
      const c = await leer(env);
      let it = c.items.find((x) => x.id === b.id);
      const nuevo = !it;
      if (nuevo) it = { id: b.id, version: 0, archivos: {} };

      // archivos recién subidos: se verifican, se miden y se les registra la huella SHA-256
      const nuevos = {};
      for (const a of ARCHIVOS) {
        const f = b.archivos && b.archivos[a];
        if (!f || !f.key) continue;
        if (!String(f.key).startsWith(`archivos/${b.id}/`) || f.key.includes('..')) return json({ error: 'ruta' }, 400);
        const nombreF = f.key.split('/').pop().replace(/^(principal|miniatura)-/, '');
        if (!nombreArchivoSeguro(nombreF)) return json({ error: 'archivo_nombre' }, 400);
        const h = await st.head(f.key);
        if (!h) return json({ error: 'archivo_no_subido', archivo: a }, 400);
        if (h.bytes > (a === 'principal' ? MAX_PRINCIPAL : MAX_MINIATURA)) return json({ error: 'archivo_grande', archivo: a }, 400);
        const cab = await st.getRango(f.key, 0, 15);
        const real = cab ? tipoReal(cab) : null;
        if (!real || real !== extDe(nombreF)) return json({ error: 'archivo_invalido', archivo: a }, 400);
        if (b.tipo === 'placa' && a === 'principal' && real !== 'skm') return json({ error: 'placa_requiere_skm' }, 400);
        if (b.tipo === 'accesorio' && a === 'principal' && real === 'skm') return json({ error: 'accesorio_requiere_imagen' }, 400);
        const sha = await huella(st, f.key, h.bytes, f.sha256);
        if (!sha) return json({ error: 'falta_sha256', archivo: a }, 400);
        nuevos[a] = { key: f.key, nombre: nombreF, bytes: h.bytes, sha256: sha };
      }
      if (!it.archivos.principal && !nuevos.principal) return json({ error: 'falta_principal' }, 400);

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
      if (nuevo || hayArchivosNuevos) it.version += 1;  // la versión solo sube si cambian los archivos
      it.actualizado = new Date().toISOString();
      if (nuevo) c.items.push(it);
      c.items.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
      await guardar(env, c);
      return json({ ok: true, version: it.version, catalogo: c.version });
    }

    if (accion === 'eliminar') {
      if (!idValido(b.id)) return json({ error: 'id' }, 400);
      const c = await leer(env);
      const it = c.items.find((x) => x.id === b.id);
      if (!it) return json({ error: 'no_existe' }, 404);
      for (const a of ARCHIVOS) if (it.archivos && it.archivos[a]) { try { await st.del(it.archivos[a].key); } catch (e) {} }
      c.items = c.items.filter((x) => x.id !== b.id);
      await guardar(env, c);
      return json({ ok: true });
    }

    // ── Versiones de la extensión (.rbz firmado y cifrado) ──
    if (accion === 'subida_release') {
      if (!rel.VERSION_RE.test(String(b.version)) || !rel.NOMBRE_RE.test(String(b.nombre))) return json({ error: 'datos' }, 400);
      const key = `releases/${b.version}/${b.nombre}`;
      return json({ key, url: await st.presignPut(key, 'application/octet-stream', 900) });
    }
    if (accion === 'publicar_release') {
      const version = String(b.version);
      if (!rel.VERSION_RE.test(version)) return json({ error: 'version' }, 400);
      if (!b.key || !String(b.key).startsWith(`releases/${version}/`) || String(b.key).includes('..') || !rel.NOMBRE_RE.test(String(b.key).split('/').pop())) return json({ error: 'ruta' }, 400);
      const h = await st.head(b.key);
      if (!h) return json({ error: 'archivo_no_subido' }, 400);
      let info;
      try { info = await rel.inspeccionar(st, b.key, version, h.bytes); } catch (e) { return json({ error: String(e.message).split(':')[0], detalle: e.message }, 400); }
      const sha = await huella(st, b.key, h.bytes, b.sha256);
      if (!sha) return json({ error: 'falta_sha256' }, 400);
      const previa = await rel.leer(env);
      await rel.guardar(env, {
        version, notas: limpia(b.notas, 600), obligatoria: !!b.obligatoria, publicado: new Date().toISOString(),
        incluye_dll: info.incluye_dll, cifrado: info.cifrado, firmado: info.firmado,
        archivo: { key: b.key, nombre: b.key.split('/').pop(), bytes: h.bytes, sha256: sha },
      });
      if (previa && previa.archivo && previa.archivo.key !== b.key) { try { await st.del(previa.archivo.key); } catch (e) {} }
      return json({ ok: true, version, advertencias: [].concat(info.cifrado ? [] : ['El paquete NO está cifrado (.rbe)']).concat(info.firmado ? [] : ['No se ve el archivo de firma de SketchUp']) });
    }
    if (accion === 'quitar_release') {
      const previa = await rel.leer(env);
      if (previa && previa.archivo) { try { await st.del(previa.archivo.key); } catch (e) {} }
      await rel.quitar(env);
      return json({ ok: true });
    }

    if (accion === 'avisos') {
      const c = await leer(env);
      c.avisos = (Array.isArray(b.avisos) ? b.avisos : []).slice(0, 5).map((a, i) => ({
        id: limpia(a.id || ('a' + (i + 1)), 20), texto: limpia(a.texto, 200), url: /^https:\/\//.test(a.url || '') ? limpia(a.url, 300) : '',
      })).filter((a) => a.texto);
      await guardar(env, c);
      return json({ ok: true });
    }
    return json({ error: 'accion' }, 400);
  } catch (e) {
    console.error('admin:', e.message);
    return json({ error: 'servidor', detalle: autenticado ? String(e.message).slice(0, 220) : undefined }, 500);
  }
}
