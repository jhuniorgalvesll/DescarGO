#!/usr/bin/env node
'use strict';
/**
 * Consulta el rastreo público de Shalom (https://shalom.com.pe/rastrea) y
 * devuelve el estado del envío en JSON por stdout.
 *
 * Uso:
 *   node scripts/rastrear-shalom.js <orden> <codigo> [opciones]
 *
 * Opciones:
 *   --timeout <ms>        Espera máxima por paso (5000–90000, por defecto 30000)
 *   --intentos <n>        Intentos ante errores transitorios (1–3, por defecto 2)
 *   --con-destinatario    Agrega el detalle de entrega de Shalom (DNI y teléfonos
 *                         enmascarados). Solo para el vendedor, en privado.
 *   --depurar             Mensajes técnicos saneados por stderr (sin el código)
 *   --ayuda               Muestra esta ayuda
 *
 * Solo lectura: no inicia sesión ni usa credenciales.
 * Códigos de salida: ver README («Códigos de salida»).
 */
const { parseArgs } = require('node:util');
const { codigoSalida, fallo } = require('../lib/contrato');
const { respuestaError } = require('../lib/respuesta');

const AYUDA = `Uso: node scripts/rastrear-shalom.js <orden> <codigo> [--timeout ms] [--intentos n] [--con-destinatario] [--depurar]
  <orden>   número de orden del ticket (8 a 12 dígitos)
  <codigo>  código de 4 caracteres del ticket
Imprime JSON por stdout. Códigos de salida: 0 ok · 1 interno · 2 datos inválidos · 3 no encontrada ·
4 página cambiada / otra orden · 5 conexión o tiempo de espera · 6 bloqueo o CAPTCHA · 7 dependencias.`;

function imprimir(resultado) {
  process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
}

async function principal() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        timeout: { type: 'string' },
        intentos: { type: 'string' },
        'con-destinatario': { type: 'boolean', default: false },
        depurar: { type: 'boolean', default: false },
        ayuda: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
  } catch {
    process.stderr.write(`${AYUDA}\n`);
    const r = fallo({ orden: null, codigo: 'datos_invalidos', respuesta: respuestaError('datos_invalidos') });
    imprimir(r);
    return codigoSalida(r);
  }

  if (args.values.ayuda || args.values.help) {
    process.stdout.write(`${AYUDA}\n`);
    return 0;
  }

  const [orden, codigo, ...sobrantes] = args.positionals;
  const depurar = args.values.depurar
    ? (m) => process.stderr.write(`[rastrear-envio] ${m}\n`)
    : null;
  if (sobrantes.length && depurar) depurar('se ignoraron argumentos adicionales');

  // Lo requerimos aquí para que un fallo al cargar Playwright se reporte en JSON.
  const { rastrear } = require('../lib/rastrear');
  const resultado = await rastrear({
    orden,
    codigo,
    timeoutMs: args.values.timeout,
    intentos: args.values.intentos,
    conDestinatario: args.values['con-destinatario'],
    alDepurar: depurar,
  });
  imprimir(resultado);
  return codigoSalida(resultado);
}

// Cierre ordenado ante interrupciones: nunca dejar Chromium abierto.
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, async () => {
    const { cerrarTodo } = require('../lib/pagina');
    await cerrarTodo();
    process.exit(130);
  });
}

principal()
  .then((codigo) => { process.exitCode = codigo; })
  .catch(() => {
    imprimir(fallo({ orden: null, codigo: 'interno', respuesta: respuestaError('interno') }));
    process.exitCode = 1;
  });
