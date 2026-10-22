'use strict';
// POST /api/catalogo   { licencia, instancia, version }
// Devuelve el catálogo FIRMADO. Con licencia válida: todo. Sin licencia (prueba): lo gratis y lo demás bloqueado.
const { leerJSON, json, ip } = require('../lib/http');
const { permitir } = require('../lib/limite');
const { validar } = require('../lib/licencia');
const { leer, vistaPara } = require('../lib/catalogo');
const { firmar } = require('../lib/firma');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo' });
  if (!permitir('cat:' + ip(req), 60, 60 * 1000)) return json(res, 429, { error: 'demasiadas_solicitudes' });
  try {
    const b = await leerJSON(req);
    const lic = await validar(b.licencia, b.instancia);
    const acceso = lic.ok ? 'licencia' : 'prueba';
    const cuerpo = JSON.stringify(vistaPara(await leer(), acceso));
    return json(res, 200, { catalogo: cuerpo, firma: firmar(cuerpo), acceso, motivo: lic.motivo });
  } catch (e) {
    console.error('catalogo:', e.message);
    return json(res, 500, { error: 'servidor' });
  }
};
