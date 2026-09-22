import { Router } from 'express';
import { createSesionesController } from '../controllers/sesionesController';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../config/prisma';
import { DiagramService } from '../services/diagramaService';
import { createPrismaDiagramRepository } from '../repositories/prismaDiagramRepository';
import { createDiagramaController } from '../controllers/diagramaController';
import { createValidationController } from '../controllers/validationController';
import { createXmiController } from '../controllers/xmiController';
import { XmiSessionService } from '../services/xmiService';
import { createDataModelController } from '../controllers/dataModelController';

import { createChatController } from '../controllers/chatController';
import { ParticipantManagementService } from '../services/participantManagementService';

export const createSesionesRouter = (
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
  diagramService = new DiagramService(createPrismaDiagramRepository(prisma)),
  chatController = createChatController(),
  participantService?: ParticipantManagementService,
  xmiService = new XmiSessionService(createPrismaDiagramRepository(prisma)),
): Router => {
  const router = Router();
  const controller = createSesionesController(participantService);

  router.use(createRequireAuth(sessionRepository, jwtSecret));
  const diagram = createDiagramaController(diagramService);
  const validation = createValidationController(diagramService);
  const xmi = createXmiController(xmiService);
  const dataModel = createDataModelController(diagramService);

  router.get('/:sesionId/diagrama', asyncHandler(diagram.obtenerDiagrama));
  router.put('/:sesionId/diagrama', asyncHandler(diagram.guardarDiagrama));
  router.post('/:sesionId/validar', asyncHandler(validation.validarDiagramaSesion));
  router.get('/:sesionId/xmi/exportar', asyncHandler(xmi.exportar));
  router.post('/:sesionId/xmi/importar', asyncHandler(xmi.importar));

  // Rutas de Generación de Modelo de Datos Relacional (CU-11)
  router.get('/:sesionId/generar/modelo-datos', asyncHandler(dataModel.generarModeloDatosSesion));
  router.post('/:sesionId/generar/modelo-datos', asyncHandler(dataModel.generarModeloDatosSesion));
  router.get('/:sesionId/modelo-datos', asyncHandler(dataModel.generarModeloDatosSesion));
  router.post('/:sesionId/modelo-datos', asyncHandler(dataModel.generarModeloDatosSesion));

  router.get('/:sesionId/mensajes', asyncHandler(chatController.listarMensajes));
  router.delete('/:sesionId/mensajes', asyncHandler(chatController.limpiarMensajes));
  router.patch('/:sesionId/participantes/:usuarioId', asyncHandler(controller.actualizarPermisoParticipante));
  router.delete('/:sesionId/participantes/:usuarioId', asyncHandler(controller.removerParticipante));

  // IMPORTANT: /unirse must be registered BEFORE /:sesionId to avoid Express
  // matching the literal "unirse" string as a dynamic :sesionId parameter.
  router.post('/unirse', asyncHandler(controller.unirseASesion));
  router.get('/:sesionId', asyncHandler(controller.obtenerSesion));
  router.patch('/:sesionId/cerrar', asyncHandler(controller.cerrarSesion));
  router.delete('/:sesionId', asyncHandler(controller.eliminarSesion));

  return router;
};

/**
 * Creates a router for project-scoped sesion routes:
 * POST /api/proyectos/:id/sesiones → crearSesion
 */
export const createProyectoSesionesRouter = (
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
): Router => {
  const router = Router({ mergeParams: true });
  const controller = createSesionesController();

  router.use(createRequireAuth(sessionRepository, jwtSecret));

  router.post('/', asyncHandler(controller.crearSesion));

  return router;
};
