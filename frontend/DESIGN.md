# Sistema visual — CASE IA

## Dirección

La landing presenta una herramienta académica de ingeniería, no un producto comercial terminado. La interfaz usa una estética técnica y sobria: fondo azul noche, superficies sólidas, bordes finos y una jerarquía tipográfica clara. No usa glassmorphism, texto degradado, halos ni tarjetas decorativas repetidas.

## Tokens

La fuente de verdad está en `src/styles/tokens.css`.

| Rol | Token | Valor |
| --- | --- | --- |
| Fondo | `--color-bg-base` | `#0B0F1A` |
| Superficie | `--color-bg-elevated` | `#111827` |
| Borde | `--color-border` | `#2B3A52` |
| Texto principal | `--color-text-primary` | `#F4F7FF` |
| Texto secundario | `--color-text-secondary` | `#A5B4CC` |
| Texto atenuado | `--color-text-muted` | `#7F91AD` |
| Acento | `--color-accent` | `#405BD6` |
| Acento hover | `--color-accent-hover` | `#4A66E0` |
| Foco | `--color-focus` | `#9DB0FF` |
| Éxito | `--color-success` | `#22D3A0` |
| Advertencia | `--color-warning` | `#F4C76B` |
| Error | `--color-error` | `#FF8A99` |
| Overlay | `--color-overlay` | `rgba(4, 7, 13, 0.78)` |

- Títulos y cuerpo: Sora, pesos 400, 600 y 700.
- UML, código y etiquetas técnicas: JetBrains Mono 400.
- Ambas familias se empaquetan como WOFF2 mediante Fontsource y no dependen de internet.
- Radios: 8 px para controles y 12 px para superficies principales.
- Ancho máximo: 1200 px. El texto descriptivo se limita aproximadamente a 65–70 caracteres.

## Composición y comportamiento

- El hero usa dos columnas desde 961 px y una sola columna debajo de ese ancho.
- En móvil, el contenido precede al ejemplo técnico y los CTA principales ocupan todo el ancho.
- Las capacidades son filas separadas por líneas; no se representan como cards.
- La única animación es el avance de la línea del flujo. Todo el contenido permanece visible y `prefers-reduced-motion` elimina el movimiento.
- `/` contiene la presentación pública y `/app` ofrece una demostración local del editor UML, sin guardado en el servidor. `/sesion/:sesionId` carga y guarda el diagrama de una sesión.

## Superficies de acceso y administración

- `/login` usa una composición dividida en escritorio: contexto de producto a la izquierda y un formulario directo a la derecha. Debajo de 900 px se conserva solo la marca y se prioriza el acceso.
- `/admin` adopta el modo operativo: cabecera persistente, navegación lateral en escritorio y navegación horizontal compacta en móvil. La información se presenta en tablas, no en tarjetas de métricas.
- El índigo queda reservado para acción primaria, sección seleccionada y foco. Verde, ámbar y rojo se usan únicamente para estado, advertencia y error.
- Las tablas mantienen su desplazamiento horizontal dentro del área de trabajo en pantallas estrechas; nunca ensanchan el documento.
- Los diálogos bloquean el fondo, confinan el foco, cierran con `Escape` y devuelven el foco al control de apertura.
- Los campos respetan el tema oscuro también cuando el navegador aplica autocompletado.

## Editor UML

- El lienzo ocupa el espacio central, con cabecera compacta, herramientas que pueden distribuirse en varias filas y propiedades a la derecha. La composición se ajusta al viewport, sin el límite de ancho de la landing.
- El panel de propiedades mide 320 px en escritorio y 280 px hasta 850 px. Hasta 620 px pasa debajo del lienzo, que conserva una altura de 52svh y un mínimo de 320 px; el documento permite desplazamiento vertical.
- El canvas hereda los colores de `src/styles/tokens.css`; no define una paleta propia. La rejilla de puntos acompaña el paneo y el zoom. Las clases usan tres compartimentos, Sora para el nombre y JetBrains Mono para firmas y multiplicidades; el foco destaca selección y anclajes.
- La lista HTML de elementos permite seleccionar y conectar con teclado. Los campos del panel permiten editar miembros y posición sin depender del arrastre sobre el canvas.
- Guardar es la acción primaria. La cabecera distingue cambios pendientes, guardado en curso, versión guardada y solo lectura; la demo mantiene el guardado deshabilitado. Los errores conservan las ediciones y ofrecen descarga JSON; la recuperación de un borrador local requiere una acción explícita.
- La eliminación de una clase exige confirmación junto al control e informa que se eliminarán también sus relaciones. El modo de conexión muestra origen/destino y una acción para cancelar.
- El lienzo se carga bajo demanda con un estado de preparación visible. La carga, el vacío y el error usan mensajes accionables; no se añade animación decorativa.
- El contrato específico de la superficie y su modo Operate están en `.impeccable/surfaces/uml-editor.md`.

### Colaboración en vivo (CU-06)

- En `/sesion/:sesionId`, la cabecera muestra la presencia recibida del servidor para participantes autenticados. Presenta hasta cinco avatares con inicial, nombre y tooltip de rol o permiso; el resto se resume como `+N`. La demo local no muestra esta barra.
- La conexión tiene tres estados con texto e icono: `connecting` («Conectando…»), `online` (cantidad «en línea», usando el token de éxito) y `offline` («Sin conexión en vivo»). Este indicador es independiente del guardado del diagrama.
- Hasta 850 px se ocultan los nombres visibles y se conservan avatares y tooltips. Hasta 620 px la presencia ocupa una fila completa de la cabecera, con el estado a la izquierda y los avatares a continuación.
- Los cursores remotos muestran puntero y nombre en Sora dentro de una capa Konva con `listening={false}`: acompañan el paneo y el zoom sin interceptar selección o arrastre. Su movimiento representa actividad del participante, sin animación decorativa.
- Avatares y cursores comparten el color de identidad asignado por el servidor. La paleta de colaboración está definida en `backend/src/sockets/umlSocket.ts`: `#22D3A0`, `#F4C76B`, `#FF8A99`, `#9DB0FF`, `#56B4E9` y `#E69F00`. En estos elementos el color identifica al participante, no su estado o permiso; puede repetirse cuando se agota la paleta, por lo que siempre se acompaña de inicial o nombre. Esta paleta no modifica los tokens generales de la interfaz.
- Los avisos de colaboración reutilizan fondos semánticos existentes: advertencia para desconexión, error para fallos y acento suave para conflictos. Los fallos se anuncian como alerta y permiten cerrar el aviso; los conflictos indican qué participante prevaleció y ofrecen «Entendido». La desconexión informa que los cambios permanecen locales hasta reconectar.
- Al recibir una restricción de permisos en vivo o un error de acceso revocado, el editor pasa a solo lectura y deshabilita creación, arrastre, edición de propiedades y guardado. La selección y la inspección del diagrama siguen disponibles.

### Administración de colaboradores (CU-04)

- El anfitrión abre «Colaboradores» desde la cabecera del editor. El modal reutiliza superficie elevada, overlay, borde y sombra de diálogo existentes; tiene un ancho máximo de 46rem y desplazamiento interno. Hasta 620 px se ancla al borde inferior, ocupa todo el ancho y limita su altura a 92svh. Los controles conservan al menos 44 px de altura.
- La información se ordena como código de acceso, conteo y filas de participantes. El código usa tipografía monoespaciada y permite copiar con confirmación «Código copiado». El anfitrión aparece primero, con escudo, etiqueta en color de advertencia y «Edición completa» fijo; los colaboradores se ordenan por nombre, sin tarjetas individuales.
- Cada fila muestra inicial, nombre, correo y estado escrito («En línea» o «Desconectado») acompañado de un punto. La presencia usa el color de identidad para el avatar y el token de éxito para el estado en línea; los desconectados usan texto atenuado y siguen disponibles para administrar sus permisos. En móvil, permisos y acción de remover pasan debajo de la identidad.
- El selector «Edición / Solo lectura» incluye icono de lápiz u ojo y nombre accesible del participante. Un cambio pendiente deshabilita los controles de administración; un fallo restaura el permiso anterior y muestra una alerta en el modal. El usuario afectado recibe un aviso de estado con fondo de acento suave y acción «Entendido» en el editor.
- Remover utiliza color de error y abre una confirmación dentro del mismo modal con el nombre del colaborador y las consecuencias para su acceso. El foco inicial va a «Cancelar»; la confirmación destructiva tiene fondo de error y muestra «Removiendo…» mientras se procesa. El diálogo confina la navegación con Tab y devuelve el foco al control de apertura al cerrar; Escape cancela la confirmación o cierra el modal cuando no hay una operación pendiente.
- Tras la expulsión, el colaborador llega al dashboard y ve el mensaje recibido en un aviso descartable con `role="status"`, superficie elevada y borde izquierdo de acento. El motivo permanece visible hasta que se cierra el aviso.

### Intercambio XMI (CU-09)

- «Importar XMI» y «Exportar XMI» aparecen en la cabecera de una sesión únicamente para el anfitrión. Ambas acciones exigen que no existan cambios locales pendientes, de modo que el archivo y la versión persistida nunca diverjan silenciosamente.
- El diálogo de importación usa la superficie elevada y el overlay del sistema, con un ancho máximo de 40rem. Acepta selección o arrastre de `.xmi` y `.xml`, limita el archivo a 5 MB y muestra nombre, tamaño y un resumen monoespaciado de clases, interfaces, atributos, métodos y relaciones.
- Cuando ya existe un modelo, «Fusionar» es la opción predeterminada y explica que conserva lo existente. «Reemplazar» declara que sustituirá clases y relaciones, y añade una advertencia de error sólo después de seleccionarlo. No se usa un diálogo extra.
- En móvil, el diálogo se ancla abajo, ocupa el ancho disponible y apila las estrategias y acciones; el contenido conserva desplazamiento interno dentro de 94svh. En escritorio, las estrategias se comparan en dos columnas.
- El diálogo confina Tab, cierra con Escape si no hay una operación pendiente, restaura el foco y bloquea el desplazamiento del fondo. Los estados ocupado, error y archivo inválido permanecen dentro del diálogo y son anunciados semánticamente.
- La vista previa del navegador sólo inspecciona y cuenta XML; el backend es la autoridad que interpreta, normaliza, fusiona, valida y persiste XMI. Tras importar, el diagrama completo y el reporte UML se aplican atómicamente y se difunden a la sala mediante `diagram:replaced`.
- Los avisos exitosos usan el token suave de éxito y los fallos el token de error. La exportación respeta el nombre enviado por `Content-Disposition`, expuesto explícitamente por CORS.

## Accesibilidad

- Contraste objetivo: WCAG AA como mínimo.
- Foco visible global con un contorno de 3 px y navegación en orden lógico.
- Enlace para saltar al contenido, landmarks semánticos y títulos jerárquicos.
- Objetivos táctiles principales de al menos 44 px.
- El diseño fue comprobado sin desbordamiento horizontal en 320, 390, 768, 1024 y 1440 px.
- Las combinaciones principales verificadas superan AA: texto principal/fondo 17.85:1, secundario/fondo 9.11:1, atenuado/fondo 5.97:1 y blanco/acento 5.70:1.
