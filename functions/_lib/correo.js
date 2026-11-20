// Envío con Resend (https://resend.com). Variables: RESEND_API_KEY, MAIL_FROM (p. ej. "Grupo AVICH <licencias@tudominio.com>")
export async function enviar(env, { para, asunto, html, texto }) {
  if (!env.RESEND_API_KEY) { console.warn('[correo] RESEND_API_KEY no configurada; correo omitido a', para); return false; }
  const base = env.RESEND_BASE || 'https://api.resend.com';
  const r = await fetch(base + '/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Grupo AVICH <onboarding@resend.dev>', to: [para], subject: asunto, html, text: texto }),
  });
  if (!r.ok) { console.error('[correo] fallo', r.status, await r.text().catch(() => '')); return false; }
  return true;
}

const marco = (titulo, cuerpo) => `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1A1714">
<h2 style="color:#6C3BAA;margin:0 0 12px">${titulo}</h2>${cuerpo}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:12px;color:#888">Grupo AVICH · grupoavich@gmail.com</p></div>`;

export function correoLicencia({ clave, plan, periodo, maxEquipos, urlCuenta }) {
  return {
    asunto: 'Tu licencia de AVICH 3D',
    texto: `Gracias por tu compra.\n\nClave: ${clave}\nPlan: ${plan} ${periodo} (hasta ${maxEquipos} computadora${maxEquipos > 1 ? 's' : ''})\n\nPégala en SketchUp (panel Avich 3D > Activar licencia). También la encuentras en ${urlCuenta}`,
    html: marco('¡Gracias por tu compra!', `<p>Tu licencia de <b>AVICH 3D</b> está lista.</p>
<p style="background:#F4EEFB;border-radius:8px;padding:14px;font:700 18px monospace;letter-spacing:1px;text-align:center">${clave}</p>
<p>Plan <b>${plan} ${periodo}</b> · hasta <b>${maxEquipos}</b> computadora${maxEquipos > 1 ? 's' : ''}.</p>
<p>Pégala en SketchUp, en el panel <b>Avich 3D &gt; Activar licencia</b>. También la ves siempre en <a href="${urlCuenta}">Mi cuenta</a>.</p>`),
  };
}

export function correoEnlace(url) {
  return {
    asunto: 'Tu enlace para entrar a Mi cuenta',
    texto: `Entra a Mi cuenta de AVICH con este enlace (vale 15 minutos y se usa una sola vez):\n${url}\n\nSi no lo pediste, ignora este correo.`,
    html: marco('Entra a Mi cuenta', `<p>Pulsa el botón para entrar. El enlace vale <b>15 minutos</b> y se usa una sola vez.</p>
<p><a href="${url}" style="display:inline-block;background:#6C3BAA;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Entrar a Mi cuenta</a></p>
<p style="font-size:12px;color:#888">Si no lo pediste, ignora este correo.</p>`),
  };
}

