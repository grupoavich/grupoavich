'use strict';
const cfg = require('./config');
let instancia = null;
function getStorage() {
  if (instancia) return instancia;
  const env = process.env;
  if (cfg.storage() === 'local') {
    instancia = require('./storage-local').crear(env.LOCAL_STORAGE_DIR || './.almacen-local', env.PUBLIC_BASE_URL || 'http://127.0.0.1:3000', env.SESSION_SECRET || 'local');
  } else {
    instancia = require('./storage-r2').crear(env);
  }
  return instancia;
}
function reiniciar() { instancia = null; }   // solo para pruebas
module.exports = { getStorage, reiniciar };
