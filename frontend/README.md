# Plataforma CASE Colaborativa - Frontend Web Application

Frontend SPA de la Plataforma CASE Colaborativa con IA Embebida para Modelado de Software (SW1).

## Tecnologías

- **Framework:** React 18 + TypeScript + Vite
- **Lienzo Gráfico & Renderizado:** HTML5 Canvas vía Konva.js & React-Konva
- **Gestión de Estado Global:** Zustand
- **Comunicación en Tiempo Real:** Socket.io Client (cursores remotos, presencia y operaciones concurrentes)
- **Estilos & UI:** CSS Custom Properties (Tokens de diseño Impeccable) + Lucide React
- **Captura de Audio:** Web Audio API & MediaRecorder para comandos de voz

## Casos de Uso Implementados

- **CU-01:** Portal de inicio de sesión y panel de administración
- **CU-02:** Panel de proyectos y unión a sesiones colaborativas por código
- **CU-03:** Panel lateral de chat en vivo con menciones
- **CU-04:** Modal de gestión de participantes y permisos de edición/lectura
- **CU-05:** Lienzo interactivo de modelado UML 2.5 (clases, interfaces, atributos, métodos y relaciones ortogonales/rectas)
- **CU-06:** Punteros y cursores remotos colaborativos en tiempo real
- **CU-07:** Widget interactivo de comandos de voz y texto con IA
- **CU-08:** Panel drawer de reporte de validación semántica UML 2.5 con badges y auto-enfoque
- **CU-09:** Interfaz para importación y exportación de modelos XMI 2.1 (Enterprise Architect 15)

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Ejecutar pruebas unitarias y de integración
npm test
```
