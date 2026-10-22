'use strict';
// Límite sencillo por IP (en memoria de cada instancia; es una barrera básica, no una defensa total).
const cubos = new Map();
function permitir(clave, max, ventanaMs) {
  const ahora = Date.now();
  let c = cubos.get(clave);
  if (!c || ahora > c.fin) { c = { n: 0, fin: ahora + ventanaMs }; cubos.set(clave, c); }
  c.n++;
  if (cubos.size > 5000) for (const [k, v] of cubos) if (ahora > v.fin) cubos.delete(k);
  return c.n <= max;
}
module.exports = { permitir };
