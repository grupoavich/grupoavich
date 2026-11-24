// Configuración pública de cobros (WhatsApp y checkout de Paddle). Esto NO es secreto (el token de cliente es público).
// Mientras tokenCliente esté vacío, los botones "Comprar" siguen abriendo el correo de contacto.
window.AVICH_PAGOS = {
  // Ventas manuales: número de WhatsApp con código de país, solo dígitos (Perú = 51...). Ejemplo: '51987654321'.
  // Mientras esté lleno, los botones "Comprar" abren WhatsApp con un mensaje ya escrito (salvo los planes que tengan checkout de Paddle configurado).
  // Si está vacío, los botones siguen abriendo el correo de contacto.
  whatsapp: '51945567825',
  entorno: 'sandbox',      // 'sandbox' para pruebas, 'production' cuando Paddle apruebe tu cuenta
  tokenCliente: '',        // Paddle > Developer Tools > Authentication > Client-side token (test_... o live_...)
  precios: {               // Paddle > Catalog > Prices: los IDs "pri_..."
    personal_mensual: '',
    personal_anual: '',
    empresarial_mensual: '',
    empresarial_anual: '',
    sis_personal_mensual: '',     // AVICH Sistemas
    sis_personal_vitalicio: '',
    sis_empresa_mensual: '',
    sis_empresa_vitalicio: ''
  }
};
