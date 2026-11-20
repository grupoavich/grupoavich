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
