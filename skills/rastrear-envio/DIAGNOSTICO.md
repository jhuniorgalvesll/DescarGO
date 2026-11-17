# Diagnóstico de la versión original (skills-finangher, `rastrear-envio`)

Revisión de `rastrear-envio/scripts/rastrear-shalom.js`, `SKILL.md` y
`README.md` antes de modificarlos. Referencias de línea al script original.

## Fallos

| # | Hallazgo | Impacto |
|---|---|---|
| F1 | `registrado_el` se toma del elemento contiguo a «N° DE ORDEN:» (l. 73, 91) sin comprobar que sea una fecha de registro. A la vez, `SKILL.md` indica responder «ya está en destino **desde el** 14/11» usando esa fecha | Se afirma la llegada a destino con una fecha que puede ser de registro |
| F2 | No hay `en_destino_el`. Solo se leen dos fechas, y la de entrega sale del texto del detalle (l. 92), que contiene nombre y DNI | El README promete «con sus fechas» para cada estado |
| F3 | No se verifica que el resultado corresponda a la orden consultada: el número mostrado nunca se compara | Riesgo de informar el estado de otra orden |
| F4 | Un solo código (4) agrupa «página cambió», tiempo de espera, error de red, CAPTCHA, Chromium no instalado y cualquier excepción (l. 105-111) | No se puede saber si conviene reintentar ni a quién avisar |
| F5 | No detecta CAPTCHA ni bloqueos, aunque `SKILL.md` reconoce que la página usa reCAPTCHA | Un reto se reporta como «sin respuesta» |
| F6 | `waitUntil: 'networkidle'` (l. 45) con reCAPTCHA y analítica cargando puede no cumplirse nunca | Tiempos de espera falsos |
| F7 | Sin reintentos para fallos transitorios; tiempos fijos de 45 s y 30 s | Fallos ocasionales sin recuperación; espera total de hasta 75 s |
| F8 | `mensaje: error.message` (l. 110) expone mensajes crudos de Playwright, que pueden incluir selectores, URLs o valores escritos | Posible fuga del código del ticket |
| F9 | `--con-destinatario` devuelve el detalle completo (nombre y DNI sin enmascarar) y no documenta condiciones más allá de una línea | Datos personales sin minimizar |
| F10 | Las fechas se devuelven como `dd/mm/aa hh:mm`, sin año completo ni zona horaria, y sin validar (acepta 31/02) | Ambigüedad para quien consume el JSON |
| F11 | Estado leído de `.text-4xl` y barra de `.bg-red-600` / `.relative .absolute > div` (clases de estilo Tailwind). La tarjeta se ubica subiendo exactamente 4 niveles en el DOM | Se rompe con cualquier cambio de diseño |
| F12 | El error de validación (salida 2) no incluye `transportista`, `orden` ni `consultado_en`: estructura distinta al resto | Contrato inconsistente |
| F13 | `estado` (título libre) y `etapa` (barra) pueden discrepar sin que se detecte; el título no se normaliza | Estados no uniformes |
| F14 | `SKILL.md` pide recordar «la clave de seguridad y el plazo de recojo» al estar en destino; el script no verifica ninguno de los dos | Requisitos y plazos inventados en la respuesta |

## Dependencias e instalación

- No hay `package.json` ni archivo de bloqueo: `npm install playwright` instala
  la última versión disponible en ese momento. Instalación no reproducible.
- El README exige Node 18, pero Playwright 1.6x requiere Node `>=20`.
- No se documentan las dependencias del sistema de Chromium para servidores
  Linux (`--with-deps`).

## Diferencias entre documentación y comportamiento

| Documentación | Comportamiento real |
|---|---|
| «responde el estado… con sus fechas» | Solo registro y, si está entregado, entrega |
| Ejemplo JSON sin `consultado_en` | El script sí lo incluye |
| «4: la página cambió o no respondió» | También cubre CAPTCHA, Chromium ausente y errores internos |
| «Si Shalom cambia su página, la skill avisa» | Un cambio que conserve «N° DE ORDEN:» pero mueva clases puede producir un estado vacío o erróneo |
| «el script omite» nombre y DNI | Correcto en la salida, pero no en `error.message` (F8) |

## Lo que se conservó

- Enfoque de una consulta bajo demanda y el principio «el script navega, el
  modelo redacta».
- Nombres accesibles de los campos (`N° de Orden`, `Código de Orden`, `Buscar`)
  y textos `N° DE ORDEN:` / `No se encontró la orden`, verificados por el autor
  original contra la página real.
- Códigos de salida 0, 2 y 3 con el mismo significado.
