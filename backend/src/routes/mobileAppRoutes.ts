import { Router } from 'express';
import prisma from '../config/prisma';
import { createMobileAppController } from '../controllers/mobileAppController';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { createPrismaDiagramRepository } from '../repositories/prismaDiagramRepository';
import { DiagramService } from '../services/diagramaService';
import { MobilePipelineService } from '../services/mobilePipelineService';
import { SpringRunnerService } from '../services/springRunnerService';
import { asyncHandler } from '../utils/asyncHandler';

const defaultRunner = new SpringRunnerService();

export const createMobileAppRoutes = (
  repository: AuthSessionRepository,
  jwtSecret: string,
  diagramService = new DiagramService(createPrismaDiagramRepository(prisma)),
  runner = defaultRunner,
  pipeline = new MobilePipelineService(diagramService, runner),
) => {
  const apiRouter = Router();
  const appRouter = Router({ strict: true });
  const controller = createMobileAppController(pipeline);
  const auth = createRequireAuth(repository, jwtSecret);
  apiRouter.post('/generar-directo', asyncHandler(controller.generateDirect));
  apiRouter.post('/sesiones/:sesionId/generar', auth, asyncHandler(controller.generateSession));
  apiRouter.get('/sesiones/:sesionId/descargar-zip', auth, asyncHandler(controller.downloadZip));
  apiRouter.get('/sesiones/:sesionId/qr', auth, asyncHandler(controller.qr));
  appRouter.get('/:appId', asyncHandler(controller.redirectToApp));
  appRouter.get('/:appId/', asyncHandler(controller.serveApp));
  appRouter.get('/:appId/:asset', asyncHandler(controller.serveApp));
  return { apiRouter, appRouter };
};
