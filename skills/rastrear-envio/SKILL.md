---
name: rastrear-envio
description: >
  Consultar el estado de un envío de Shalom con el número de orden y el código
  de 4 caracteres del ticket, y responder al cliente con información verificada.
  Usar cuando pregunten "¿dónde está mi pedido?", "¿ya llegó el paquete?",
  "rastrea este envío", "estado del envío", "consulta en Shalom", o cuando haya
  un número de orden y un código de un ticket de Shalom. Solo lectura: no inicia
  sesión, no crea guías y no pide contraseñas.
---

# /rastrear-envio — Estado de un envío de Shalom

## Principios

- **El script navega; el modelo solo redacta.** Nunca recorrer la página de
  Shalom clic por clic con el modelo ni con otras herramientas de navegador.
- **Una consulta, cuando alguien pregunta.** No revisar pedidos en lote ni de
  forma periódica. No repetir la consulta en bucle si falla.
- **Solo lo que dice la página.** No inventar estados, fechas, plazos,
  requisitos de recojo ni direcciones de agencia.

## Datos necesarios

| Dato | Formato | Dónde está |
|---|---|---|
| Número de orden | 8 a 12 dígitos | Ticket de Shalom |
| Código | 4 letras o números | Ticket de Shalom, junto al número |

Si falta alguno, pedirlo. No adivinar el código.

## Cómo consultar

Desde la carpeta de esta skill (dependencias instaladas, ver `README.md`):

```bash
node scripts/rastrear-shalom.js <orden> <codigo>
```

Imprime **un** objeto JSON por stdout y termina con un código de salida.

```json
{
  "transportista": "shalom",
  "version_contrato": "2.0",
  "orden": "100000000",
  "ok": true,
  "estado": "En destino",
  "registrado_el": null,
  "en_destino_el": null,
  "entregado_el": null,
  "consultado_en": "2026-11-17T02:00:00Z",
  "intentos": 1,
  "respuesta_cliente": "Tu envío ya está en la agencia de destino.",
  "error": null
}
```

(Ejemplo de estructura, no es un envío real.)

| Salida | `error.codigo` | Qué hacer |
|---|---|---|
| `0` | — | Responder con `respuesta_cliente` |
| `2` | `datos_invalidos` | Pedir que revisen el número y el código del ticket |
| `3` | `no_encontrada` | Pedir que revisen el número y el código del ticket |
| `4` | `pagina_cambio`, `orden_no_coincide` | Respuesta de consulta fallida; avisar al vendedor que hay que revisar la skill |
| `5` | `conexion`, `tiempo_espera` | Respuesta de consulta fallida; se puede intentar otra vez más tarde |
| `6` | `bloqueo` | Respuesta de consulta fallida. **No reintentar ni intentar resolver el CAPTCHA** |
| `7` | `dependencia` | Avisar al vendedor: falta instalar Playwright o Chromium |
| `1` | `interno` | Respuesta de consulta fallida; avisar al vendedor |

## Cómo responder al cliente

- Usar `respuesta_cliente` tal cual o con cambios mínimos de tono. Ya está en
  español sencillo y solo incluye fechas verificadas.
- Las fechas `null` **no se mencionan**. Nunca usar `registrado_el` para decir
  desde cuándo está en destino.
- No agregar plazos de recojo, horarios, documentos requeridos ni direcciones
  de agencia: el script no los verifica.
- Si `estado_reconocido` es `false`, Shalom mostró un estado nuevo; citarlo sin
  interpretarlo.
- Ante cualquier error que no sea 2 o 3: «No pudimos consultar tu envío en este
  momento. Inténtalo nuevamente más tarde.»

## Datos personales

- La salida habitual no incluye nombres, DNI, teléfonos ni direcciones.
- No escribir el código del ticket en respuestas, notas, registros ni grupos.
- `--con-destinatario` agrega `detalle_destinatario` (el texto de entrega de
  Shalom con el nombre de quien recogió; DNI reducido a sus 3 últimos dígitos;
  teléfonos y direcciones ocultos). Usarlo **solo** cuando el personal de
  Fertisem lo pide en un canal privado para verificar una entrega. **Nunca**
  copiar ese campo a la respuesta del cliente, a grupos ni a registros.

## Fuera de alcance

- Crear o modificar guías (operación real y cobrable: requiere persona).
- Cuentas Shalom Pro, otros transportistas, WooCommerce o WhatsApp.
