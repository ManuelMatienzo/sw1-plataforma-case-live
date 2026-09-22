import { Router } from 'express';
import prisma from '../config/prisma';
import { createSpringController, SpringController } from '../controllers/springController';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { createPrismaDiagramRepository } from '../repositories/prismaDiagramRepository';
import { DiagramService } from '../services/diagramaService';
import { SpringPipelineService } from '../services/springPipelineService';
import { SpringRunnerService } from '../services/springRunnerService';
import { asyncHandler } from '../utils/asyncHandler';

export const defaultSpringRunner = new SpringRunnerService();

export const createSpringRouter = (
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
  diagramService = new DiagramService(createPrismaDiagramRepository(prisma)),
  pipeline = new SpringPipelineService(diagramService),
  runner = defaultSpringRunner,
  controller?: SpringController,
): Router => {
  const router = Router();
  const springController = controller ?? createSpringController(pipeline, runner);
  const requireAuth = createRequireAuth(sessionRepository, jwtSecret);
  const requireSseAuth = createRequireAuth(sessionRepository, jwtSecret, { allowQueryToken: true });

  router.post('/generar-directo', asyncHandler(springController.generarDirecto));
  router.post('/sesiones/:sesionId/generar', requireAuth, asyncHandler(springController.generarSesion));
  router.get('/sesiones/:sesionId/descargar-zip', requireAuth, asyncHandler(springController.descargarZip));
  router.get('/sesiones/:sesionId/postman', requireAuth, asyncHandler(springController.descargarPostman));
  router.post('/runner/:sesionId/iniciar', requireAuth, asyncHandler(springController.iniciarRunner));
  router.post('/runner/:sesionId/detener', requireAuth, asyncHandler(springController.detenerRunner));
  router.get('/runner/:sesionId/estado', requireAuth, asyncHandler(springController.estadoRunner));
  router.get('/runner/:sesionId/logs/stream', requireSseAuth, asyncHandler(springController.streamLogs));
  return router;
};
