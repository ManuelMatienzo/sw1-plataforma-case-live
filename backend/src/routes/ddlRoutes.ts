import { Router } from 'express';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { createDdlController, DdlController } from '../controllers/ddlController';
import { DiagramService } from '../services/diagramaService';
import { createPrismaDiagramRepository } from '../repositories/prismaDiagramRepository';
import prisma from '../config/prisma';

export const createDdlRouter = (
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
  diagramService = new DiagramService(createPrismaDiagramRepository(prisma)),
  controller?: DdlController,
): Router => {
  const router = Router();
  const ddlController = controller || createDdlController(diagramService);

  // Endpoint directo sin autenticación obligatoria (para pruebas unitarias y modo demo/offline)
  router.post('/generar-directo', asyncHandler(ddlController.generarDdlDirecto));

  // Endpoints protegidos mediante JWT
  const authMiddleware = createRequireAuth(sessionRepository, jwtSecret);
  router.post('/generar', authMiddleware, asyncHandler(ddlController.generarDdlDirecto));
  router.post('/sesiones/:sesionId/generar', authMiddleware, asyncHandler(ddlController.generarDdlSesion));
  router.get('/sesiones/:sesionId/descargar', authMiddleware, asyncHandler(ddlController.descargarDdlSesion));

  return router;
};
