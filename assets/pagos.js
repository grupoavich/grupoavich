(function () {
  var c = window.AVICH_PAGOS || {};
  var cargado = false;
  function cargar(cb) {
    if (cargado) return cb();
    var s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = function () {
      if (c.entorno === 'sandbox') window.Paddle.Environment.set('sandbox');
      window.Paddle.Initialize({ token: c.tokenCliente });
      cargado = true; cb();
    };
    s.onerror = function () { window.location.href = 'mailto:grupoavich@gmail.com?subject=Comprar%20AVICH%203D'; };
    document.head.appendChild(s);
  }
  // Ventas manuales por WhatsApp: si hay número configurado y el plan no tiene checkout de Paddle, el botón abre WhatsApp con el pedido escrito.
  function aWhatsApp() {
    var num = String(c.whatsapp || '').replace(/\D/g, '');
    if (!num) return;
    var botones = document.querySelectorAll('[data-comprar]');
    for (var i = 0; i < botones.length; i++) {
      var a = botones[i], id = c.precios && c.precios[a.getAttribute('data-comprar')];
      if (c.tokenCliente && id) continue;                       // este plan se paga con Paddle
      var m = /subject=([^&]+)/.exec(a.getAttribute('href') || ''), plan = 'AVICH';
      try { if (m) plan = decodeURIComponent(m[1]).replace(/^Comprar\s+/i, ''); } catch (err) {}
      a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hola, quiero comprar ' + plan + '. ¿Cómo hago el pago?');
      a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Comprar por WhatsApp';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aWhatsApp); else aWhatsApp();
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-comprar]') : null;
    if (!a) return;
    var id = c.precios && c.precios[a.getAttribute('data-comprar')];
    if (!c.tokenCliente || !id) return; // sin configurar: se deja funcionar el enlace de correo
    e.preventDefault();
    cargar(function () {
      window.Paddle.Checkout.open({
        items: [{ priceId: id, quantity: 1 }],
        settings: { displayMode: 'overlay', locale: 'es', successUrl: window.location.origin + '/mi-cuenta/?compra=ok' }
      });
    });
  });
})();
