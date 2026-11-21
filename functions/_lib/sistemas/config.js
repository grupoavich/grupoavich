// Toda la configuración sale de variables de entorno (Cloudflare Pages → Settings → Variables and Secrets).
export const cfg = (env) => ({
  // Clave privada RSA (PEM). Se acepta con saltos de línea escritos como \n
  privateKey: () => String(env.SIGNING_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  // Clave compartida con OTRAS extensiones tuyas que no usan licencia pero deben poder bajar toda la biblioteca.
  claveBiblioteca: () => String(env.BIBLIOTECA_CLAVE || '').trim(),
  adminPassword: () => String(env.ADMIN_PASSWORD || ''),
  sessionSecret: () => String(env.SESSION_SECRET || ''),
  minExtension: () => String(env.MIN_EXTENSION || '2.1.0'),
});
