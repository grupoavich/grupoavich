// Ayudas HTTP de AVICH Sistemas (Request/Response de Cloudflare).
import { json as j, ipDe } from '../util.js';
export { ipDe as ip };
export const json = (obj, estado = 200, extra) => j(obj, estado, extra ? Object.entries(extra) : undefined);
export async function leerJSON(request, maxBytes = 1024 * 1024) {
  const t = await request.text();
  if (t.length > maxBytes) throw new Error('cuerpo demasiado grande');
  if (!t) return {};
  try { return JSON.parse(t); } catch (e) { return {}; }
}
export const texto = (msg, estado = 200) => new Response(msg, { status: estado, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
