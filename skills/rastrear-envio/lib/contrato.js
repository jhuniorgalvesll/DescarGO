'use strict';
/**
 * Contrato de salida de rastrear-envio.
 *
 * Toda ejecución imprime UN objeto JSON con las mismas claves, haya éxito o
 * error, y termina con uno de los códigos de salida de CODIGOS_SALIDA.
 */

const VERSION_CONTRATO = '2.0';

/** Errores conocidos: código de salida y si conviene reintentar más tarde. */
const ERRORES = Object.freeze({
  datos_invalidos: { salida: 2, reintentable: false, mensaje: 'El número de orden o el código no tienen el formato esperado.' },
  no_encontrada: { salida: 3, reintentable: false, mensaje: 'Shalom no encontró una orden con ese número y código.' },
  pagina_cambio: { salida: 4, reintentable: false, mensaje: 'La página de Shalom no tiene la estructura esperada; no se pudo leer el estado.' },
  orden_no_coincide: { salida: 4, reintentable: false, mensaje: 'El resultado mostrado no corresponde a la orden consultada.' },
  conexion: { salida: 5, reintentable: true, mensaje: 'No se pudo conectar con la página de Shalom.' },
  tiempo_espera: { salida: 5, reintentable: true, mensaje: 'La página de Shalom no respondió dentro del tiempo de espera.' },
  bloqueo: { salida: 6, reintentable: false, mensaje: 'Shalom bloqueó la consulta o pidió una verificación (CAPTCHA) que este script no resuelve.' },
  dependencia: { salida: 7, reintentable: false, mensaje: 'Falta Playwright o Chromium. Ejecuta "npm ci" y "npx playwright install chromium".' },
  interno: { salida: 1, reintentable: false, mensaje: 'Error interno inesperado del script.' },
});

const CODIGOS_SALIDA = Object.freeze({
  0: 'Envío encontrado y leído',
  1: 'Error interno inesperado',
  2: 'Datos de entrada inválidos',
  3: 'Orden no encontrada',
  4: 'Página cambiada o resultado de otra orden',
  5: 'Error transitorio de conexión o tiempo de espera (tras reintentos)',
  6: 'Bloqueo o CAPTCHA',
  7: 'Dependencias faltantes',
});

/** Error con categoría del contrato. Nunca lleva datos personales ni el código del ticket. */
class ErrorRastreo extends Error {
  constructor(codigo, tecnico) {
    if (!ERRORES[codigo]) throw new TypeError(`Código de error desconocido: ${codigo}`);
    super(ERRORES[codigo].mensaje);
    this.name = 'ErrorRastreo';
    this.codigo = codigo;
    // Detalle técnico SOLO para --depurar (stderr); ya debe venir saneado.
    this.tecnico = tecnico || null;
  }
}

function base(orden, ahora) {
  return {
    transportista: 'shalom',
    version_contrato: VERSION_CONTRATO,
    orden: orden || null,
    ok: false,
    estado: null,
    registrado_el: null,
    en_destino_el: null,
    entregado_el: null,
    consultado_en: (ahora || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    intentos: 0,
    respuesta_cliente: null,
    error: null,
  };
}

function exito({ orden, estado, fechas, intentos, respuesta, extra, ahora }) {
  return {
    ...base(orden, ahora),
    ok: true,
    estado,
    registrado_el: fechas.registrado_el ?? null,
    en_destino_el: fechas.en_destino_el ?? null,
    entregado_el: fechas.entregado_el ?? null,
    intentos,
    respuesta_cliente: respuesta,
    ...(extra || {}),
  };
}

function fallo({ orden, codigo, intentos, respuesta, ahora }) {
  const def = ERRORES[codigo] || ERRORES.interno;
  return {
    ...base(orden, ahora),
    intentos: intentos || 0,
    respuesta_cliente: respuesta,
    error: { codigo: ERRORES[codigo] ? codigo : 'interno', mensaje: def.mensaje, reintentable: def.reintentable },
  };
}

function codigoSalida(resultado) {
  if (resultado.ok) return 0;
  return (ERRORES[resultado.error && resultado.error.codigo] || ERRORES.interno).salida;
}

module.exports = { VERSION_CONTRATO, ERRORES, CODIGOS_SALIDA, ErrorRastreo, exito, fallo, codigoSalida };
