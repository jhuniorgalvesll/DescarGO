'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { validarEntrada } = require('../lib/validar');
const {
  fechaIso, normalizarEstado, estadoPorBarra, extraerFechas, numeroOrdenMostrado, interpretarResultado,
} = require('../lib/interpretar');
const { respuestaExito, respuestaError, FALLIDA } = require('../lib/respuesta');
const { quitarSecretos, detalleParaVendedor } = require('../lib/privacidad');
const { exito, fallo, codigoSalida, ERRORES, ErrorRastreo } = require('../lib/contrato');
const { urlRastreo, acotar, LIMITES, URL_PUBLICA } = require('../lib/config');
const { clasificarError } = require('../lib/pagina');

const CLAVES = [
  'transportista', 'version_contrato', 'orden', 'ok', 'estado', 'registrado_el', 'en_destino_el',
  'entregado_el', 'consultado_en', 'intentos', 'respuesta_cliente', 'error',
].sort();

test('validación de datos del ticket', () => {
  assert.deepEqual(validarEntrada(' 100000000 ', 'ab12'), { ok: true, orden: '100000000', codigo: 'AB12', problemas: [] });
  for (const [o, c] of [['1234567', 'AB12'], ['1234567890123', 'AB12'], ['10000000a', 'AB12'], ['100000000', 'AB1'],
    ['100000000', 'AB123'], ['100000000', 'AB-1'], [undefined, undefined], ['', ''], ['100000000', 'ÁB12']]) {
    const r = validarEntrada(o, c);
    assert.equal(r.ok, false, `${o} ${c}`);
    assert.equal(r.codigo, null, 'nunca devuelve un código inválido');
  }
  assert.equal(validarEntrada('12345678', 'AB12').ok, true, '8 dígitos');
  assert.equal(validarEntrada('123456789012', 'AB12').ok, true, '12 dígitos');
});

test('fechas: formato de Shalom a ISO con zona de Lima', () => {
  assert.equal(fechaIso('01/03/26 a las 10:15'), '2026-03-01T10:15:00-05:00');
  assert.equal(fechaIso('el 4/3/2026 16:40 hrs'), '2026-03-04T16:40:00-05:00');
  assert.equal(fechaIso('14/11/26'), '2026-11-14');
  assert.equal(fechaIso('31/02/26 a las 10:00'), null, 'fecha imposible');
  assert.equal(fechaIso('99/99/26'), null);
  assert.equal(fechaIso('sin fecha'), null);
  assert.equal(fechaIso(null), null);
  assert.equal(fechaIso('14/11/26 a las 25:61'), '2026-11-14', 'hora inválida: solo la fecha');
});

test('fechas: solo se asignan las identificadas por su etiqueta', () => {
  const f = extraerFechas({
    titulo: 'En destino',
    lineas: [
      'En destino',
      'N° DE ORDEN: 100000002',
      '01/11/26 a las 10:15', // sin etiqueta: no es registro ni llegada
      'Registrado el 10/11/26 a las 08:00',
      'Llegó a destino: 14/11/26 a las 09:30',
      'Plazo de recojo hasta el 21/11/26', // plazo: no es un hecho
      'Fecha estimada de entrega 20/11/26', // estimación: se ignora
    ],
  });
  assert.deepEqual(f, {
    registrado_el: '2026-11-10T08:00:00-05:00',
    en_destino_el: '2026-11-14T09:30:00-05:00',
    entregado_el: null,
  });
});

test('fechas: la fecha bajo el título del estado no se asume', () => {
  const f = extraerFechas({ titulo: 'En destino', lineas: ['En destino', '14/11/26 a las 09:30'] });
  assert.equal(f.en_destino_el, null);
  const g = extraerFechas({ titulo: 'Entregado', lineas: ['Entregado', 'En destino', '14/11/26 a las 09:30'] });
  assert.equal(g.en_destino_el, '2026-11-14T09:30:00-05:00', 'etiqueta propia en la línea anterior');
});

test('fechas ausentes → null en las tres', () => {
  assert.deepEqual(extraerFechas({ lineas: ['En tránsito', 'N° DE ORDEN: 100000001'] }),
    { registrado_el: null, en_destino_el: null, entregado_el: null });
  assert.deepEqual(extraerFechas({}), { registrado_el: null, en_destino_el: null, entregado_el: null });
});

test('estado: normalización y barra de progreso', () => {
  assert.equal(normalizarEstado('  EN TRÁNSITO '), 'En tránsito');
  assert.equal(normalizarEstado('En transito'), 'En tránsito');
  assert.equal(normalizarEstado('En destino'), 'En destino');
  assert.equal(normalizarEstado('Entregado'), 'Entregado');
  assert.equal(normalizarEstado('En origen'), 'En origen');
  assert.equal(normalizarEstado('Devuelto'), null);
  assert.equal(estadoPorBarra({ completos: 3, totales: 3 }), 'Entregado');
  assert.equal(estadoPorBarra({ completos: 0, totales: 3 }), 'En origen');
  assert.equal(estadoPorBarra({ completos: 2, totales: 5 }), null, 'barra desconocida');
  assert.equal(estadoPorBarra(null), null);
});

test('número de orden mostrado', () => {
  assert.equal(numeroOrdenMostrado('N° DE ORDEN: 100000000'), '100000000');
  assert.equal(numeroOrdenMostrado(['N° DE ORDEN: 01/03/26', 'N° DE ORDEN:\n100000000']), '100000000');
  assert.equal(numeroOrdenMostrado('N° DE ORDEN: 100000001 01/11/26 a las 10:15'), '100000001', 'no pega la fecha');
  assert.equal(numeroOrdenMostrado('N° DE ORDEN: 100000001 0111'), '100000001');
  assert.equal(numeroOrdenMostrado('Nº de orden 100000000'), '100000000');
  assert.equal(numeroOrdenMostrado('sin número'), null);
});

test('interpretar: comprueba que el resultado sea de la orden consultada', () => {
  const crudo = { hayResultado: true, textoOrden: 'N° DE ORDEN: 100000999', titulo: 'En tránsito', lineas: [] };
  assert.throws(() => interpretarResultado(crudo, '100000001'), (e) => e.codigo === 'orden_no_coincide');
  assert.throws(() => interpretarResultado({ ...crudo, textoOrden: 'nada' }, '100000999'), (e) => e.codigo === 'pagina_cambio');
  assert.equal(interpretarResultado({ ...crudo, textoOrden: 'N° DE ORDEN: 0100000999' }, '100000999').estado, 'En tránsito');
});

test('interpretar: página cambiada sin estado legible', () => {
  assert.throws(() => interpretarResultado(null, '1'), (e) => e.codigo === 'pagina_cambio');
  const base = { hayResultado: true, textoOrden: 'N° DE ORDEN: 100000005', lineas: [] };
  assert.throws(() => interpretarResultado({ ...base, titulo: null, barra: null }, '100000005'), (e) => e.codigo === 'pagina_cambio');
  assert.throws(() => interpretarResultado({ ...base, titulo: 'Total 12345 resultados en la lista larga de la página' }, '100000005'),
    (e) => e.codigo === 'pagina_cambio');
  const r = interpretarResultado({ ...base, titulo: 'Devuelto' }, '100000005');
  assert.equal(r.estado, 'Devuelto');
  assert.equal(r.estado_reconocido, false);
});

test('interpretar: no afirma entrega ni llegada que el estado no respalda', () => {
  const r = interpretarResultado({
    hayResultado: true, textoOrden: 'N° DE ORDEN: 100000001', titulo: 'En tránsito',
    lineas: ['Entregado el 16/11/26', 'Llegó a destino 14/11/26'],
  }, '100000001');
  assert.equal(r.entregado_el, undefined);
  assert.deepEqual(r.fechas, { registrado_el: null, en_destino_el: null, entregado_el: null });
});

test('respuestas al cliente', () => {
  assert.equal(respuestaExito({ estado: 'En tránsito' }), 'Tu envío está en tránsito.');
  assert.equal(respuestaExito({ estado: 'En destino' }, {}), 'Tu envío ya está en la agencia de destino.');
  assert.equal(respuestaExito({ estado: 'En destino' }, { en_destino_el: '2026-11-14T09:30:00-05:00' }),
    'Tu envío ya está en la agencia de destino. Llegó el 14/11/2026 a las 09:30.');
  assert.equal(respuestaExito({ estado: 'Entregado' }, { entregado_el: '2026-11-16' }),
    'Tu envío figura como entregado. Fecha de entrega: 16/11/2026.');
  assert.equal(respuestaExito({ estado: 'Entregado' }, {}), 'Tu envío figura como entregado.');
  assert.equal(respuestaExito({ estado: 'En destino' }, { registrado_el: '2026-11-10' }),
    'Tu envío ya está en la agencia de destino.', 'la fecha de registro nunca se usa como llegada');
  for (const c of ['conexion', 'tiempo_espera', 'bloqueo', 'pagina_cambio', 'orden_no_coincide', 'dependencia', 'interno']) {
    assert.equal(respuestaError(c), FALLIDA);
  }
  const todas = [respuestaExito({ estado: 'En destino' }, { en_destino_el: '2026-11-14' }), respuestaExito({ estado: 'Entregado' })];
  for (const t of todas) assert.doesNotMatch(t, /plazo|clave|días|horario|DNI|recoger antes/i, 'no inventa requisitos');
});

test('privacidad: saneamiento de textos técnicos y detalle', () => {
  const t = quitarSecretos('fill("AB12") en orden 100000000 tel 987654321 dni 12345678', { codigo: 'AB12' });
  assert.doesNotMatch(t, /AB12|ab12|987654321|12345678/);
  assert.doesNotMatch(quitarSecretos('x ab12 x', { codigo: 'AB12' }), /ab12/i);
  const d = detalleParaVendedor('Entregado a PERSONA DE PRUEBA con DNI 12345678 el 16/11/26 a las 16:40. Teléfono 999 888 777');
  assert.match(d, /PERSONA DE PRUEBA/);
  assert.match(d, /\*{5}678/);
  assert.doesNotMatch(d, /12345678|999 888 777/);
  assert.match(d, /16\/11\/26 a las 16:40/, 'las fechas se conservan');
  assert.equal(detalleParaVendedor(null), null);
  const dir = detalleParaVendedor('Recogió PERSONA DE PRUEBA. Dirección: Av. Ficticia 123, Lima. Jr. Inventado 456 Mz. B Lt. 7');
  assert.doesNotMatch(dir, /Ficticia|Inventado|456|Lt\. 7/);
  assert.match(dir, /PERSONA DE PRUEBA/);
});

test('contrato: mismas claves en éxito y error; códigos de salida', () => {
  const ok = exito({ orden: '100000000', estado: 'En tránsito', fechas: {}, intentos: 1, respuesta: 'x' });
  const ko = fallo({ orden: null, codigo: 'conexion', intentos: 2, respuesta: 'y' });
  assert.deepEqual(Object.keys(ok).sort(), CLAVES);
  assert.deepEqual(Object.keys(ko).sort(), CLAVES);
  assert.match(ok.consultado_en, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(ok.error, null);
  assert.deepEqual(ko.error, { codigo: 'conexion', mensaje: ERRORES.conexion.mensaje, reintentable: true });
  assert.equal(codigoSalida(ok), 0);
  const esperado = { datos_invalidos: 2, no_encontrada: 3, pagina_cambio: 4, orden_no_coincide: 4, conexion: 5, tiempo_espera: 5, bloqueo: 6, dependencia: 7, interno: 1 };
  for (const [c, s] of Object.entries(esperado)) assert.equal(codigoSalida(fallo({ codigo: c })), s, c);
  assert.equal(fallo({ codigo: 'desconocido' }).error.codigo, 'interno');
  assert.throws(() => new ErrorRastreo('inventado'));
});

test('clasificación de errores de Playwright', () => {
  const t = new Error('Timeout 30000ms exceeded.'); t.name = 'TimeoutError';
  assert.equal(clasificarError(t).codigo, 'tiempo_espera');
  assert.equal(clasificarError(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://x')).codigo, 'conexion');
  assert.equal(clasificarError(new Error("browserType.launch: Executable doesn't exist at /x")).codigo, 'dependencia');
  const e = clasificarError(new Error('locator.fill("ZZ99") falló'), { codigo: 'ZZ99' });
  assert.equal(e.codigo, 'interno');
  assert.doesNotMatch(e.tecnico, /ZZ99/);
});

test('config: URL fija salvo localhost para pruebas; límites acotados', () => {
  assert.equal(urlRastreo({}), URL_PUBLICA);
  assert.equal(urlRastreo({ SHALOM_RASTREO_URL: 'http://127.0.0.1:9/rastrea' }), 'http://127.0.0.1:9/rastrea');
  assert.throws(() => urlRastreo({ SHALOM_RASTREO_URL: 'https://otro-sitio.example/rastrea' }));
  assert.throws(() => urlRastreo({ SHALOM_RASTREO_URL: 'no-es-url' }));
  assert.equal(acotar(undefined, LIMITES.timeoutMs), 30000);
  assert.equal(acotar('1', LIMITES.timeoutMs), 5000);
  assert.equal(acotar('999999', LIMITES.timeoutMs), 90000);
  assert.equal(acotar('10', LIMITES.intentos), 3);
  assert.equal(acotar('abc', LIMITES.intentos), 2);
});
