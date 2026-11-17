'use strict';
/**
 * Configuración y selectores en un solo lugar. Si Shalom cambia su página,
 * normalmente basta con ajustar este archivo (ver README, «Validar con una
 * consulta real»).
 */

const URL_PUBLICA = 'https://shalom.com.pe/rastrea';

const LIMITES = Object.freeze({
  timeoutMs: { porDefecto: 30000, min: 5000, max: 90000 },
  intentos: { porDefecto: 2, min: 1, max: 3 },
  esperaEntreIntentosMs: 2000,
  sondeoMs: 300,
});

/**
 * Selectores. Se prefieren roles y textos accesibles (estables ante cambios de
 * estilo); las clases de Tailwind quedan solo como respaldo de la versión
 * original, que se verificó contra la página real el 2026-11-16.
 */
const SELECTORES = Object.freeze({
  campoOrden: { rol: 'textbox', nombre: /^\s*n\s*[°º.o]*\s*de\s+orden/i, placeholder: /n\s*[°º.o]*\s*de\s+orden|n[uú]mero\s+de\s+orden/i },
  campoCodigo: { rol: 'textbox', nombre: /c[óo]digo(\s+de\s+orden)?/i, placeholder: /c[óo]digo/i },
  botonBuscar: { rol: 'button', nombre: /^\s*buscar\s*$/i },
  // Rótulo del bloque de resultado (en mayúsculas, distinto del rótulo del formulario).
  rotuloResultado: 'N[°º]\\s*DE\\s*ORDEN',
  titulo: ['[data-testid*="estado" i]', '[aria-live] h1, [aria-live] h2', 'h1', 'h2', 'h3', '.text-4xl'],
  detalle: ['[data-testid*="detalle" i]', 'p.text-silver-title'],
  barraCompleta: '.bg-red-600',
  barraTramos: '.relative .absolute > div',
});

/** Textos que indican que la orden no existe (deben aparecer tras buscar). */
const RE_NO_ENCONTRADA = 'no\\s+se\\s+encontr[óo]|no\\s+existe|no\\s+hay\\s+resultados|orden\\s+(?:no\\s+v[áa]lida|inv[áa]lida|incorrecta)';

/** Textos de verificación humana o bloqueo. Nunca se intentan resolver. */
const RE_BLOQUEO = 'captcha|no\\s+eres\\s+un\\s+robot|verifica(?:r)?\\s+que\\s+eres\\s+humano|acceso\\s+denegado|access\\s+denied|demasiadas\\s+solicitudes|too\\s+many\\s+requests|just\\s+a\\s+moment';

/**
 * URL a consultar. SHALOM_RASTREO_URL solo se acepta hacia localhost, para
 * pruebas con páginas simuladas; en uso real siempre es la URL pública.
 */
function urlRastreo(env = process.env) {
  const alt = env.SHALOM_RASTREO_URL;
  if (!alt) return URL_PUBLICA;
  let u;
  try { u = new URL(alt); } catch { throw new Error('SHALOM_RASTREO_URL no es una URL válida'); }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname)) {
    throw new Error('SHALOM_RASTREO_URL solo se admite hacia http://127.0.0.1 o http://localhost (pruebas)');
  }
  return u.toString();
}

function acotar(valor, { porDefecto, min, max }) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

module.exports = { URL_PUBLICA, LIMITES, SELECTORES, RE_NO_ENCONTRADA, RE_BLOQUEO, urlRastreo, acotar };
