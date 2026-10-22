'use strict';
// Ayudas para leer el cuerpo y responder; funcionan en Vercel y en dev-server.js
async function leerJSON(req, maxBytes = 1024 * 1024) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const partes = []; let total = 0;
  for await (const p of req) { total += p.length; if (total > maxBytes) throw new Error('cuerpo demasiado grande'); partes.push(p); }
  const txt = Buffer.concat(partes).toString('utf8');
  if (!txt) return {};
  try { return JSON.parse(txt); } catch (e) { return {}; }
}
function json(res, estado, obj, extra) {
  const cuerpo = JSON.stringify(obj);
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.end(cuerpo);
}
function ip(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || 'desconocida';
}
module.exports = { leerJSON, json, ip };
