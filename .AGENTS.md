# Instrucciones del proyecto

## Contexto general
Este es un proyecto de software universitario (materia SW1). El repositorio de código
es público/compartido con la clase. La documentación del proyecto vive en un vault de
Obsidian **fuera de este repo**, conectado vía MCP con el nombre de servidor `obsidian`.

Ruta del vault: `C:\Users\HP\Documents\Universidad\SW1\Examen1\proyectoe1-sw1-vault\ProyectoE1SW1-Vault`

## Regla principal
Antes de trabajar en cualquier tarea, SIEMPRE consulta el vault de Obsidian primero.
No asumas contexto ni preguntes cosas que ya están documentadas ahí — búscalas.
Al terminar, SIEMPRE deja constancia en el vault de lo que hiciste, en la nota
correspondiente. Nunca hagas trabajo real (planear o codear) sin dejar rastro escrito.

## Estructura del vault
- `00-Ideas-Sueltas/` — ideas crudas sin formalizar, revisar por si hay pendientes de ordenar
- `01-Fundamentacion-Teorica/` — marco teórico del examen
- `02-PUDS-Registro/` — registro del proceso de desarrollo por fases
- `03-Casos-de-Uso/` — actores y casos de uso, fuente de verdad de requerimientos
- `04-Tareas/` — sistema de tareas con estado (ver flujo abajo)
- `05-Mecanismo-Aprendizaje-Usuario/` — diseño del agente/mecanismo de ayuda al usuario
- `06-Anexos/` — estándares y documentación complementaria

## Flujo de trabajo por tarea (planificador / ejecutor)
Cada tarea es una nota basada en `04-Tareas/_Plantilla-Tarea.md`, con frontmatter
`estado: pendiente | en-plan | en-ejecucion | bloqueada | completada`.

- Si te piden **planificar** una tarea:
  1. Busca o crea la nota en `04-Tareas/pendientes/` (duplicando la plantilla).
  2. Lee las notas relevantes en `03-Casos-de-Uso/` y `01-Fundamentacion-Teorica/`
     antes de proponer el plan.
  3. Llena SOLO la sección "Plan". No toques "Ejecución".
  4. Cambia `estado: en-plan`, actualiza `fecha_actualizacion`, y mueve la nota a
     `04-Tareas/en-plan/`.

- Si te piden **ejecutar** una tarea:
  1. Busca la nota en `04-Tareas/en-plan/` o `04-Tareas/en-ejecucion/`.
  2. Lee la sección "Plan" completa antes de escribir código.
  3. Implementa siguiendo el plan. Si te desvías, anótalo en "Desviaciones" con el motivo.
  4. Llena SOLO la sección "Ejecución". No reescribas el "Plan" original.
  5. Cambia `estado: en-ejecucion` (o `completada` si terminó), mueve la nota a la
     carpeta correspondiente.

- Nunca borres contenido ya escrito por otro agente en una sección que no te corresponde.
  Si necesitas corregir algo del plan, agrégalo en "Desviaciones", no lo edites directo.

## Convenciones de notas
- Nombres de archivo en `PascalCase-con-guiones.md`.
- Usa enlaces internos `[[NombreNota]]` al referenciar actores, casos de uso o tareas
  relacionadas, para mantener el grafo de Obsidian útil.
- No dupliques información: si algo ya está documentado en otra nota, enlázala en vez
  de copiarla.

## Al terminar cualquier sesión de trabajo
Antes de cerrar, confirma que:
1. La nota de la tarea quedó en la carpeta de estado correcta.
2. El frontmatter (`estado`, `fecha_actualizacion`, `agente_plan` o `agente_ejecucion`)
   está actualizado.
3. Si surgió una idea nueva fuera del alcance de la tarea actual, la dejaste anotada en
   `00-Ideas-Sueltas/` en vez de perderla o resolverla sin documentar.

## Diseño y Desarrollo Frontend (Skill Impeccable)
Para el desarrollo de la interfaz de usuario en `frontend/`, los agentes deben aplicar la skill **`impeccable`** ubicada en `.agents/skills/impeccable/`.

### Propósito y Filosofía
- **Cero "AI Slop"**: Prohibido generar interfaces genéricas de IA (como fondos planos beige/gris sin matiz, degradados violeta-azul cliché, uso indiscriminado de fuentes por defecto como Inter para todo, tarjetas anidadas sin sentido, o botones sin jerarquía clara ni contraste adecuado).
- **Calidad de Diseño y Artesanía**: Cada componente y pantalla debe tener jerarquía visual deliberada, contraste accesible (mínimo WCAG AA), espaciado rítmico, tipografía intencional y estados de interacción pulidos (hover, active, focus, disabled, loading).

### Protocolo para Agentes al Trabajar en UI
1. **Antes de editar cualquier archivo de UI**:
   - Consultar la skill en `.agents/skills/impeccable/SKILL.md`.
   - Leer obligatoriamente el piso de calidad y anti-patrones prohibidos en `.agents/skills/impeccable/reference/craft-floor.md`.
   - Si no existe `PRODUCT.md` o `DESIGN.md`, el agente debe guiarse por la documentación del vault en Obsidian (`03-Casos-de-Uso/` y `06-Anexos/`) para mantener la coherencia de marca, actores y requerimientos del proyecto.
2. **Guías y Comandos de Referencia**:
   - **Planificación / Conceptualización**: Seguir [shape.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/shape.md) y [new-work.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/new-work.md).
   - **Revisión y Pase Final**: Aplicar [polish.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/polish.md) antes de dar por cerrada cualquier tarea visual.
   - **Auditoría Técnica**: Aplicar [audit.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/audit.md) para verificar responsive, accesibilidad a11y y rendimiento.
   - **Simplificación y Jerarquía**: Usar [distill.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/distill.md) y [clarify.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/clarify.md) cuando la UI esté sobrecargada o la redacción sea confusa.
   - **Robustez**: Seguir [harden.md](file:///c:/Users/HP/Documents/Universidad/SW1/Examen1/Proyecto/.agents/skills/impeccable/reference/harden.md) para estados vacíos, errores, cadenas de texto largas y edge cases.
3. **Modo Directo (Sin dependencia del binario externo)**:
   - Si el launcher ejecutable `.agents/skills/impeccable/scripts/impeccable.cmd` no está presente o falla por restricciones de red/entorno, el agente **no se bloquea**: debe leer directamente los archivos markdown en `.agents/skills/impeccable/reference/` y aplicar las reglas de diseño y calidad analíticamente en el código.

## Ecosistema de Skills y Calidad de Código en el Proyecto
El proyecto cuenta con un conjunto de skills en `.agents/skills/` diseñadas para maximizar la efectividad en la escritura de código y minimizar errores de desarrollo:

1. **`vercel-react-best-practices` (`.agents/skills/vercel-react-best-practices/SKILL.md`)**:
   - **Cuándo usar:** Al escribir, revisar o refactorizar componentes React, Zustand stores, hooks y lógica de cliente.
   - **Impacto:** Aplica las ~70 reglas de optimización de Vercel Engineering para evitar bucles infinitos de re-renderizado, fugas de memoria en `useEffect`, cuellos de botella asíncronos y cascadas de red innecesarias.

2. **`node-express-prisma-backend` (`.agents/skills/node-express-prisma-backend/SKILL.md`)**:
   - **Cuándo usar:** Al desarrollar controladores, rutas, modelos Prisma, transacciones o sockets en `backend/`.
   - **Impacto:** Exige captura obligatoria de errores asíncronos (evita caídas del servidor por `UnhandledPromiseRejection`), transacciones atómicas con `prisma.$transaction`, prevención del problema N+1, y gestión limpia de eventos Socket.io sin fugas de memoria.

3. **`test-driven-development` (`.agents/skills/test-driven-development/SKILL.md`)**:
   - **Cuándo usar:** Al implementar nuevas funcionalidades, corregir bugs o realizar refactorizaciones críticas.
   - **Impacto:** Enfoque Red-Green-Refactor. Asegura que el código cuente con pruebas y validación antes de darse por completado, eliminando regresiones.

4. **`find-skills` (`.agents/skills/find-skills/SKILL.md`)**:
   - **Cuándo usar:** Cuando surja una necesidad técnica especializada que no esté cubierta por las skills actuales.
   - **Impacto:** Meta-skill oficial de Vercel Labs (`agenticskills.io` / `skills.sh`) que permite al agente buscar e incorporar nuevas habilidades al proyecto mediante `npx skills find` y `npx skills add`.


