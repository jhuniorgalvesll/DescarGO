'use strict';
/**
 * Saneamiento de datos personales. Se aplica a todo texto que pueda salir del
 * script por canales distintos al campo opcional de --con-destinatario.
 */

// DNI (8 dígitos), CE / RUC / teléfonos (7 a 12 dígitos), con o sin separadores.
const RE_NUMERO_LARGO = /(?<![\d/:])\d(?:[\s.-]?\d){6,11}(?![\d/:])/g;
const RE_TELEFONO = /(?:\+?51[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g;
// Direcciones peruanas habituales, hasta el siguiente punto, coma o punto y coma.
const RE_DIRECCION = /(?:direcci[óo]n\s*:?\s*)?(?<!\p{L})(?:av(?:enida)?\.?|jr\.?|jir[óo]n|calle|ca\.|psje\.?|pasaje|mz\.?|lt\.?|urb\.?|asoc\.?|aa\.?\s*hh\.?)\s+[^.;,\n]*(?:\.(?=\s*\d)[^.;,\n]*)*/giu;

/** Enmascara números largos (DNI, teléfonos, documentos) por completo. */
function enmascararNumeros(texto) {
  return String(texto).replace(RE_TELEFONO, '[teléfono]').replace(RE_NUMERO_LARGO, '[número]');
}

/** Quita el código del ticket (y la orden si se pide) de un texto técnico. */
function quitarSecretos(texto, { codigo, orden } = {}) {
  let t = String(texto ?? '');
  if (codigo) t = t.split(codigo).join('****').split(codigo.toLowerCase()).join('****');
  if (orden) t = t.split(orden).join('[orden]');
  return enmascararNumeros(t).slice(0, 300);
}

/**
 * Versión para --con-destinatario: conserva el texto de Shalom (nombre de
 * quien recogió) pero deja solo los 3 últimos dígitos del DNI y oculta
 * teléfonos y direcciones.
 */
function detalleParaVendedor(texto) {
  if (!texto) return null;
  return String(texto)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(RE_DIRECCION, '[dirección]')
    .replace(RE_TELEFONO, '[teléfono]')
    .replace(/(?<![\d/:])(\d{5})(\d{3})(?![\d/:])/g, '*****$2')
    .replace(RE_NUMERO_LARGO, '[número]')
    .slice(0, 300);
}

module.exports = { enmascararNumeros, quitarSecretos, detalleParaVendedor };
