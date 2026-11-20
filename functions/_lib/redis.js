// Cliente mínimo de Upstash Redis (REST). Sin dependencias.
// Variables: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
export async function redis(env, ...args) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta configurar la base de datos (UPSTASH_REDIS_REST_URL / TOKEN)');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}
