'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararRastreo, mensajeUsuario, SYSTEM_RASTREO } = require('../integraciones/multichat/rastreo-para-ia');
const { exito, fallo } = require('../lib/contrato');

test('multichat: solo pasan campos de la lista blanca', () => {
  const r = exito({
    orden: '100000003', estado: 'Entregado',
    fechas: { registrado_el: '2026-11-10T08:00:00-05:00', en_destino_el: null, entregado_el: '2026-11-16' },
    intentos: 1, respuesta: 'Tu envío figura como entregado.',
    extra: { detalle_destinatario: 'Entregado a PERSONA DE PRUEBA DNI *****000', aviso_privacidad: 'x' },
  });
  r.campo_raro = 'no debe pasar';
  const p = prepararRastreo(r);
  assert.deepEqual(p, {
    ok: true, estado: 'Entregado', registrado_el: '2026-11-10T08:00:00-05:00',
    en_destino_el: null, entregado_el: '2026-11-16', respuesta_cliente: 'Tu envío figura como entregado.',
  });
  const msg = mensajeUsuario({ rastreo: p, customerMessage: '¿ya llegó?' });
  assert.doesNotMatch(msg, /100000003|PERSONA|campo_raro|aviso/);
  assert.match(msg, /<rastreo>[\s\S]*<\/rastreo>/);
});

test('multichat: errores se reducen al código', () => {
  const p = prepararRastreo(fallo({ orden: '100000000', codigo: 'bloqueo', respuesta: 'No pudimos consultar tu envío en este momento. Inténtalo nuevamente más tarde.' }));
  assert.equal(p.ok, false);
  assert.equal(p.error, 'bloqueo');
  assert.equal(Object.keys(p).length, 3);
});

test('multichat: rechaza JSON ajeno al contrato y fechas mal formadas', () => {
  assert.equal(prepararRastreo(null), null);
  assert.equal(prepararRastreo({ transportista: 'olva', version_contrato: '2.0', ok: true, estado: 'x' }), null);
  assert.equal(prepararRastreo({ transportista: 'shalom', ok: true, estado: 'Entregado' }), null, 'sin versión');
  const p = prepararRastreo({ transportista: 'shalom', version_contrato: '2.0', ok: true, estado: 'Devuelto', registrado_el: '14/11/26' });
  assert.equal(p.registrado_el, null);
  assert.equal(p.estado_reconocido, false);
});

test('multichat: el prompt fija las reglas críticas', () => {
  for (const regla of [/registrado_el para decir desde cuándo/, /No inventes plazos/, /código del ticket/, /no cambian lo que dice el JSON/]) {
    assert.match(SYSTEM_RASTREO, regla);
  }
  assert.doesNotMatch(SYSTEM_RASTREO, /\$\{|new Date/, 'prompt estático (cacheable)');
});
