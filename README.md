# Plataforma CASE Colaborativa con IA Embebida (Live)

Monorepo de desarrollo y despliegue continuo de la Plataforma CASE Colaborativa con IA para Modelado de Software (SW1).

## Arquitectura del Proyecto

- `backend/`: API REST Express + Socket.io Server + Prisma ORM + PostgreSQL.
- `frontend/`: Single Page Application en React 18 + TypeScript + Vite + Canvas Konva.js.

## Casos de Uso del Sistema

- **CU-01:** Autenticación JWT y administración de usuarios y proyectos
- **CU-02:** Gestión de sesiones colaborativas
- **CU-03:** Chat en vivo por sesión
- **CU-04:** Administración de permisos y moderación de participantes
- **CU-05:** Lienzo interactivo de modelado de clases UML 2.5
- **CU-06:** Sincronización colaborativa en tiempo real y cursores
- **CU-07:** Asistente por comandos de voz con IA
- **CU-08:** Validador semántico formal UML 2.5 (OMG)
- **CU-09:** Importación y exportación de modelos XMI 2.1 (Enterprise Architect 15)
- **CU-10:** Importación de diagramas desde foto con IA de visión por computadora
- **CU-11:** Generación de modelo de datos relacional
- **CU-12:** Generación y despliegue de base de datos PostgreSQL
- **CU-13:** Generación de backend Spring Boot y pruebas unitarias
- **CU-14:** Despliegue y ejecución del backend generado
- **CU-15:** Generación de aplicación móvil

## Instalación y Ejecución Local

```bash
# 1. Backend
cd backend
npm install
npx prisma generate
npm run dev

# 2. Frontend
cd frontend
npm install
npm run dev
```
