'use strict';
// Toda la configuración sale de variables de entorno (en Vercel: Settings → Environment Variables).
const env = () => process.env;

module.exports = {
  // ID numérico de tu tienda en Lemon Squeezy (Settings → Stores). Sin él NO se acepta ninguna clave:
  // evita que una clave de OTRA tienda de Lemon Squeezy desbloquee tu contenido.
  lsStoreId: () => String(env().LS_STORE_ID || '').trim(),
  lsValidateUrl: () => env().LS_VALIDATE_URL || 'https://api.lemonsqueezy.com/v1/licenses/validate',
  // Clave privada RSA (PEM). En Vercel pega el PEM con saltos de línea escritos como \n
  privateKey: () => String(env().SIGNING_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  adminPassword: () => String(env().ADMIN_PASSWORD || ''),
  sessionSecret: () => String(env().SESSION_SECRET || ''),
  minExtension: () => String(env().MIN_EXTENSION || '2.1.0'),
  storage: () => String(env().STORAGE || 'r2').toLowerCase(),
};
