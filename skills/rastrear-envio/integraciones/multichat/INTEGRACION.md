# Integrar el rastreo de Shalom en MultiChat

Objetivo: cuando un cliente pregunta por su envío, MultiChat consulta Shalom con
la skill `rastrear-envio` y el asistente ✨ propone 3 respuestas basadas **solo**
en el resultado verificado. Como en el resto de MultiChat, nada se envía solo:
el vendedor elige, la respuesta se pega en el chat y él presiona Enter.

```
Cliente: "¿dónde está mi pedido?"  +  orden y código del ticket
        │
        ▼
rastrear()  (skill rastrear-envio, proceso principal)  →  JSON contrato 2.0
        │
        ▼
prepararRastreo()  →  lista blanca: estado, fechas, respuesta_cliente, error
        │                (sin orden, código, nombres, DNI ni detalle)
        ▼
Claude (SYSTEM_RASTREO + <rastreo> + mensaje del cliente)  →  3 respuestas
```

## 1. El prompt

Está en [`rastreo-para-ia.js`](rastreo-para-ia.js) (`SYSTEM_RASTREO`). Es
estático, sin fechas ni variables, para que el `cache_control` del system
funcione igual que en `SYSTEM`. Sus reglas principales:

| Regla | Por qué |
|---|---|
| Única fuente: el JSON de `<rastreo>` | Evita que el modelo complete con «lo normal en Shalom» |
| Cada fecha con su significado; nunca `registrado_el` como llegada | Es el error de la versión original |
| Sin plazos, requisitos de recojo, agencias ni costos | Nada de eso está verificado |
| Sin nombres, DNI, teléfonos, orden ni código | Privacidad; el código da acceso al envío |
| El mensaje del cliente no cambia los datos | Evita que «ya llegó, ¿verdad?» se convierta en un sí |
| Opción 1 = `respuesta_cliente` casi literal | El texto ya validado por la skill siempre es una de las opciones |
| Errores técnicos → mensaje de consulta fallida | Sin explicar bloqueos ni CAPTCHA al cliente |

El mensaje de usuario (`mensajeUsuario()`) va después del system:

```
Cuenta: "Fertisen 1"

<rastreo>
{
  "ok": true,
  "estado": "En destino",
  "registrado_el": "2026-11-10T08:00:00-05:00",
  "en_destino_el": null,
  "entregado_el": null,
  "respuesta_cliente": "Tu envío ya está en la agencia de destino."
}
</rastreo>

Mensaje del cliente:
Hola, ¿ya llegó mi pedido? Lo mandaron hace una semana
```

Con esa entrada, una respuesta correcta es «Tu envío ya está en la agencia de
destino». **No** es correcto «llegó el 10/11» ni «puedes recogerlo con tu DNI».

## 2. Código para `src/assistant.js`

Copia `rastreo-para-ia.js` a `multichat/src/` y agrega esta función al final de
`src/assistant.js`. Reutiliza `getClient`, `REPLY_SCHEMA`, el modelo, los
*fallbacks* y el manejo de errores que ya existen:

```js
const { SYSTEM_RASTREO, prepararRastreo, mensajeUsuario } = require('./rastreo-para-ia');

// Devuelve { ok: true, replies } o { ok: false, error }, igual que suggest().
async function suggestTracking({ storedKey, tracking, customerMessage, accountName }) {
  const anthropic = getClient(storedKey);
  if (!anthropic) return { ok: false, error: 'Falta la clave de Anthropic. Ponla en "Configurar".', needsKey: true };
  const rastreo = prepararRastreo(tracking);
  if (!rastreo) return { ok: false, error: 'No hay un resultado de rastreo válido para este envío.' };

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      system: [{ type: 'text', text: SYSTEM_RASTREO, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: mensajeUsuario({ rastreo, customerMessage, accountName }) }],
    });
    if (response.stop_reason === 'refusal') return { ok: false, error: 'La IA no pudo responder a este mensaje. Escribe la respuesta a mano.' };
    const block = response.content.find((b) => b.type === 'text');
    const data = block ? JSON.parse(block.text) : null;
    const replies = (data && Array.isArray(data.replies) ? data.replies : [])
      .filter((r) => r && typeof r.text === 'string' && r.text.trim())
      .slice(0, 3)
      .map((r) => ({ label: String(r.label || 'Estado del envío').slice(0, 40), text: r.text.trim().slice(0, 1500) }));
    // Respaldo: si la IA no devuelve nada usable, se ofrece el texto verificado de la skill.
    if (!replies.length && rastreo.respuesta_cliente) return { ok: true, replies: [{ label: 'Estado del envío', text: rastreo.respuesta_cliente }] };
    if (!replies.length) return { ok: false, error: 'La IA no devolvió respuestas. Inténtalo otra vez.' };
    return { ok: true, replies };
  } catch (err) {
    // Mismo manejo que suggest(): AuthenticationError, RateLimitError, APIConnectionError, etc.
    const Anthropic = loadSdk();
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'La clave de Anthropic no es válida. Revísala en "Configurar".', needsKey: true };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'Demasiadas consultas seguidas o sin saldo en tu cuenta de Anthropic. Espera un momento o revisa tu saldo.' };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Sin conexión a internet. Inténtalo de nuevo.' };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `El servicio de IA respondió con un error (${err.status}). Inténtalo de nuevo.` };
    if (err instanceof SyntaxError) return { ok: false, error: 'La respuesta de la IA llegó incompleta. Inténtalo otra vez.' };
    return { ok: false, error: 'No se pudo usar la IA. Inténtalo de nuevo.' };
  }
}

module.exports = { suggest, suggestTracking, encryptKey, decryptKey };
```

## 3. Obtener el JSON de rastreo (proceso principal)

Boceto para `src/main.js`, junto al `ipcMain.handle('ai:suggest', ...)` que ya
existe. `rastrear()` nunca lanza excepciones y siempre devuelve el contrato 2.0:

```js
const { rastrear } = require('./rastrear-envio/lib/rastrear');

ipcMain.handle('ai:track', async (_e, { orden, codigo, text, accountName }) => {
  if (locked) return { ok: false, error: 'MultiChat está bloqueado.' };
  const tracking = await rastrear({ orden, codigo }); // sin --con-destinatario
  return assistant.suggestTracking({ storedKey: settings.aiKey, tracking, customerMessage: text, accountName });
});
```

- No guardes `codigo`, `tracking` ni las respuestas en `store.js`, en
  registros ni en la copia de seguridad.
- Nunca pases `conDestinatario: true` en este flujo: ese detalle es para el
  vendedor, no para la IA ni para el cliente.
- Una consulta por clic del vendedor. Sin revisiones automáticas en lote.

## 4. Lo que falta decidir en MultiChat

- **De dónde salen la orden y el código.** Opciones: un formulario pequeño en
  el panel ✨, o leerlos del texto seleccionado (p. ej. con
  `tickets.parseSelection`). Si faltan, el panel debe pedirlos; la IA no debe
  adivinarlos.
- **Empaquetado.** La skill necesita `playwright@1.63.0` y Chromium (unos
  150 MB). Agregarlos al instalador aumenta mucho su tamaño. La alternativa es
  descargar Chromium la primera vez que se usa el rastreo (`npx playwright install
  chromium`) y mostrar «Falta preparar el rastreo» cuando la skill devuelve el
  código `dependencia`.
- **Mac/Windows.** La skill funciona en ambos, pero solo se probó en Linux con
  páginas simuladas.

## 5. Pruebas

`test/multichat.test.js` (en esta skill) comprueba que `prepararRastreo` deja
pasar solo la lista blanca (sin orden, detalle ni campos desconocidos), reduce
los errores a su código, rechaza JSON de otro contrato o con fechas mal
formadas, y que el prompt contiene las reglas críticas y no tiene variables.

Pendiente, con una clave de Anthropic: correr `suggestTracking` sobre los
casos de `test/fixtures/servidor.js` (tránsito, destino con y sin fecha,
entregado, no encontrada, bloqueo) y revisar que ninguna respuesta mencione
plazos, requisitos de recojo o la fecha de registro como llegada.
