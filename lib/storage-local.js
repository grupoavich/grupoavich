'use strict';
// Almacenamiento en una carpeta del disco: SOLO para pruebas locales (STORAGE=local).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function crear(dir, baseUrl, secreto) {
  const abs = (key) => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error('ruta inválida');
    return p;
  };
  const sig = (op, key, exp) => crypto.createHmac('sha256', secreto).update(`${op}|${key}|${exp}`).digest('hex');
  const url = (op, key, secs) => {
    const exp = Math.floor(Date.now() / 1000) + secs;
    return `${baseUrl}/_local?op=${op}&key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig(op, key, exp)}`;
  };
  return {
    async get(key) { try { return fs.readFileSync(abs(key)); } catch (e) { return null; } },
    async put(key, buf) { const p = abs(key); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); },
    async head(key) { try { return { bytes: fs.statSync(abs(key)).size }; } catch (e) { return null; } },
    async del(key) { try { fs.unlinkSync(abs(key)); } catch (e) {} },
    async presignGet(key, secs = 300) { return url('get', key, secs); },
    async presignPut(key, _tipo, secs = 600) { return url('put', key, secs); },
    // usado por dev-server.js para atender las URLs de arriba
    verificar(op, key, exp, firma) { return Number(exp) > Date.now() / 1000 && sig(op, key, exp) === firma; },
  };
}
module.exports = { crear };
