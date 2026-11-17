'use strict';
/**
 * Servidor local con páginas SIMULADAS del rastreo de Shalom. Todos los datos
 * son ficticios (órdenes 1000000xx, "PERSONA DE PRUEBA", DNI 00000000).
 *
 * Variantes:
 *  /rastrea            Marcado con clases Tailwind como el que leía la versión original.
 *  /rastrea-semantico  Sin clases de estilo: encabezados y data-testid.
 *  /http-503-luego-ok  503 en la primera visita, luego /rastrea (prueba de reintento).
 *  /siempre-503, /http-403, /sin-formulario, /captcha-inicial
 */
const http = require('node:http');

const ESCENARIOS = {
  100000001: { titulo: 'En tránsito', barra: 1, cabecera: '01/11/26 a las 10:15', lineas: [] },
  100000002: {
    titulo: 'En destino', barra: 2, cabecera: 'Registrado el 10/11/26 a las 08:00',
    lineas: ['Llegó a destino: 14/11/26 a las 09:30', 'Plazo de recojo hasta el 21/11/26'],
  },
  100000003: {
    titulo: 'Entregado', barra: 3, cabecera: 'Registrado el 10/11/26 a las 08:00',
    lineas: ['En destino', '14/11/26 a las 09:30'],
    detalle: 'Entregado a PERSONA DE PRUEBA con DNI 00000000 el 16/11/26 a las 16:40. Teléfono 999 888 777. Dirección Av. Ficticia 123',
  },
  100000005: { soloCabecera: true },
  100000007: { titulo: 'En tránsito', barra: 1, ordenMostrada: '100000999', lineas: [] },
  100000009: { titulo: 'En destino', barra: 2, lineas: [] },
  100000010: { titulo: null, barra: 3, lineas: [] },
  100000011: { titulo: 'Devuelto', barra: null, lineas: [] },
  100000012: { titulo: 'Entregado', barra: 3, cabecera: '31/02/26 a las 10:00', lineas: ['Fecha de entrega: 99/99/26'] },
};

function pagina({ semantico }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Rastrea tu envío (simulado)</title>
<style>.oculto{display:none}.relative{position:relative}.absolute{position:absolute}.text-silver-title{color:#888}</style></head>
<body>
<h1>Rastrea tu envío</h1>
<form id="f" onsubmit="return false">
  <label for="o">N° de Orden</label><input id="o" type="text">
  <label for="c">Código de Orden</label><input id="c" type="text">
  <button type="submit" id="b">Buscar</button>
</form>
<div class="oculto" role="alert">No se encontró la orden</div>
<div id="plantilla" class="oculto"><p>N° DE ORDEN: 000000000</p></div>
<div id="r"></div>
<footer><small>Este sitio está protegido por reCAPTCHA (texto fijo, no es un reto).</small></footer>
<script>
const ESC = ${JSON.stringify(ESCENARIOS)};
const SEM = ${semantico ? 'true' : 'false'};
document.getElementById('b').addEventListener('click', () => {
  const o = document.getElementById('o').value.trim();
  const c = document.getElementById('c').value.trim();
  const r = document.getElementById('r');
  setTimeout(() => {
    if (o === '100000006') return; // nunca responde
    if (o === '100000008') {
      const f = document.createElement('iframe');
      f.src = '/simulado/recaptcha/api2/bframe?k=x';
      f.style.width = '400px'; f.style.height = '500px';
      document.body.appendChild(f); return;
    }
    const e = ESC[o];
    if (!e || !/^[A-Z0-9]{4}$/.test(c)) {
      r.innerHTML = '<div role="alert">No se encontró la orden. Verifica los datos.</div>'; return;
    }
    const num = e.ordenMostrada || o;
    if (e.soloCabecera) { r.innerHTML = '<div><div><div><div><p>N° DE ORDEN: ' + num + '</p></div></div></div></div>'; return; }
    const barra = e.barra === null ? '' : '<div class="relative"><div class="absolute">' +
      [0,1,2].map(i => '<div class="' + (i < e.barra ? 'bg-red-600' : 'bg-gray') + '"></div>').join('') + '</div></div>';
    const titulo = e.titulo ? (SEM ? '<h2 data-testid="estado-envio">' + e.titulo + '</h2>' : '<div class="text-4xl">' + e.titulo + '</div>') : '';
    const detalle = e.detalle ? (SEM ? '<p data-testid="detalle-envio">' : '<p class="text-silver-title">') + e.detalle + '</p>' : '';
    r.innerHTML = '<section><div>' + titulo + '<div><div><p>N° DE ORDEN: ' + num + '</p>' +
      '<p>' + (e.cabecera || '') + '</p></div></div>' +
      (e.lineas || []).map(l => '<p>' + l + '</p>').join('') + detalle + barra + '</div></section>';
  }, 400);
});
</script></body></html>`;
}

function iniciar() {
  const visitas = new Map();
  const srv = http.createServer((req, res) => {
    const ruta = new URL(req.url, 'http://x').pathname;
    const n = (visitas.get(ruta) || 0) + 1;
    visitas.set(ruta, n);
    const html = (cuerpo, status = 200) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(cuerpo); };
    switch (ruta) {
      case '/rastrea': return html(pagina({ semantico: false }));
      case '/rastrea-semantico': return html(pagina({ semantico: true }));
      case '/http-503-luego-ok': return n === 1 ? html('Servicio no disponible', 503) : html(pagina({ semantico: false }));
      case '/siempre-503': return html('Servicio no disponible', 503);
      case '/http-403': return html('Forbidden', 403);
      case '/sin-formulario': return html('<!doctype html><html><body><h1>Nuevo diseño</h1><input placeholder="Buscar en el sitio"></body></html>');
      case '/captcha-inicial': return html('<!doctype html><html><body><p>Verifica que eres humano para continuar (CAPTCHA).</p></body></html>');
      default: return html('<!doctype html><html><body><p>Ruta simulada desconocida</p></body></html>');
    }
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ base: `http://127.0.0.1:${port}`, visitas, cerrar: () => new Promise((r) => srv.close(r)) });
    });
  });
}

module.exports = { iniciar, ESCENARIOS };
