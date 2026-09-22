---
name: node-express-prisma-backend
description: Use when developing, reviewing, or refactoring backend code in Node.js, Express, TypeScript, Prisma ORM, and Socket.io. Enforces robust async error handling, safe database transactions, strict typing, secure JWT auth, and prevents server crashes and memory leaks.
---

# Node.js, Express & Prisma Backend Best Practices

Guia tecnica y estandar de desarrollo backend para el proyecto CASE Platform. Disenado para garantizar robustez, eliminar fallos en tiempo de ejecucion, prevenir caidas del servidor y asegurar un rendimiento optimo.

---

## 1. Manejo Defensivo de Errores Asincronos en Express

### La Regla de Oro
> Nunca dejes una promesa sin capturar. En Express, una excepcion asincrona no capturada puede provocar un UnhandledPromiseRejection y colapsar el proceso Node.js.

* **Usa siempre try / catch o wrappers asincronos:**
  En cada controlador asincrono, captura cualquier error y delega con `next(error)`:
  ```typescript
  export const getProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const project = await prisma.project.findUnique({ where: { id: Number(id) } });
      if (!project) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }
      return res.json(project);
    } catch (error) {
      next(error);
    }
  };
  ```

* **Middleware de Errores Centralizado:**
  Todos los controladores deben delegar al middleware central de errores (`errorHandler`). Este middleware debe normalizar las respuestas HTTP y evitar exponer stack traces sensibles al cliente.

---

## 2. Buenas Practicas con Prisma ORM

### Prevencion de Errores y Cuellos de Botella

* **Evitar el problema N+1:**
  Nunca realices consultas dentro de bucles `for` o `map`. Usa siempre `include` o `select` para cargar relaciones en una unica consulta:
  ```typescript
  // CORRECTO: Una sola consulta eficiente con Prisma
  const diagrams = await prisma.diagram.findMany({
    where: { projectId },
    include: { elements: true, relations: true },
  });
  ```

* **Transacciones Atomicas (`prisma.$transaction`):**
  Cuando una operacion modifique multiples tablas o registros interdependientes (por ejemplo, guardar elementos y relaciones de un diagrama CASE), envuelvela en una transaccion para evitar inconsistencias si una parte falla:
  ```typescript
  await prisma.$transaction(async (tx) => {
    await tx.element.deleteMany({ where: { diagramId } });
    await tx.element.createMany({ data: newElements });
  });
  ```

* **Manejo Especifico de Codigos de Error de Prisma:**
  - `P2002`: Conflicto de restriccion unica (ej. email o nombre de proyecto ya en uso). Retornar `409 Conflict`.
  - `P2025`: Registro no encontrado para actualizar o eliminar. Retornar `404 Not Found`.
  - `P2003`: Violacion de clave foranea. Retornar `400 Bad Request`.

* **Seguridad de Datos Sensibles:**
  Nunca devuelvas hashes de contrasenas (`password`) en las respuestas API. Utiliza `select` para omitir el campo o desestructuralo antes de responder:
  ```typescript
  const { password: _, ...userSafe } = user;
  return res.json(userSafe);
  ```

---

## 3. Arquitectura y Estabilidad de Socket.io (Colaboracion en Tiempo Real)

* **Aislamiento por Salas (Rooms):**
  Los eventos de dibujo o edicion colaborativa de diagramas UML deben emitirse exclusivamente a la sala del proyecto o diagrama correspondiente:
  ```typescript
  socket.to(`project:${projectId}`).emit('diagram:element_updated', payload);
  ```

* **Validacion de Payloads Recibidos:**
  Nunca retransmitas datos de un cliente socket a otros sin validar su estructura basica (coordenadas numericas, id de elemento, tipo de evento valido).

* **Limpieza en Desconexion (`disconnect`):**
  Limpia las salas, estados de presencia o bloqueos temporales del usuario cuando ocurra el evento `disconnect`, evitando usuarios fantasma o fugas de memoria.

---

## 4. Tipado Estricto y Validacion de Entradas (TypeScript)

* **Cero `any`:**
  Tipa explicitamente los DTOs (Data Transfer Objects), respuestas y parametros de rutas.
* **Validacion de IDs numericos y UUIDs:**
  Antes de pasar un parametro de URL a Prisma, valida y convierte adecuadamente:
  ```typescript
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  ```

---

## 5. Generador de Codigo Spring Boot (Modulo CASE)

Para la funcionalidad de generacion de backend Spring Boot a partir del diagrama de clases UML:
1. **Validacion Sintactica UML previa:** Comprobar que los nombres de clase sean identificadores Java validos (PascalCase, sin caracteres especiales ni palabras reservadas).
2. **Mapeo de Tipos OMG UML a Java:**
   - `String` / `Text` -> `String`
   - `Integer` / `int` -> `Integer` o `Long` (para IDs)
   - `Boolean` -> `Boolean`
   - `Float` / `Double` / `Real` -> `Double` o `BigDecimal`
   - `Date` / `DateTime` -> `LocalDate` o `LocalDateTime`
3. **Estructura Estandar Spring Boot 3+:**
   - Modelos con anotaciones JPA (`@Entity`, `@Table`, `@Id`, `@GeneratedValue(strategy = GenerationType.IDENTITY)`).
   - Relaciones correctas: `@OneToMany`, `@ManyToOne`, `@ManyToMany` con atributos `mappedBy` y `cascade`.
   - Interfaces Repository con Spring Data JPA (`JpaRepository<Entity, Long>`).
   - Controladores REST (`@RestController`, `@RequestMapping`).
