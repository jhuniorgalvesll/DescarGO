'use strict';
/**
 * Respuestas para el cliente final: español sencillo, sin plazos, requisitos
 * ni ubicaciones que la página no haya mostrado. Solo usa fechas verificadas.
 */

const FALLIDA = 'No pudimos consultar tu envío en este momento. Inténtalo nuevamente más tarde.';

function fechaLegible(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  const fecha = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? `${fecha} a las ${m[4]}:${m[5]}` : fecha;
}

function respuestaExito({ estado, estado_reconocido: reconocido = true }, fechas = {}) {
  switch (estado) {
    case 'En origen':
      return 'Tu envío figura en la agencia de origen.';
    case 'En tránsito':
      return 'Tu envío está en tránsito.';
    case 'En destino': {
      const f = fechaLegible(fechas.en_destino_el);
      return `Tu envío ya está en la agencia de destino.${f ? ` Llegó el ${f}.` : ''}`;
    }
    case 'Entregado': {
      const f = fechaLegible(fechas.entregado_el);
      return `Tu envío figura como entregado.${f ? ` Fecha de entrega: ${f}.` : ''}`;
    }
    default:
      return reconocido === false && estado
        ? `En Shalom, tu envío figura con el estado «${estado}».`
        : FALLIDA;
  }
}

function respuestaError(codigo) {
  switch (codigo) {
    case 'datos_invalidos':
      return 'Revisa el número de orden y el código de 4 caracteres de tu ticket, por favor.';
    case 'no_encontrada':
      return 'No encontramos un envío con esos datos. Revisa el número de orden y el código de tu ticket, por favor.';
    default:
      return FALLIDA;
  }
}

module.exports = { respuestaExito, respuestaError, fechaLegible, FALLIDA };
