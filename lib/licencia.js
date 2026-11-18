'use strict';
const crypto = require('crypto');
const cfg = require('./config');
const cache = new Map();
const TTL_OK = 10 * 60 * 1000, TTL_MAL = 60 * 1000;

// Valida una clave con la API pública de licencias de Lemon Squeezy (no necesita tu API key).
// Devuelve { ok, motivo }. Solo es válida si pertenece a TU tienda (LS_STORE_ID).
async function validar(clave, instancia) {
  clave = String(clave || '').trim();
  if (!clave) return { ok: false, motivo: 'sin_clave' };
  if (!cfg.lsStoreId()) return { ok: false, motivo: 'servidor_sin_configurar' };
  const ck = clave + '|' + String(instancia || '');
  const c = cache.get(ck);
  if (c && c.exp > Date.now()) return c.val;
  const cuerpo = new URLSearchParams({ license_key: clave });
  if (instancia) cuerpo.set('instance_id', String(instancia));
  let j;
  try {
    const r = await fetch(cfg.lsValidateUrl(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    j = await r.json();
  } catch (e) {
    return { ok: false, motivo: 'red' };           // sin caché: se reintenta en la próxima
  }
  const tienda = String((j && j.meta && j.meta.store_id) || '');
  let val;
  if (j && j.valid === true) {
    val = tienda === cfg.lsStoreId() ? { ok: true, motivo: null } : { ok: false, motivo: 'otra_tienda' };
  } else {
    val = { ok: false, motivo: 'invalida' };
  }
  cache.set(ck, { val, exp: Date.now() + (val.ok ? TTL_OK : TTL_MAL) });
  if (cache.size > 2000) for (const [k, v] of cache) if (v.exp < Date.now()) cache.delete(k);
  return val;
}

// Acceso completo para quien presente la clave de la biblioteca compartida (otra extensión tuya sin
// licencia) o, si no, para quien tenga una licencia válida de Lemon Squeezy.
function claveBibliotecaOk(dada) {
  const esperada = cfg.claveBiblioteca();
  dada = String(dada || '');
  if (!esperada || !dada) return false;
  const h = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(esperada), h(dada));
}
async function validarCliente(b) {
  b = b || {};
  if (claveBibliotecaOk(b.clave_biblioteca)) return { ok: true, motivo: null };
  return validar(b.licencia, b.instancia);
}
module.exports = { validar, validarCliente };
