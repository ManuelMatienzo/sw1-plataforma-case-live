# Plataforma CASE Colaborativa - Backend API & WebSocket Server

Backend de la Plataforma CASE Colaborativa con IA Embebida para Modelado de Software (SW1).

## Tecnologías

- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Comunicación en Tiempo Real:** Socket.io (Protocolo WebSocket bidireccional)
- **ORM & Base de Datos:** Prisma ORM + PostgreSQL
- **Autenticación:** JWT (JSON Web Tokens) con RBAC (Anfitrión, Colaborador, Administrador)
- **Validación Semántica:** Motor determinista UML 2.5 OMG
- **Procesamiento de Voz & Lenguaje Natural:** Integración con Google Gemini AI + Parser local

## Casos de Uso Implementados

- **CU-01:** Autenticación y gestión de usuarios y proyectos
- **CU-02:** Gestión de sesiones colaborativas
- **CU-03:** Chat y mensajería en tiempo real por sesión
- **CU-04:** Administración de permisos y expulsión de colaboradores
- **CU-05:** Persistencia de diagramas de clases UML (AST en PostgreSQL)
- **CU-06:** Sincronización en tiempo real y resolución de conflictos (LWW)
- **CU-07:** Asistencia por comandos de voz con IA
- **CU-08:** Validación formal del modelo UML 2.5
- **CU-09:** Importación y exportación de modelos XMI 2.1 compatibles con Enterprise Architect 15

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Generar cliente Prisma
npx prisma generate

# Iniciar en modo desarrollo
npm run dev

# Compilar para producción
npm run build

# Ejecutar suite de pruebas
npm test
```
