'use strict';
const crypto = require('crypto');
const cfg = require('./config');
// Firma RSA-SHA256 (PKCS#1 v1.5) del texto EXACTO que se manda al cliente. La extensión trae la
// clave pública y rechaza cualquier catálogo que no esté firmado por tu clave privada.
function firmar(texto) {
  const pem = cfg.privateKey();
  if (!pem) throw new Error('SIGNING_PRIVATE_KEY no está configurada');
  return crypto.sign('RSA-SHA256', Buffer.from(texto, 'utf8'), pem).toString('base64');
}
module.exports = { firmar };
