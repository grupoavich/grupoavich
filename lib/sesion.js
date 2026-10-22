'use strict';
const crypto = require('crypto');
const cfg = require('./config');
const COOKIE = 'avich_admin';
const DURACION_S = 12 * 3600;

const hmac = (txt) => crypto.createHmac('sha256', cfg.sessionSecret()).update(txt).digest('hex');
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function passwordOk(p) {
  const real = cfg.adminPassword();
  if (!real || !cfg.sessionSecret()) return false;
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  return igual(h(p), h(real));
}
function crearCookie() {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  const v = `${exp}.${hmac('admin|' + exp)}`;
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_S}`;
}
function cookieBorrar() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
function autenticado(req) {
  if (!cfg.sessionSecret()) return false;
  const m = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!m) return false;
  const [exp, firma] = m.slice(COOKIE.length + 1).split('.');
  if (!exp || !firma || Number(exp) < Date.now() / 1000) return false;
  return igual(firma, hmac('admin|' + exp));
}
module.exports = { passwordOk, crearCookie, cookieBorrar, autenticado };
