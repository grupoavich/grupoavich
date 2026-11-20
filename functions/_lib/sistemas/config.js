// Toda la configuración sale de variables de entorno (Cloudflare Pages → Settings → Variables and Secrets).
export const cfg = (env) => ({
  // ID numérico de tu tienda en Lemon Squeezy. Sin él NO se acepta ninguna clave.
  lsStoreId: () => String(env.LS_STORE_ID || '').trim(),
  lsValidateUrl: () => env.LS_VALIDATE_URL || 'https://api.lemonsqueezy.com/v1/licenses/validate',
  // Clave privada RSA (PEM). Se acepta con saltos de línea escritos como \n
  privateKey: () => String(env.SIGNING_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  claveBiblioteca: () => String(env.BIBLIOTECA_CLAVE || '').trim(),
  adminPassword: () => String(env.ADMIN_PASSWORD || ''),
  sessionSecret: () => String(env.SESSION_SECRET || ''),
  minExtension: () => String(env.MIN_EXTENSION || '2.1.0'),
});
