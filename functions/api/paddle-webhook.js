// Webhook de Paddle -> crea/renueva/actualiza licencias.
// En Paddle: Developer Tools > Notifications > nuevo destino: https://TU-DOMINIO/api/paddle-webhook
// Eventos: transaction.completed, subscription.created, subscription.activated, subscription.updated,
//          subscription.canceled, subscription.past_due, subscription.paused, subscription.resumed
import { redis } from '../_lib/redis.js';
import { json, baseUrl } from '../_lib/util.js';
import { verificarFirma, emailDeCliente } from '../_lib/paddle.js';
import * as L from '../_lib/licencias.js';
import { enviar, correoLicencia } from '../_lib/correo.js';

const ESTADOS = { active: 'activa', trialing: 'activa', past_due: 'pago_pendiente', paused: 'pausada', canceled: 'cancelada' };

function fechaOFuturo(iso, periodo) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!isNaN(t)) return t;
  return Date.now() + (periodo === 'anual' ? 366 : 32) * L.DIA;
}

async function transaccionCompletada(env, request, d) {
  const precio = d.items && d.items[0] && d.items[0].price && d.items[0].price.id;
  const plan = L.planPorPrecio(env, precio);
  if (!plan) { console.log('[webhook] precio ajeno a AVICH 3D, se ignora:', precio); return; }
  const expira = fechaOFuturo(d.billing_period && d.billing_period.ends_at, plan.periodo);
  const existente = d.subscription_id ? await L.porSuscripcion(env, d.subscription_id) : null;
  if (existente) { // renovación
    existente.expira = expira; existente.estado = 'activa';
    existente.plan = plan.plan; existente.periodo = plan.periodo; existente.maxEquipos = plan.maxEquipos;
    await L.guardar(env, existente);
    return;
  }
  const email = await emailDeCliente(env, d.customer_id);
  const lic = {
    clave: L.nuevaClave(), email: email.toLowerCase(), plan: plan.plan, periodo: plan.periodo, maxEquipos: plan.maxEquipos,
    estado: 'activa', suscripcion: d.subscription_id || null, cliente: d.customer_id, expira, equipos: [], creada: Date.now(),
  };
  await L.guardar(env, lic);
  const c = correoLicencia({ clave: lic.clave, plan: lic.plan, periodo: lic.periodo, maxEquipos: lic.maxEquipos, urlCuenta: baseUrl(env, request) + '/mi-cuenta/' });
  await enviar(env, { para: email, asunto: c.asunto, html: c.html, texto: c.texto });
}

async function suscripcionCambio(env, d) {
  const lic = await L.porSuscripcion(env, d.id);
  if (!lic) return; // aún no existe: la creará transaction.completed
  if (ESTADOS[d.status]) lic.estado = ESTADOS[d.status];
  const fin = d.current_billing_period && d.current_billing_period.ends_at;
  if (fin && d.status !== 'canceled') lic.expira = fechaOFuturo(fin, lic.periodo);
  const precio = d.items && d.items[0] && d.items[0].price && d.items[0].price.id;
  const plan = L.planPorPrecio(env, precio);
  if (plan) { lic.plan = plan.plan; lic.periodo = plan.periodo; lic.maxEquipos = plan.maxEquipos; }
  await L.guardar(env, lic);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);
  const crudo = await request.text(); // cuerpo EXACTO, necesario para verificar la firma
  if (!(await verificarFirma(request.headers.get('paddle-signature'), crudo, env.PADDLE_WEBHOOK_SECRET))) {
    return json({ error: 'firma_invalida' }, 401);
  }
  let ev; try { ev = JSON.parse(crudo); } catch (e) { return json({ error: 'json_invalido' }, 400); }
  const marca = 'ev:' + ev.event_id;
  try {
    const nuevo = await redis(env, 'SET', marca, '1', 'EX', String(7 * 86400), 'NX');
    if (!nuevo) return json({ ok: true, duplicado: true });
    if (ev.event_type === 'transaction.completed') await transaccionCompletada(env, request, ev.data);
    else if (/^subscription\./.test(ev.event_type)) await suscripcionCambio(env, ev.data);
    return json({ ok: true });
  } catch (e) {
    console.error('[webhook] error', ev.event_type, e);
    try { await redis(env, 'DEL', marca); } catch (_) {}
    return json({ error: 'error_interno' }, 500); // Paddle reintentará
  }
}
