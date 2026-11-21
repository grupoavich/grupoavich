#!/usr/bin/env node
// Herramienta de administración de licencias (se ejecuta en TU computadora, no en Cloudflare).
//   node tools/licencias.mjs crear correo@cliente.com "Empresarial" 10 365 [--enviar] [--sistemas]
//   node tools/licencias.mjs ver AVICH-XXXX-XXXX-XXXX-XXXX
//   node tools/licencias.mjs correo correo@cliente.com
//   node tools/licencias.mjs revocar AVICH-XXXX-XXXX-XXXX-XXXX
//   node tools/licencias.mjs quitar-equipo AVICH-XXXX-XXXX-XXXX-XXXX EQ-...
// Antes define (copiándolas desde el panel de Upstash / Resend): UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN y, para --enviar, RESEND_API_KEY y MAIL_FROM.
import * as L from '../functions/_lib/licencias.js';
import { enviar, correoLicencia } from '../functions/_lib/correo.js';
const env = process.env; // UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, RESEND_API_KEY, MAIL_FROM, GRACIA_PAGO_DIAS
const [, , cmd, a, b, c, d, ...resto] = process.argv;
const fmt = (l) => `${l.clave}\n  ${l.email} · ${l.plan} ${l.periodo || ''} · estado: ${l.estado} · vigente: ${L.evaluar(env, l).valida}\n  vence: ${new Date(l.expira).toLocaleDateString('es-PE')} · equipos ${(l.equipos || []).length}/${l.maxEquipos}` + (l.equipos || []).map((e) => `\n    - ${e.nombre} (${e.id})`).join('');
(async () => {
  if (cmd === 'crear') { // correo, plan, maxEquipos, dias
    if (!a || !b || !c || !d) throw new Error('Uso: crear correo plan maxEquipos dias [--enviar]');
    const lic = { clave: L.nuevaClave(), producto: process.argv.includes('--sistemas') ? 'sistemas' : '3d', email: a.toLowerCase(), plan: b, periodo: 'manual', maxEquipos: Number(c), estado: 'activa', suscripcion: null, cliente: null, expira: Date.now() + Number(d) * L.DIA, equipos: [], creada: Date.now() };
    await L.guardar(env, lic); console.log('Creada:\n' + fmt(lic));
    if (resto.includes('--enviar') || d === '--enviar') { const m = correoLicencia({ clave: lic.clave, plan: lic.plan, periodo: 'personalizado', maxEquipos: lic.maxEquipos, producto: lic.producto, urlCuenta: '' + (env.SITE_URL || 'https://grupoavich.com').replace(/\/$/, '') + '/mi-cuenta/' }); console.log('Correo enviado:', await enviar(env, { para: lic.email, asunto: m.asunto, html: m.html, texto: m.texto })); }
  } else if (cmd === 'ver') { const l = await L.obtener(env, a); console.log(l ? fmt(l) : 'No existe'); }
  else if (cmd === 'correo') { (await L.porEmail(env, a)).forEach((l) => console.log(fmt(l) + '\n')); }
  else if (cmd === 'revocar') { const l = await L.obtener(env, a); if (!l) throw new Error('No existe'); l.estado = 'revocada'; await L.guardar(env, l); console.log('Revocada:\n' + fmt(l)); }
  else if (cmd === 'quitar-equipo') { const l = await L.obtener(env, a); if (!l) throw new Error('No existe'); l.equipos = (l.equipos || []).filter((e) => e.id !== b); await L.guardar(env, l); console.log(fmt(l)); }
  else console.log('Comandos: crear | ver | correo | revocar | quitar-equipo (mira el encabezado de este archivo)');
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
