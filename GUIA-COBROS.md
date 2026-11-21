# Cobros, licencias y "Mi cuenta" — guía de puesta en marcha (Cloudflare)

Todo el código ya está hecho. Lo que falta es **crear las cuentas** y **pegar sus claves** en Cloudflare.
Hospedaje: **Cloudflare Pages** (sitio + API en `functions/`) y **R2** (descargas). Plan gratis.

## Cómo funciona (resumen)
1. El cliente paga en tu web (Paddle, ventana encima de tu página).
2. Paddle avisa a `/api/paddle-webhook` → se crea la clave `AVICH-XXXX-XXXX-XXXX-XXXX`, se guarda en la base de datos y se envía por correo.
3. El cliente entra a `/mi-cuenta/` con su correo (enlace mágico, sin contraseña): ve su clave, sus computadoras, descarga la última versión y administra/cancela la suscripción.
4. El plugin (`plugin/licencia.rb`) activa la clave en `/api/licencia` y revisa actualizaciones (descarga firmada desde R2).
5. Si Paddle avisa de un cancelamiento, pago fallido o pausa, la licencia cambia de estado sola.

Límites: Personal = 1 PC · Empresarial mensual = 5 PC · Empresarial anual = 6 PC. El plan Personalizado se crea a mano (ver el final).

## Estructura del repositorio
```
index.html  3d/  sistemas/  assets/  admin/  legal/  mi-cuenta/  _headers   ← la página (como ya la tenías)
functions/   ← TODA la API (3D: licencia, cuenta, paddle-webhook · Sistemas: catalogo, descargar, actualizacion, instalador, admin)
build.sh     ← arma la carpeta "dist" con solo lo público
plugin/  tools/  GUIA-COBROS.md   ← NO se publican
```
`build.sh` copia solo las carpetas públicas a `dist/`, así `plugin/`, `tools/`, `functions/` y esta guía nunca quedan visibles en internet.
Ya no existen `api/`, `lib/`, `package.json` ni `vercel.json` (todo eso pasó a `functions/` y no necesita instalar paquetes).

## Antes de empezar: 3 cosas importantes
- **Paddle revisa tu sitio antes de aprobarte** y conviene un **dominio propio** (por ejemplo `grupoavich.com`), no `…pages.dev`. El dominio propio también hace falta para que **Resend** envíe correos a tus clientes (con el correo de prueba solo puedes enviarte a ti mismo).
- Las páginas legales (`/legal/…`) son una **base razonable, no asesoría legal**: haz que las revise un abogado, sobre todo la jurisdicción (puse Perú) y la política de reembolsos (14 días).
- Revisa los **términos de servicio de Cloudflare** antes de lanzar; no los verifiqué línea por línea.

## Paso 1 — Subir el código a GitHub
Se sube a una rama nueva llamada `cloudflare` (tu `main` y tu sitio en Vercel siguen intactos hasta que tú decidas). Las 4 imágenes `assets/captura-3d-*.webp` (y las páginas HTML actualizadas) se suben con "Add file → Upload files" en GitHub, eligiendo esa rama.

## Paso 2 — Crear el proyecto en Cloudflare Pages
Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → elige tu repo y la rama `cloudflare`.
- Framework preset: *None* · **Build command: `sh build.sh`** · **Build output directory: `dist`**.
Al terminar te da una dirección `…pages.dev`. Después: **Custom domains** para conectar tu dominio.
Cuando todo funcione, cambia la *Production branch* a la rama `cloudflare` (o fusiónala a `main`).

## Paso 3 — Base de datos (Upstash Redis)
upstash.com → crear base **Redis** (plan gratis; elige región cercana). En la pestaña *REST API* copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.

## Paso 4 — Correos (Resend)
Cuenta en resend.com → **Domains** (agrega y verifica tu dominio) → **API Keys**.
Variables: `RESEND_API_KEY` y `MAIL_FROM` = `Grupo AVICH <licencias@tudominio.com>`.

## Paso 5 — Archivo de la extensión (Cloudflare R2)
1. Cloudflare → R2 → crear bucket (por ejemplo `avich-descargas`). **Déjalo privado.**
2. Sube tu `.rbz` con el nombre `avich_3d.rbz`.
3. R2 → **Manage API tokens** → crear token con permiso *Object Read* sobre ese bucket. Copia Access Key ID y Secret.
Variables: `R2_ACCOUNT_ID` (está en la página de R2), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AVICH_ARCHIVO_R2` = `avich_3d.rbz`.
Cada vez que publiques versión nueva: sube el .rbz a R2 y cambia `AVICH_VERSION_ACTUAL` (por ejemplo `1.0.5`) y opcionalmente `AVICH_NOTAS_VERSION`; luego **Retry deployment** (las variables nuevas se aplican en el siguiente despliegue).

## Paso 6 — Paddle (empieza en **Sandbox**)
Usa primero el entorno de pruebas (sandbox-vendors.paddle.com); mismos pasos luego en producción.
1. **Catalog → Products**: crea el producto "AVICH 3D" con 4 **precios recurrentes** (USD):
   Personal mensual 6.99 · Personal anual 60.99 · Empresarial mensual 29.99 · Empresarial anual 319.99. Copia cada ID (`pri_…`).
   Crea también el producto **"AVICH Sistemas"** con 4 precios: Personal mensual 4.99 (recurrente) · Personal **vitalicio** 34.99 (**pago único**) · Empresa mensual 17.99 (recurrente) · Empresa **vitalicio** 119 (**pago único**). Copia esos 4 IDs también.
2. **Developer Tools → Authentication**: crea una **API key** (servidor) y un **Client-side token** (público).
3. **Developer Tools → Notifications**: nuevo destino `https://TU-DOMINIO/api/paddle-webhook` con los eventos
   `transaction.completed`, `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, y además **`adjustment.created`** y **`adjustment.updated`** (reembolsos y contracargos: revocan la licencia automáticamente). Copia el **secret** del destino.
4. **Checkout → Checkout settings**: pon como *Default payment link* `https://TU-DOMINIO/mi-cuenta/`.

## Paso 7 — Variables en Cloudflare (Pages → tu proyecto → Settings → Variables and Secrets)
Agrégalas en **Production** (y en Preview si quieres probar ahí). Las claves secretas márcalas como **Secret**.
| Variable | Valor |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | del paso 3 |
| `PADDLE_ENV` | `sandbox` (luego `production`) |
| `PADDLE_API_KEY` | la API key |
| `PADDLE_WEBHOOK_SECRET` | el secret del destino de notificaciones |
| `PADDLE_PRICE_PERSONAL_MENSUAL` / `_PERSONAL_ANUAL` / `_EMPRESARIAL_MENSUAL` / `_EMPRESARIAL_ANUAL` | los 4 `pri_…` |
| `SESSION_SECRET` | una frase larga y aleatoria (32+ caracteres) |
| `RESEND_API_KEY`, `MAIL_FROM` | del paso 4 |
| `R2_*`, `AVICH_ARCHIVO_R2`, `AVICH_VERSION_ACTUAL` | del paso 5 |
| `SITE_URL` (opcional) | `https://tu-dominio` (para los enlaces de los correos) |
| `PADDLE_PRICE_SIS_PERSONAL_MENSUAL` / `_SIS_PERSONAL_VITALICIO` / `_SIS_EMPRESA_MENSUAL` / `_SIS_EMPRESA_VITALICIO` | los 4 `pri_…` de **AVICH Sistemas** (paso 6) |
| **AVICH Sistemas** (mismos valores que tenías en Vercel) | `SIGNING_PRIVATE_KEY` (¡la MISMA de siempre!), `ADMIN_PASSWORD`, `SESSION_SECRET`, `BIBLIOTECA_CLAVE`, `MIN_EXTENSION`, y los `R2_*`. **Ya no se usa `LS_STORE_ID`.** |

Después de guardar, haz **Retry deployment** (o un nuevo commit).

## Paso 8 — Activar el checkout en la página
Edita `assets/pagos-config.js`: pon `entorno: 'sandbox'`, tu `tokenCliente` y los 8 `pri_…` (4 de AVICH 3D y 4 de AVICH Sistemas). Sube el cambio.
Mientras `tokenCliente` esté vacío, los botones "Comprar" siguen abriendo un correo (la página no se rompe).

## Paso 8b — Pasar AVICH Sistemas a Cloudflare + Paddle
AVICH Sistemas ya **no usa Lemon Squeezy**: sus licencias son las mismas claves `AVICH-XXXX-XXXX-XXXX-XXXX` de AVICH 3D (base de datos Upstash), creadas por el webhook de Paddle cuando alguien compra.
1. Copia las variables de Sistemas (tabla del paso 7). `SIGNING_PRIVATE_KEY` debe ser **la misma clave privada de siempre**: tu extensión trae la clave pública y, si cambia, no reconocería el catálogo firmado. Funciona con `\n` o con saltos de línea reales, PKCS#1 o PKCS#8.
2. **CORS del bucket R2:** el panel `/admin` sube archivos directo a R2 desde el navegador. En R2 → tu bucket → Settings → **CORS policy**, agrega tu nueva dirección (`https://tu-proyecto.pages.dev` y tu dominio) con métodos `PUT`, `GET`, `HEAD` y cabeceras `*`.
3. Entra a `/admin`, pulsa **Diagnóstico** y confirma que todo salga en verde (incluida la base de datos).
4. **Cómo funciona la licencia en la extensión de Sistemas** (hay que programarlo en ella):
   - Al activar: `POST /api/licencia` con `{ accion:'activar', clave, equipo_id, equipo_nombre, producto:'sistemas' }`. Cada equipo cuenta dentro del límite del plan (Personal 1 · Empresa mensual 6 · Empresa vitalicio 10).
   - Luego, en `/api/catalogo`, `/api/descargar` y `/api/actualizacion`, manda `licencia: <clave>` e `instancia: <equipo_id>` (el mismo id con el que activó). Si el equipo no está activado, solo tiene la prueba gratuita.
   - **Vitalicio:** la licencia no vence, y el acceso a la biblioteca sigue siempre; pero las **actualizaciones de la extensión** se descargan solo durante 12 meses desde la compra (respuesta `actualizaciones_vencidas`).
   - Las licencias se pueden quitar de un equipo desde **Mi cuenta** o con `tools/licencias.mjs`.
5. **La dirección** `https://grupoavich.vercel.app/api/...` está escrita en tu extensión. Hay que cambiarla por tu nuevo dominio y publicar una versión nueva. Mientras tanto **no apagues Vercel**.
6. El panel admin calcula la huella SHA-256 **en tu navegador** (el plan gratis de Cloudflare solo tiene 10 ms de CPU por petición).

## Paso 9 — Probar de punta a punta (sandbox)
1. En `/3d/#precios` pulsa **Comprar** → tarjeta de prueba `4242 4242 4242 4242`, vencimiento futuro, CVC `100`.
2. Paddle → Notifications → ver que el webhook salió con **200**.
3. Debe llegar el correo con la clave y aparecer en `/mi-cuenta/` (entra con ese correo).
4. Prueba cancelar desde "Administrar suscripción" y mira cómo cambia el estado.
Si algo falla: Cloudflare → tu proyecto Pages → **Functions → Real-time logs**.

## Paso 10 — El plugin
Copia `plugin/licencia.rb` a la carpeta de la extensión y cárgalo desde `main.rb`:
```ruby
require_relative 'licencia'

# Menú Extensiones > Avich 3D > "Activar licencia"
UI.menu('Extensions').add_item('Avich 3D: Activar licencia') { Avich3D::Licencia.dialogo_activar }

# Al iniciar (sin congelar SketchUp):
Avich3D::Licencia.validar_async(false) do |r|
  UI.messagebox(r['mensaje']) unless r['ok']   # opcional: bloquear funciones si !r['ok']
end

# Para habilitar/bloquear una herramienta sin usar internet:
return UI.messagebox('Activa tu licencia de AVICH 3D.') unless Avich3D::Licencia.vigente?

# Actualizaciones:
r = Avich3D::Licencia.buscar_actualizacion(Avich3D::VERSION)
Avich3D::Licencia.descargar_e_instalar(r['url']) if r['ok'] && r['hay_nueva']
```
Sin internet la licencia sigue funcionando 7 días; si el servidor responde que está vencida/quitada, se bloquea al instante.
Un licenciamiento en Ruby lo puede esquivar alguien técnico editando el código; protege al cliente honesto. Distribuir el código ofuscado/cifrado ayuda.

## Paso 11 — Pasar a producción
1. Pide la **aprobación** de tu cuenta de Paddle (verificación de negocio + revisión del sitio: precios, términos, privacidad, reembolsos).
2. Repite el paso 6 en producción (nuevos IDs, API key, token y secret).
3. Cambia las variables en Cloudflare (`PADDLE_ENV=production`, claves nuevas) y `assets/pagos-config.js` (`entorno: 'production'`, token `live_…`).
4. Haz una compra real pequeña y reembólsala para confirmar todo el flujo.

## Plan Personalizado y administración manual
```
export UPSTASH_REDIS_REST_URL=...   UPSTASH_REDIS_REST_TOKEN=...   (copiados de Upstash)
node tools/licencias.mjs crear cliente@empresa.com "Personalizado" 12 365 --enviar
node tools/licencias.mjs correo cliente@empresa.com
node tools/licencias.mjs revocar AVICH-XXXX-XXXX-XXXX-XXXX
```

## Pendientes y avisos honestos
- Probé todo contra **simulaciones** (Redis, Paddle, Lemon Squeezy, correo y R2 falsos): 47 pruebas de AVICH 3D + Sistemas (compras, vitalicio, reembolsos), 37 de la API de Sistemas y 18 del cliente Ruby. Las firmas de R2 (URLs y cabeceras) son **idénticas** a las del SDK oficial de AWS, y la firma RSA del catálogo es idéntica a la que daba Node. Cloudflare compila todas las funciones. **No** se ha probado contra los servicios reales: por eso el paso 9 (sandbox) y el diagnóstico de `/admin` son obligatorios.
- **Plan gratis de Cloudflare = 10 ms de CPU por petición.** Todo cabe holgado salvo un caso: `/api/descargar` con **muchas miniaturas en un solo pedido** (hasta 300 URLs firmadas ≈ 25–30 ms de CPU medidos en Node). Si la biblioteca tiene más de ~100 elementos y ves errores 1102 ("exceeded CPU"), sube al plan **Workers Paid (US$5/mes)**, que lo resuelve sin tocar código.
- **Clientes antiguos de Lemon Squeezy:** si ya vendiste claves por Lemon Squeezy, esas claves **ya no se validan**. Crea sus licencias nuevas con `node tools/licencias.mjs crear correo "Personal" 1 36500 --enviar --sistemas`.
- Reembolsos: el evento `adjustment.updated` de Paddle (reembolso total aprobado) revoca la licencia. Es el único código que escribí sin poder confirmar los nombres exactos de los campos con una cuenta real de Paddle; pruébalo en sandbox haciendo un reembolso.
- Las etiquetas `canonical`/`og:url` de las páginas aún dicen `grupoavich.vercel.app`; cuando tengas tu dominio definitivo, cámbialas.
- **Yape** no es posible con Paddle.
- Si más adelante quieres precios regionales o impuestos distintos, se configuran en Paddle, no en el código.

