'use strict';
// GET /api/instalador
// Redirige (302) a una URL temporal (5 min) del .rbz de la ÚLTIMA versión publicada en /admin.
// Es el enlace para el botón «Descargar» de la página: el cliente baja el .rbz y lo instala a mano
// en SketchUp (Extension Manager → Install Extension).
// Es público a propósito: la prueba gratuita empieza al abrir la extensión, así que quien aún no
// tiene licencia también debe poder instalarla. (Las ACTUALIZACIONES automáticas siguen pidiendo
// licencia en /api/actualizacion.)
const { ip } = require('../lib/http');
const { permitir } = require('../lib/limite');
const rel = require('../lib/release');
const { getStorage } = require('../lib/storage');

function texto(res, estado, msg) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(msg);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método no permitido');
  if (!permitir('inst:' + ip(req), 30, 60 * 1000)) return texto(res, 429, 'Demasiadas solicitudes. Intenta de nuevo en un minuto.');
  try {
    const m = await rel.leer();
    if (!m || !m.archivo || !m.archivo.key) return texto(res, 404, 'Todavía no hay una versión publicada para descargar.');
    const url = await getStorage().presignGet(m.archivo.key, 300);
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.setHeader('Cache-Control', 'no-store');   // siempre la versión más nueva, nunca una copia vieja en caché
    res.end();
  } catch (e) {
    console.error('instalador:', e.message);
    texto(res, 500, 'No se pudo preparar la descarga. Intenta de nuevo en unos minutos.');
  }
};
