'use strict';

const RE_ORDEN = /^\d{8,12}$/;
const RE_CODIGO = /^[A-Za-z0-9]{4}$/;

/**
 * Valida y normaliza los datos del ticket. Acepta espacios alrededor y
 * minúsculas en el código. No devuelve ni registra el código si es inválido.
 */
function validarEntrada(ordenCruda, codigoCrudo) {
  const orden = String(ordenCruda ?? '').trim();
  const codigo = String(codigoCrudo ?? '').trim();
  const ordenOk = RE_ORDEN.test(orden);
  const codigoOk = RE_CODIGO.test(codigo);
  return {
    ok: ordenOk && codigoOk,
    orden: ordenOk ? orden : null,
    codigo: ordenOk && codigoOk ? codigo.toUpperCase() : null,
    problemas: [
      ...(ordenOk ? [] : ['orden: debe tener de 8 a 12 dígitos']),
      ...(codigoOk ? [] : ['codigo: debe tener 4 letras o números']),
    ],
  };
}

module.exports = { validarEntrada, RE_ORDEN, RE_CODIGO };
