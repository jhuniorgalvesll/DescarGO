'use strict';
const { ErrorRastreo, exito, fallo } = require('./contrato');
const { validarEntrada } = require('./validar');
const { interpretarResultado } = require('./interpretar');
const { respuestaExito, respuestaError } = require('./respuesta');
const { detalleParaVendedor, enmascararNumeros } = require('./privacidad');
const { consultarPagina } = require('./pagina');
const { LIMITES, urlRastreo, acotar } = require('./config');

/**
 * Consulta un envío de Shalom y devuelve SIEMPRE un objeto del contrato.
 * Nunca lanza excepciones; `alDepurar` recibe detalle técnico ya saneado.
 *
 * @param {object} p
 * @param {string} p.orden
 * @param {string} p.codigo
 * @param {boolean} [p.conDestinatario]  Incluye el detalle de entrega (uso privado del vendedor).
 * @param {number}  [p.timeoutMs]
 * @param {number}  [p.intentos]
 * @param {Function} [p.alDepurar]
 */
async function rastrear(p) {
  const ahora = new Date();
  const entrada = validarEntrada(p.orden, p.codigo);
  if (!entrada.ok) {
    if (p.alDepurar) p.alDepurar(`datos inválidos: ${entrada.problemas.join('; ')}`);
    return fallo({ orden: entrada.orden, codigo: 'datos_invalidos', respuesta: respuestaError('datos_invalidos'), ahora });
  }

  const timeoutMs = acotar(p.timeoutMs, LIMITES.timeoutMs);
  const intentos = acotar(p.intentos, LIMITES.intentos);

  try {
    const url = urlRastreo(p.env || process.env);
    const { crudo, intentos: usados } = await consultarPagina({
      url,
      orden: entrada.orden,
      codigo: entrada.codigo,
      timeoutMs,
      intentos,
      cargarPlaywright: p.cargarPlaywright,
      alIntentar: (n) => p.alDepurar && p.alDepurar(`intento ${n} de ${intentos} (espera máx. ${timeoutMs} ms)`),
    });
    if (p.alDepurar) {
      // Estructura del bloque para validar contra la página real, sin datos personales:
      // la línea de detalle (nombre/DNI de quien recogió) se omite y los números largos se enmascaran.
      const lineas = (crudo.lineas || []).map((l) => (crudo.detalle && l.includes(crudo.detalle.slice(0, 20))
        ? '[detalle omitido]' : enmascararNumeros(l).slice(0, 120)));
      p.alDepurar(`título leído: ${crudo.titulo ? enmascararNumeros(crudo.titulo) : '(ninguno)'}; barra: ${crudo.barra ? `${crudo.barra.completos}/${crudo.barra.totales}` : '(ninguna)'}`);
      p.alDepurar(`líneas del resultado:\n  ${lineas.join('\n  ')}`);
    }
    const r = interpretarResultado(crudo, entrada.orden);
    if (p.alDepurar) p.alDepurar(`fechas identificadas: ${JSON.stringify(r.fechas)}`);
    const extra = {};
    if (!r.estado_reconocido) extra.estado_reconocido = false;
    if (p.conDestinatario) {
      extra.detalle_destinatario = detalleParaVendedor(r.detalle);
      extra.aviso_privacidad = 'Uso interno del vendedor. No reenviar al cliente ni a grupos, no guardar.';
    }
    return exito({
      orden: entrada.orden,
      estado: r.estado,
      fechas: r.fechas,
      intentos: usados,
      respuesta: respuestaExito(r, r.fechas),
      extra,
      ahora,
    });
  } catch (e) {
    const err = e instanceof ErrorRastreo ? e : new ErrorRastreo('interno', `${e && e.name}`);
    if (p.alDepurar) p.alDepurar(`error ${err.codigo}${err.tecnico ? `: ${err.tecnico}` : ''}`);
    return fallo({
      orden: entrada.orden,
      codigo: err.codigo,
      intentos: err.intentos || 0,
      respuesta: respuestaError(err.codigo),
      ahora,
    });
  }
}

module.exports = { rastrear };
