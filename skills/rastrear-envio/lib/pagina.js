'use strict';
/**
 * Navegación de solo lectura en el rastreo público de Shalom.
 * No inicia sesión, no modifica nada y no intenta resolver CAPTCHA.
 */
const { ErrorRastreo, ERRORES } = require('./contrato');
const { SELECTORES, RE_NO_ENCONTRADA, RE_BLOQUEO, LIMITES } = require('./config');
const { quitarSecretos } = require('./privacidad');

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

/* ---------- Funciones que corren DENTRO de la página (autocontenidas) ---------- */

/** Cuenta textos clave VISIBLES, para detectar solo lo que aparece tras buscar. */
function contarEnPagina({ reNoEnc, reBloq, rotulo }) {
  const texto = document.body ? document.body.innerText || '' : '';
  const contar = (re) => (texto.match(new RegExp(re, 'gi')) || []).length;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const reRotulo = new RegExp(rotulo);
  let rotulos = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (p && reRotulo.test(walker.currentNode.textContent) && !p.closest('label') && visible(p)) rotulos += 1;
  }
  return { noEnc: contar(reNoEnc), bloq: contar(reBloq), rotulo: rotulos };
}

function sondearPagina({ reNoEnc, reBloq, rotulo, antes, sel }) {
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top > -1000 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const limpiar = (t) => (t || '').replace(/\s+/g, ' ').trim();

  // 1) Verificación humana visible (reCAPTCHA, hCaptcha, Cloudflare).
  const retoVisible = Array.from(document.querySelectorAll('iframe')).some((f) => {
    const src = f.getAttribute('src') || '';
    return /recaptcha\/(api2|enterprise)\/bframe|hcaptcha\.com\/.*(challenge|hcaptcha)|challenges\.cloudflare\.com/i.test(src)
      && visible(f) && f.getBoundingClientRect().height > 60;
  });
  const texto = document.body ? document.body.innerText || '' : '';
  const nuevos = (re, n) => (texto.match(new RegExp(re, 'gi')) || []).length > n;
  if (retoVisible || nuevos(reBloq, antes.bloq)) return { tipo: 'bloqueo' };

  // 2) Bloque de resultado (rótulo en mayúsculas, nuevo tras buscar).
  const reRotulo = new RegExp(rotulo);
  const nodos = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (reRotulo.test(n.textContent) && n.parentElement && !n.parentElement.closest('label') && visible(n.parentElement)) {
      nodos.push(n.parentElement);
    }
  }
  if (nodos.length > antes.rotulo) {
    const nodo = nodos[nodos.length - 1];
    const primero = (raiz, lista) => {
      for (const s of lista) {
        const el = Array.from(raiz.querySelectorAll(s)).find((e) => !e.contains(nodo) && limpiar(e.innerText));
        if (el) return el;
      }
      return null;
    };
    let tarjeta = null;
    let cur = nodo;
    // El bloque de resultado nunca incluye el formulario: así no se confunde
    // el título de la página con el estado del envío.
    const contieneFormulario = (el) => Boolean(el.querySelector('form, input, textarea, select'));
    let ultimoSinFormulario = nodo;
    for (let i = 0; i < 6 && cur.parentElement; i += 1) {
      cur = cur.parentElement;
      if (contieneFormulario(cur) || cur === document.body) break;
      ultimoSinFormulario = cur;
      if (primero(cur, sel.titulo)) { tarjeta = cur; break; }
    }
    if (!tarjeta) tarjeta = ultimoSinFormulario;
    const tituloEl = primero(tarjeta, sel.titulo);
    const detalleEl = primero(tarjeta, sel.detalle);
    const totales = tarjeta.querySelectorAll(sel.barraTramos).length;
    const crudo = {
      hayResultado: true,
      textoOrden: [
        `${nodo.textContent} ${nodo.nextElementSibling ? nodo.nextElementSibling.textContent : ''}`,
        nodo.parentElement ? nodo.parentElement.textContent : '',
      ],
      titulo: tituloEl ? limpiar(tituloEl.innerText) : null,
      detalle: detalleEl ? limpiar(detalleEl.innerText) : null,
      lineas: (tarjeta.innerText || '').split('\n').map(limpiar).filter(Boolean),
      barra: totales ? { completos: tarjeta.querySelectorAll(sel.barraCompleta).length, totales } : null,
    };
    return { tipo: crudo.titulo || crudo.barra ? 'resultado' : 'resultado_incompleto', crudo };
  }

  // 3) Mensaje de orden no encontrada (nuevo tras buscar).
  if (nuevos(reNoEnc, antes.noEnc)) return { tipo: 'no_encontrada' };
  return { tipo: 'pendiente' };
}

/* ---------------------------- Lado Node ---------------------------- */

/** Traduce cualquier error a una categoría del contrato, sin datos sensibles. */
function clasificarError(e, secretos) {
  if (e instanceof ErrorRastreo) return e;
  const msg = String((e && e.message) || e);
  const tecnico = `${(e && e.name) || 'Error'}: ${quitarSecretos(msg.split('\n')[0], secretos)}`;
  if (/Executable doesn't exist|Failed to launch|browserType\.launch|Cannot find module 'playwright'/i.test(msg)) {
    return new ErrorRastreo('dependencia', tecnico);
  }
  if ((e && e.name === 'TimeoutError') || /Timeout \d+ms exceeded/i.test(msg)) return new ErrorRastreo('tiempo_espera', tecnico);
  if (/net::ERR_|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up/i.test(msg)) {
    return new ErrorRastreo('conexion', tecnico);
  }
  return new ErrorRastreo('interno', tecnico);
}

function localizar(page, def) {
  let loc = page.getByRole(def.rol, { name: def.nombre });
  if (def.placeholder) loc = loc.or(page.getByPlaceholder(def.placeholder));
  return loc.first();
}

async function evaluarSeguro(page, fn, arg) {
  try {
    return await page.evaluate(fn, arg);
  } catch (e) {
    // La página puede estar navegando tras enviar el formulario: reintentar en el próximo sondeo.
    if (/Execution context was destroyed|navigat|Target closed/i.test(String(e && e.message))) return null;
    throw e;
  }
}

/** Una consulta completa en un contexto nuevo. Devuelve los datos crudos del resultado. */
async function intentoUnico(browser, { url, orden, codigo, timeoutMs }) {
  const ctx = await browser.newContext({ locale: 'es-PE', timezoneId: 'America/Lima' });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (resp) {
      const s = resp.status();
      if (s === 403 || s === 429) throw new ErrorRastreo('bloqueo', `HTTP ${s}`);
      if (s >= 500) throw new ErrorRastreo('conexion', `HTTP ${s}`);
      if (s >= 400) throw new ErrorRastreo('pagina_cambio', `HTTP ${s}`);
    }

    const args = { reNoEnc: RE_NO_ENCONTRADA, reBloq: RE_BLOQUEO, rotulo: SELECTORES.rotuloResultado };
    const campoOrden = localizar(page, SELECTORES.campoOrden);
    try {
      await campoOrden.waitFor({ state: 'visible', timeout: timeoutMs });
    } catch (e) {
      const r = await evaluarSeguro(page, sondearPagina, { ...args, antes: { noEnc: 0, bloq: 0, rotulo: 0 }, sel: SELECTORES });
      if (r && r.tipo === 'bloqueo') throw new ErrorRastreo('bloqueo', 'verificación antes del formulario');
      const hayCampos = await page.locator('input').count().catch(() => 0);
      throw new ErrorRastreo(hayCampos > 0 ? 'pagina_cambio' : 'tiempo_espera', 'no apareció el campo de número de orden');
    }
    const campoCodigo = localizar(page, SELECTORES.campoCodigo);
    const boton = localizar(page, SELECTORES.botonBuscar);
    if (!(await campoCodigo.count()) || !(await boton.count())) {
      throw new ErrorRastreo('pagina_cambio', 'falta el campo de código o el botón Buscar');
    }

    const antes = await page.evaluate(contarEnPagina, args);
    await campoOrden.fill(orden);
    await campoCodigo.fill(codigo);
    await boton.click();

    const limite = Date.now() + timeoutMs;
    let ultimo = null;
    while (Date.now() < limite) {
      const r = await evaluarSeguro(page, sondearPagina, { ...args, antes, sel: SELECTORES });
      if (r) {
        ultimo = r.tipo;
        if (r.tipo === 'bloqueo') throw new ErrorRastreo('bloqueo', 'verificación tras buscar');
        if (r.tipo === 'no_encontrada') throw new ErrorRastreo('no_encontrada');
        if (r.tipo === 'resultado') return r.crudo;
      }
      await esperar(LIMITES.sondeoMs);
    }
    if (ultimo === 'resultado_incompleto') throw new ErrorRastreo('pagina_cambio', 'resultado sin estado legible');
    throw new ErrorRastreo('tiempo_espera', 'sin respuesta tras buscar');
  } finally {
    await ctx.close().catch(() => {});
  }
}

const navegadoresAbiertos = new Set();

/** Cierra cualquier navegador que siga abierto (para señales de interrupción). */
async function cerrarTodo() {
  await Promise.all(Array.from(navegadoresAbiertos).map((b) => b.close().catch(() => {})));
  navegadoresAbiertos.clear();
}

/**
 * Consulta con reintentos limitados solo para errores transitorios.
 * El navegador se cierra siempre, incluso si ocurre un error.
 * @returns {Promise<{crudo: object, intentos: number}>}
 */
async function consultarPagina({ url, orden, codigo, timeoutMs, intentos, cargarPlaywright, alIntentar }) {
  const secretos = { codigo };
  let chromium;
  try {
    ({ chromium } = (cargarPlaywright || (() => require('playwright')))());
  } catch (e) {
    throw new ErrorRastreo('dependencia', 'no se pudo cargar playwright');
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: timeoutMs });
  } catch (e) {
    const err = clasificarError(e, secretos);
    err.intentos = 0;
    throw err.codigo === 'interno' ? Object.assign(new ErrorRastreo('dependencia', err.tecnico), { intentos: 0 }) : err;
  }
  navegadoresAbiertos.add(browser);

  try {
    for (let n = 1; ; n += 1) {
      try {
        if (alIntentar) alIntentar(n);
        const crudo = await intentoUnico(browser, { url, orden, codigo, timeoutMs });
        return { crudo, intentos: n };
      } catch (e) {
        const err = clasificarError(e, secretos);
        err.intentos = n;
        if (!ERRORES[err.codigo].reintentable || n >= intentos) throw err;
        await esperar(LIMITES.esperaEntreIntentosMs * n);
      }
    }
  } finally {
    navegadoresAbiertos.delete(browser);
    await browser.close().catch(() => {});
  }
}

module.exports = { consultarPagina, cerrarTodo, clasificarError, sondearPagina, contarEnPagina };
