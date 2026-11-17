'use strict';
/**
 * Interpretación del resultado de Shalom. Funciones puras: reciben lo que el
 * navegador extrajo de la página y deciden estado y fechas sin adivinar.
 */
const { ErrorRastreo } = require('./contrato');

const ETAPAS = Object.freeze(['En origen', 'En tránsito', 'En destino', 'Entregado']);

const ESTADOS = [
  { estado: 'Entregado', re: /^\s*entregad[oa]\b/i },
  { estado: 'En destino', re: /\ben\s+(?:la\s+)?(?:agencia\s+de\s+)?destino\b|\bdisponible\s+para\s+(?:recojo|retiro)\b/i },
  { estado: 'En tránsito', re: /\btr[aá]nsito\b|\ben\s+(?:camino|ruta)\b/i },
  { estado: 'En origen', re: /\ben\s+(?:la\s+)?(?:agencia\s+de\s+)?origen\b/i },
];

// Palabras que identifican cada fecha. Se evalúan en este orden.
const CLAVES_FECHA = [
  { campo: 'entregado_el', re: /\bentregad[oa]\b|\bfecha\s+de\s+entrega\b|\brecogid[oa]\b|\bretirad[oa]\b/i },
  // Ojo: en JS, \b no reconoce letras con tilde; por eso (?!\p{L}) con la bandera u.
  { campo: 'en_destino_el', re: /\ben\s+destino\b|\blleg[óo](?!\p{L})|\bllegada\b|\barrib[óo](?!\p{L})|\bdisponible\s+para\s+(?:recojo|retiro)\b/iu },
  { campo: 'registrado_el', re: /\bregistrad[oa]\b|\bregistro\b|\bemitid[oa]\b|\bfecha\s+de\s+emisi[óo]n\b/i },
];

// Fechas que NO son hechos ocurridos: estimaciones, plazos, vencimientos.
const RE_NO_ES_HECHO = /estimad|aproximad|programad|previst|plazo|hasta\s+el|vence|vencimiento|l[íi]mite|m[áa]ximo/i;

// dd/mm/aa o dd/mm/aaaa, con hora opcional ("a las 16:40", "16:40", "16:40 hrs").
const RE_FECHA = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b(?:\s*(?:a\s+las|-|,)?\s*(\d{1,2}):(\d{2})(?:\s*(?:hrs?|h)\b)?)?/i;

// Solo dígitos contiguos: la fecha que suele ir al lado no debe pegarse al número.
const RE_NUMERO_ORDEN = /N\s*[°ºo.]*\s*(?:DE\s+)?ORDEN\s*:?\s*(\d{6,15})(?![\d/])/i;

/**
 * Convierte una fecha de Shalom (hora de Lima) a ISO 8601 con zona -05:00.
 * Devuelve null si la fecha no existe en el calendario.
 */
function fechaIso(texto) {
  const m = RE_FECHA.exec(String(texto ?? ''));
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let anio = Number(m[3]);
  if (m[3].length === 2) anio += 2000;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  const p = (n) => String(n).padStart(2, '0');
  const fecha = `${anio}-${p(mes)}-${p(dia)}`;
  if (m[4] === undefined) return fecha;
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  if (hh > 23 || mm > 59) return fecha;
  return `${fecha}T${p(hh)}:${p(mm)}:00-05:00`;
}

function normalizarEstado(titulo) {
  const t = String(titulo ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const hallado = ESTADOS.find((e) => e.re.test(t));
  return hallado ? hallado.estado : null;
}

function estadoPorBarra(barra) {
  if (!barra || barra.totales !== ETAPAS.length - 1) return null;
  if (!Number.isInteger(barra.completos) || barra.completos < 0 || barra.completos > ETAPAS.length - 1) return null;
  return ETAPAS[barra.completos];
}

/** Clasifica una línea con fecha según sus palabras clave; null si no se puede. */
function clasificarLinea(linea) {
  if (!RE_FECHA.test(linea) || RE_NO_ES_HECHO.test(linea)) return null;
  const clave = CLAVES_FECHA.find((c) => c.re.test(linea));
  return clave ? clave.campo : null;
}

/**
 * Extrae solo las fechas identificables. Una fecha cuenta cuando su línea (o
 * una etiqueta corta en la línea anterior que no sea el título del estado)
 * dice qué es. Una fecha sin etiqueta no se usa para nada.
 */
function extraerFechas({ lineas = [], titulo = null }) {
  const fechas = { registrado_el: null, en_destino_el: null, entregado_el: null };
  const limpias = lineas.map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const tituloNorm = String(titulo ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  limpias.forEach((linea, i) => {
    if (!RE_FECHA.test(linea) || RE_NO_ES_HECHO.test(linea)) return;
    let campo = clasificarLinea(linea);
    if (!campo && i > 0) {
      const anterior = limpias[i - 1];
      const esEtiqueta = anterior.length <= 40 && !RE_FECHA.test(anterior) && !RE_NO_ES_HECHO.test(anterior)
        && anterior.toLowerCase() !== tituloNorm;
      if (esEtiqueta) {
        const clave = CLAVES_FECHA.find((c) => c.re.test(anterior));
        campo = clave ? clave.campo : null;
      }
    }
    if (campo && !fechas[campo]) fechas[campo] = fechaIso(linea);
  });
  return fechas;
}

/** Número de orden mostrado en el resultado. Acepta un texto o varios candidatos en orden de preferencia. */
function numeroOrdenMostrado(textoOrden) {
  const candidatos = Array.isArray(textoOrden) ? textoOrden : [textoOrden];
  for (const t of candidatos) {
    const m = RE_NUMERO_ORDEN.exec(String(t ?? ''));
    if (m) return m[1];
  }
  return null;
}

const sinCeros = (s) => String(s).replace(/^0+/, '');

/**
 * @param {object} crudo  Datos extraídos por el navegador (ver pagina.js).
 * @param {string} ordenConsultada
 * @returns {{estado: string, estado_reconocido: boolean, fechas: object, detalle: string|null}}
 */
function interpretarResultado(crudo, ordenConsultada) {
  if (!crudo || !crudo.hayResultado) throw new ErrorRastreo('pagina_cambio', 'sin bloque de resultado');

  const mostrado = numeroOrdenMostrado(crudo.textoOrden);
  if (!mostrado) throw new ErrorRastreo('pagina_cambio', 'no se pudo leer el número de orden del resultado');
  if (sinCeros(mostrado) !== sinCeros(ordenConsultada)) throw new ErrorRastreo('orden_no_coincide');

  const tituloLimpio = String(crudo.titulo ?? '').replace(/\s+/g, ' ').trim();
  let estado = normalizarEstado(tituloLimpio) || estadoPorBarra(crudo.barra);
  let reconocido = Boolean(estado);
  if (!estado) {
    // Estado nuevo de Shalom (p. ej. "Devuelto"): solo si parece un rótulo corto.
    const pareceRotulo = tituloLimpio.length >= 3 && tituloLimpio.length <= 40
      && /\p{L}/u.test(tituloLimpio) && !/\d/.test(tituloLimpio);
    if (!pareceRotulo) throw new ErrorRastreo('pagina_cambio', 'no se pudo leer el estado');
    estado = tituloLimpio;
    reconocido = false;
  }

  const fechas = extraerFechas({ lineas: crudo.lineas, titulo: tituloLimpio });
  // Coherencia: no afirmar una entrega o llegada que el estado no respalda.
  if (estado !== 'Entregado') fechas.entregado_el = null;
  if (estado !== 'En destino' && estado !== 'Entregado') fechas.en_destino_el = null;

  return { estado, estado_reconocido: reconocido, fechas, detalle: crudo.detalle || null };
}

module.exports = {
  ETAPAS, fechaIso, normalizarEstado, estadoPorBarra, extraerFechas, numeroOrdenMostrado, interpretarResultado, clasificarLinea,
};
