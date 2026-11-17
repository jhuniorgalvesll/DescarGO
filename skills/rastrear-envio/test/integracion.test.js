'use strict';
/**
 * Pruebas con Chromium real contra páginas SIMULADAS servidas en 127.0.0.1.
 * No se contacta a Shalom ni se usan datos de terceros.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { iniciar } = require('./fixtures/servidor');
const { rastrear } = require('../lib/rastrear');
const { FALLIDA } = require('../lib/respuesta');

const CLI = path.join(__dirname, '..', 'scripts', 'rastrear-shalom.js');
const CODIGO = 'QX7Z'; // código ficticio que nunca debe aparecer en la salida

let srv;
test.before(async () => { srv = await iniciar(); });
test.after(async () => { await srv.cerrar(); });

const consultar = (orden, ruta = '/rastrea', extra = {}) => {
  const depuracion = [];
  return rastrear({
    orden, codigo: CODIGO, timeoutMs: 5000, intentos: 1,
    env: { SHALOM_RASTREO_URL: `${srv.base}${ruta}` },
    alDepurar: (m) => depuracion.push(m),
    ...extra,
  }).then((r) => ({ r, depuracion }));
};

function sinDatosPersonales(r, depuracion = []) {
  const todo = JSON.stringify(r) + depuracion.join('\n');
  assert.doesNotMatch(todo, new RegExp(CODIGO, 'i'), 'el código del ticket no sale');
  assert.doesNotMatch(todo, /PERSONA DE PRUEBA|00000000|999 888 777|Ficticia/, 'sin datos personales');
}

for (const ruta of ['/rastrea', '/rastrea-semantico']) {
  test(`${ruta}: en tránsito, fecha sin etiqueta no se asume`, async () => {
    const { r, depuracion } = await consultar('100000001', ruta);
    assert.equal(r.ok, true);
    assert.equal(r.estado, 'En tránsito');
    assert.deepEqual([r.registrado_el, r.en_destino_el, r.entregado_el], [null, null, null]);
    assert.equal(r.respuesta_cliente, 'Tu envío está en tránsito.');
    sinDatosPersonales(r, depuracion);
  });

  test(`${ruta}: en destino distingue registro, llegada y plazo`, async () => {
    const { r } = await consultar('100000002', ruta);
    assert.equal(r.estado, 'En destino');
    assert.equal(r.registrado_el, '2026-11-10T08:00:00-05:00');
    assert.equal(r.en_destino_el, '2026-11-14T09:30:00-05:00');
    assert.equal(r.entregado_el, null);
    assert.equal(r.respuesta_cliente, 'Tu envío ya está en la agencia de destino. Llegó el 14/11/2026 a las 09:30.');
  });

  test(`${ruta}: entregado sin datos personales en la salida habitual`, async () => {
    const { r, depuracion } = await consultar('100000003', ruta);
    assert.equal(r.estado, 'Entregado');
    assert.equal(r.en_destino_el, '2026-11-14T09:30:00-05:00');
    assert.equal(r.entregado_el, '2026-11-16T16:40:00-05:00');
    assert.equal(r.respuesta_cliente, 'Tu envío figura como entregado. Fecha de entrega: 16/11/2026 a las 16:40.');
    assert.equal('detalle_destinatario' in r, false);
    sinDatosPersonales(r, depuracion);
  });
}

test('--con-destinatario: nombre visible, DNI y teléfono enmascarados', async () => {
  const { r } = await consultar('100000003', '/rastrea', { conDestinatario: true });
  assert.match(r.detalle_destinatario, /PERSONA DE PRUEBA/);
  assert.match(r.detalle_destinatario, /\*{5}000/);
  assert.doesNotMatch(r.detalle_destinatario, /00000000|999 888 777|Ficticia/);
  assert.ok(r.aviso_privacidad);
  assert.doesNotMatch(r.respuesta_cliente, /PERSONA/);
});

test('en destino sin fechas → null y respuesta sin fecha', async () => {
  const { r } = await consultar('100000009');
  assert.equal(r.estado, 'En destino');
  assert.deepEqual([r.registrado_el, r.en_destino_el, r.entregado_el], [null, null, null]);
  assert.equal(r.respuesta_cliente, 'Tu envío ya está en la agencia de destino.');
});

test('fechas imposibles en la página → null', async () => {
  const { r } = await consultar('100000012');
  assert.equal(r.estado, 'Entregado');
  assert.equal(r.entregado_el, null);
  assert.equal(r.registrado_el, null);
});

test('estado solo por barra de progreso (respaldo)', async () => {
  const { r } = await consultar('100000010');
  assert.equal(r.ok, true);
  assert.equal(r.estado, 'Entregado');
});

test('estado nuevo no reconocido se informa tal cual', async () => {
  const { r } = await consultar('100000011');
  assert.equal(r.estado, 'Devuelto');
  assert.equal(r.estado_reconocido, false);
});

test('orden no encontrada (con alerta oculta previa en la página)', async () => {
  const { r } = await consultar('100000004');
  assert.equal(r.error.codigo, 'no_encontrada');
  assert.equal(r.error.reintentable, false);
  assert.match(r.respuesta_cliente, /Revisa el número de orden/);
});

test('resultado de otra orden → orden_no_coincide', async () => {
  const { r } = await consultar('100000007');
  assert.equal(r.error.codigo, 'orden_no_coincide');
  assert.equal(r.estado, null);
});

test('página cambiada: resultado sin estado legible', async () => {
  const { r } = await consultar('100000005');
  assert.equal(r.error.codigo, 'pagina_cambio');
});

test('página cambiada: sin formulario reconocible', async () => {
  const { r } = await consultar('100000001', '/sin-formulario');
  assert.equal(r.error.codigo, 'pagina_cambio');
});

test('CAPTCHA visible tras buscar → bloqueo, sin reintentar', async () => {
  const { r } = await consultar('100000008', '/rastrea', { intentos: 3 });
  assert.equal(r.error.codigo, 'bloqueo');
  assert.equal(r.intentos, 1);
  assert.equal(r.respuesta_cliente, FALLIDA);
});

test('CAPTCHA antes del formulario → bloqueo', async () => {
  const { r } = await consultar('100000001', '/captcha-inicial');
  assert.equal(r.error.codigo, 'bloqueo');
});

test('HTTP 403 → bloqueo', async () => {
  const { r } = await consultar('100000001', '/http-403');
  assert.equal(r.error.codigo, 'bloqueo');
});

test('tiempo de espera agotado → tiempo_espera, reintentable', async () => {
  const t0 = Date.now();
  const { r } = await consultar('100000006');
  assert.equal(r.error.codigo, 'tiempo_espera');
  assert.equal(r.error.reintentable, true);
  assert.ok(Date.now() - t0 < 15000, 'respeta el tiempo de espera');
});

test('503 transitorio se recupera con un reintento', async () => {
  const { r, depuracion } = await consultar('100000001', '/http-503-luego-ok', { intentos: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.intentos, 2);
  assert.equal(depuracion.filter((m) => m.startsWith('intento')).length, 2);
});

test('503 persistente agota los intentos → conexion', async () => {
  const { r } = await consultar('100000001', '/siempre-503', { intentos: 2 });
  assert.equal(r.error.codigo, 'conexion');
  assert.equal(r.intentos, 2);
});

test('servidor caído → conexion', async () => {
  // Puerto que acaba de quedar libre: conexión rechazada.
  const http = require('node:http');
  const tmp = http.createServer();
  await new Promise((res) => tmp.listen(0, '127.0.0.1', res));
  const { port } = tmp.address();
  await new Promise((res) => tmp.close(res));
  const r = await rastrear({
    orden: '100000001', codigo: CODIGO, timeoutMs: 5000, intentos: 1,
    env: { SHALOM_RASTREO_URL: `http://127.0.0.1:${port}/rastrea` },
  });
  assert.equal(r.error.codigo, 'conexion');
});

test('Playwright ausente → dependencia', async () => {
  const { r } = await consultar('100000001', '/rastrea', {
    cargarPlaywright: () => { throw new Error("Cannot find module 'playwright'"); },
  });
  assert.equal(r.error.codigo, 'dependencia');
});

test('Chromium no instalado → dependencia (y no queda navegador abierto)', async () => {
  const { r } = await consultar('100000001', '/rastrea', {
    cargarPlaywright: () => ({ chromium: { launch: async () => { throw new Error("browserType.launch: Executable doesn't exist at /x"); } } }),
  });
  assert.equal(r.error.codigo, 'dependencia');
});

test('el navegador se cierra aunque falle la consulta', async () => {
  const real = require('playwright');
  let cerrados = 0;
  const cargarPlaywright = () => ({
    chromium: {
      launch: async (o) => {
        const b = await real.chromium.launch(o);
        const close = b.close.bind(b);
        b.close = async () => { cerrados += 1; return close(); };
        return b;
      },
    },
  });
  const { r } = await consultar('100000007', '/rastrea', { cargarPlaywright });
  assert.equal(r.ok, false);
  assert.equal(cerrados, 1);
});

/* ------------------------------- CLI ------------------------------- */

function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, timeout: 60000 }, (err, stdout, stderr) => {
      resolve({ codigo: err ? err.code : 0, stdout, stderr, json: (() => { try { return JSON.parse(stdout); } catch { return null; } })() });
    });
  });
}

test('CLI: códigos de salida y JSON en stdout', async () => {
  const env = { SHALOM_RASTREO_URL: `${srv.base}/rastrea` };
  const casos = [
    [['100000002', CODIGO.toLowerCase(), '--timeout', '5000'], 0],
    [['123', 'X'], 2],
    [[], 2],
    [['100000004', CODIGO, '--timeout', '5000'], 3],
    [['100000007', CODIGO, '--timeout', '5000'], 4],
    [['100000008', CODIGO, '--timeout', '5000'], 6],
  ];
  for (const [args, esperado] of casos) {
    const r = await cli([...args, '--depurar'], env);
    assert.equal(r.codigo, esperado, args.join(' '));
    assert.ok(r.json, 'stdout es JSON válido');
    assert.equal(r.json.transportista, 'shalom');
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(CODIGO, 'i'), 'el código no aparece ni en stdout ni en stderr');
  }
});

test('CLI: tiempo de espera → código 5', async () => {
  const r = await cli(['100000006', CODIGO, '--timeout', '5000', '--intentos', '1'], { SHALOM_RASTREO_URL: `${srv.base}/rastrea` });
  assert.equal(r.codigo, 5);
  assert.equal(r.json.error.codigo, 'tiempo_espera');
});

test('CLI: URL alternativa fuera de localhost se rechaza', async () => {
  const r = await cli(['100000001', CODIGO], { SHALOM_RASTREO_URL: 'https://otro-sitio.example/' });
  assert.equal(r.codigo, 1);
  assert.equal(r.json.error.codigo, 'interno');
});

test('CLI: --ayuda', async () => {
  const r = await cli(['--ayuda']);
  assert.equal(r.codigo, 0);
  assert.match(r.stdout, /Uso:/);
});
