# rastrear-envio (Shalom) — versión 2.0

Skill de solo lectura para que Fertisem consulte el **rastreo público de
Shalom** (`https://shalom.com.pe/rastrea`) con el número de orden y el código
de 4 caracteres del ticket, y responda al cliente con información verificada.

- No inicia sesión ni usa credenciales.
- Una consulta individual, bajo demanda.
- Basada en la skill `rastrear-envio` de
  [skills-finangher](https://github.com/lucasBecrod/skills-finangher) (MIT).
  Los hallazgos de la revisión están en [`DIAGNOSTICO.md`](DIAGNOSTICO.md).

## Estructura

```
rastrear-envio/
├── SKILL.md                  Instrucciones para el asistente
├── scripts/rastrear-shalom.js  CLI (stdout = JSON)
├── lib/
│   ├── config.js             URL, límites y SELECTORES (único lugar a ajustar)
│   ├── pagina.js             Navegación, detección de bloqueo/CAPTCHA, reintentos
│   ├── interpretar.js        Estado, fechas y verificación de la orden (puro)
│   ├── respuesta.js          Textos para el cliente
│   ├── privacidad.js         Enmascarado de datos personales
│   ├── contrato.js           Estructura de salida y códigos de error
│   ├── validar.js            Validación de entrada
│   └── rastrear.js           Orquestación (API para usar desde Node)
├── test/                     Pruebas unitarias e integración con páginas simuladas
├── package.json · package-lock.json · .nvmrc
```

## Requisitos

| Requisito | Versión |
|---|---|
| Node.js | **20 o superior** (Playwright 1.63 exige `>=20`; la documentación original decía 18, lo cual era incorrecto) |
| Playwright | `1.63.0`, fijada en `package.json` y `package-lock.json` |
| Navegador | Chromium descargado por Playwright (≈ 150 MB en disco) |
| Red | Salida HTTPS a `shalom.com.pe` |

## Instalación local (Mac, Linux, Windows)

```bash
cp -r rastrear-envio ~/.claude/skills/
```

```bash
cd ~/.claude/skills/rastrear-envio
```

```bash
npm ci
```

```bash
npx playwright install chromium
```

`npm ci` instala exactamente las versiones del archivo de bloqueo. Luego abre
una conversación nueva en Claude Code para que cargue la skill.

## Uso

```bash
node scripts/rastrear-shalom.js 100000000 AB12
```

| Opción | Efecto |
|---|---|
| `--timeout <ms>` | Espera máxima por paso (5000–90000; por defecto 30000) |
| `--intentos <n>` | Intentos ante errores transitorios (1–3; por defecto 2) |
| `--con-destinatario` | Agrega `detalle_destinatario` (ver «Datos personales») |
| `--depurar` | Mensajes técnicos saneados por **stderr**: intentos, título leído y líneas del resultado con números largos enmascarados y la línea de detalle omitida |
| `--ayuda` | Ayuda |

Desde Node:

```js
const { rastrear } = require('./lib/rastrear');
const r = await rastrear({ orden: '100000000', codigo: 'AB12' }); // nunca lanza
```

## Contrato de salida

Siempre se imprime **un** objeto con las mismas claves, haya éxito o error.

| Clave | Tipo | Significado |
|---|---|---|
| `transportista` | `"shalom"` | |
| `version_contrato` | `"2.0"` | Cambia si cambia el contrato |
| `orden` | string \| null | Orden consultada (null si el formato era inválido). El código **nunca** se incluye |
| `ok` | boolean | |
| `estado` | string \| null | `En origen`, `En tránsito`, `En destino`, `Entregado`, o el texto de Shalom si es un estado nuevo |
| `registrado_el` | ISO 8601 \| null | Solo si la página etiqueta la fecha como registro/emisión |
| `en_destino_el` | ISO 8601 \| null | Solo si la página etiqueta la llegada a destino. Nunca se deduce del registro |
| `entregado_el` | ISO 8601 \| null | Solo si la página etiqueta la entrega y el estado es `Entregado` |
| `consultado_en` | ISO 8601 UTC | Momento de la consulta |
| `intentos` | number | Intentos de navegación usados |
| `respuesta_cliente` | string | Texto listo para el cliente |
| `error` | null \| `{codigo, mensaje, reintentable}` | |
| `estado_reconocido` | `false` (opcional) | Solo presente cuando el estado no es uno de los cuatro conocidos |
| `detalle_destinatario`, `aviso_privacidad` | string (opcional) | Solo con `--con-destinatario` |

Las fechas se expresan en hora de Lima: `2026-11-14T09:30:00-05:00`, o
`2026-11-14` si la página no muestra la hora. Una fecha imposible (p. ej.
31/02) se descarta. Las fechas de plazos o estimaciones («hasta el», «estimada»,
«vence») se ignoran.

Ejemplo de error:

```json
{
  "transportista": "shalom",
  "version_contrato": "2.0",
  "orden": "100000000",
  "ok": false,
  "estado": null,
  "registrado_el": null,
  "en_destino_el": null,
  "entregado_el": null,
  "consultado_en": "2026-11-17T02:00:00Z",
  "intentos": 2,
  "respuesta_cliente": "No pudimos consultar tu envío en este momento. Inténtalo nuevamente más tarde.",
  "error": { "codigo": "conexion", "mensaje": "No se pudo conectar con la página de Shalom.", "reintentable": true }
}
```

### Códigos de salida

| Salida | `error.codigo` | Reintenta solo | Significado |
|---|---|---|---|
| 0 | — | — | Envío encontrado y leído |
| 1 | `interno` | no | Error inesperado del script |
| 2 | `datos_invalidos` | no | Orden o código con formato inválido |
| 3 | `no_encontrada` | no | Shalom indicó que la orden no existe |
| 4 | `pagina_cambio` | no | Formulario o resultado irreconocible, HTTP 4xx |
| 4 | `orden_no_coincide` | no | El resultado muestra otro número de orden |
| 5 | `conexion` | sí | Error de red o HTTP 5xx |
| 5 | `tiempo_espera` | sí | Sin respuesta dentro de `--timeout` |
| 6 | `bloqueo` | no | CAPTCHA visible, HTTP 403/429 o aviso de acceso denegado |
| 7 | `dependencia` | no | Falta Playwright o Chromium |

**Cambio respecto de la versión 1:** antes el 4 mezclaba «página cambió» y
«no respondió». Ahora los errores transitorios salen con 5 y el bloqueo con 6.

## Respuestas al cliente

| Situación | Texto |
|---|---|
| En tránsito | Tu envío está en tránsito. |
| En destino | Tu envío ya está en la agencia de destino. *(+ «Llegó el dd/mm/aaaa a las hh:mm.» si `en_destino_el` existe)* |
| Entregado | Tu envío figura como entregado. *(+ «Fecha de entrega: …» si `entregado_el` existe)* |
| En origen | Tu envío figura en la agencia de origen. |
| Estado nuevo | En Shalom, tu envío figura con el estado «…». |
| No encontrada / datos inválidos | Pide revisar el número de orden y el código del ticket |
| Cualquier otro error | No pudimos consultar tu envío en este momento. Inténtalo nuevamente más tarde. |

No se agregan plazos, requisitos de recojo ni ubicaciones.

## Datos personales

- **Salida habitual:** sin nombres, DNI, teléfonos ni direcciones. El estado
  sale normalizado y la línea de detalle de Shalom no se incluye.
- **Errores y `--depurar`:** mensajes fijos por categoría; el detalle técnico se
  sanea (código del ticket reemplazado por `****`, números largos enmascarados,
  línea de detalle omitida). Nunca se imprime el texto crudo de Playwright en
  stdout.
- **`--con-destinatario`:**
  - *Alcance:* agrega `detalle_destinatario`, el texto de entrega que publica
    Shalom (normalmente quién recogió), con el DNI reducido a sus 3 últimos
    dígitos (`*****678`) y teléfonos y direcciones reemplazados. El enmascarado
    de direcciones es heurístico (Av., Jr., Calle, Mz., Lt., Urb., etc.).
  - *Condiciones de uso:* solo a pedido del personal de Fertisem, en un canal
    privado, para verificar una entrega concreta. No reenviar al cliente ni a
    grupos, no guardar en registros ni hojas de cálculo. El texto nunca entra
    en `respuesta_cliente`.
- El número de orden más el código dan acceso al estado del envío: tratarlos
  como datos privados.

## Funcionamiento y robustez

- Selectores por **rol y nombre accesible** (`N° de Orden`, `Código de Orden`,
  botón `Buscar`), con respaldo por *placeholder*. Las clases de Tailwind de la
  versión original (`.text-4xl`, `.text-silver-title`, `.bg-red-600`) quedan
  solo como respaldo. Todo está en `lib/config.js`.
- El resultado se reconoce por el rótulo `N° DE ORDEN` **visible y nuevo** tras
  buscar. Lo mismo vale para los textos de «no encontrada» y de bloqueo, así
  que los elementos ocultos ya presentes en la página no generan falsos
  positivos.
- **Verificación de la orden:** el número mostrado debe coincidir con el
  consultado (se ignoran ceros a la izquierda). Si no se puede leer, el
  resultado es `pagina_cambio`.
- **Tiempos y reintentos:** `--timeout` por paso; hasta `--intentos` intentos
  solo para `conexion` y `tiempo_espera`, con espera creciente (2 s, 4 s). Cada
  intento usa un contexto nuevo.
- **CAPTCHA:** si aparece un reto visible (reCAPTCHA, hCaptcha, Cloudflare) o un
  aviso de verificación, se informa `bloqueo` sin reintentar ni intentar
  resolverlo. No se alteran el *user agent* ni otras huellas del navegador.
- **Cierre:** el navegador se cierra en un `finally` en todos los casos y
  también ante `SIGINT`/`SIGTERM`.
- `SHALOM_RASTREO_URL` permite apuntar a una página simulada **solo** en
  `http://127.0.0.1` o `http://localhost` (pruebas). Cualquier otra URL se
  rechaza.

## Servidor (requisitos, sin probar en producción)

- Linux x64/arm64 con Node 20+ y aproximadamente 1 GB de RAM libre por consulta
  simultánea.
- Dependencias del sistema de Chromium: `npx playwright install --with-deps chromium`
  (requiere root; en Debian/Ubuntu instala las librerías necesarias). En Docker
  conviene partir de `mcr.microsoft.com/playwright:v1.63.0-noble`.
- Salida HTTPS a `shalom.com.pe` sin proxies que intercepten TLS.
- Ejecutar como usuario sin privilegios. Si el contenedor corre como root,
  Chromium puede requerir `--no-sandbox`; esta skill **no** lo activa.
- Consultas en serie, bajo demanda. Las IPs de centros de datos tienen más
  probabilidad de recibir un CAPTCHA: en ese caso la skill responde `bloqueo` y
  no hay solución automática.
- Los registros del servidor no deben guardar los argumentos del proceso, porque
  contienen el código del ticket.

## Pruebas

```bash
npm test
```

- `test/unit.test.js`: validación, fechas (etiquetadas, ausentes, imposibles,
  plazos), normalización de estado, verificación de orden, respuestas,
  enmascarado, contrato y clasificación de errores.
- `test/integracion.test.js`: Chromium real contra páginas **simuladas** en
  127.0.0.1 (`test/fixtures/servidor.js`, datos ficticios), en dos variantes de
  marcado. Cubre tránsito, destino, entrega, fechas ausentes o imposibles, orden
  no encontrada, otra orden, página cambiada, CAPTCHA, HTTP 403/503, tiempo de
  espera, reintento exitoso, servidor caído, dependencias faltantes, cierre del
  navegador y los códigos de salida de la CLI, sin filtrar el código del ticket
  ni datos personales.

## Validar con una consulta real

Las páginas simuladas reproducen lo que la versión original leía, pero **no
sustituyen una prueba contra Shalom**. Usa un envío propio de Fertisem o uno
cuyo titular lo autorice.

1. Instala la skill como se indica arriba, en una máquina con acceso a
   `shalom.com.pe`.
2. Ejecuta con un envío **en tránsito**, uno **en destino** y uno **entregado**:

   ```bash
   node scripts/rastrear-shalom.js <orden> <codigo> --depurar
   ```

3. En stderr revisa «título leído», «líneas del resultado» y «fechas
   identificadas». Compáralos con lo que se ve en el navegador:
   - Si el estado es correcto pero una fecha visible sale `null`, la página usa
     otra etiqueta: agrégala en `CLAVES_FECHA` (`lib/interpretar.js`).
   - Si sale `pagina_cambio`, ajusta `SELECTORES` en `lib/config.js`.
4. Prueba una orden inexistente (p. ej. tu número con el código `ZZZZ`) y
   confirma que sale el código 3. Si sale 5, añade el texto que muestra Shalom a
   `RE_NO_ENCONTRADA`.
5. Repite la consulta 2 o 3 veces con algunos minutos de separación. Si aparece
   `bloqueo`, documenta en qué condiciones ocurrió.
6. No guardes la salida de `--depurar` ni de `--con-destinatario`.

## Limitaciones pendientes

- **No validada contra la página real en esta versión:** el entorno donde se
  desarrolló no tenía acceso de red a Shalom. Los selectores provienen de la
  versión original, que sí se probó el 2026-11-16.
- Las palabras clave de fechas y de «no encontrada» son supuestos razonables;
  confírmalos con el paso anterior.
- Se desconoce el límite de consultas de Shalom antes de un bloqueo.
- No probado en servidores en la nube.
- El enmascarado de direcciones en `--con-destinatario` es heurístico.

## Integración con MultiChat

[`integraciones/multichat/`](integraciones/multichat/INTEGRACION.md) tiene el
prompt (`SYSTEM_RASTREO`) y el código para que el asistente ✨ de MultiChat
proponga respuestas basadas solo en el JSON de esta skill.

## Ampliaciones futuras (fuera de esta versión)

Integración con WooCommerce (leer orden y código desde el pedido), respuestas
por WhatsApp y otros transportistas con el mismo contrato de salida
(`scripts/rastrear-<transportista>.js`).

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
