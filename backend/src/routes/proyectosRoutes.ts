import { Router } from 'express';
import { createProyectosController } from '../controllers/proyectosController';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';

export const createProyectosRouter = (
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
): Router => {
  const router = Router();
  const controller = createProyectosController();

  router.use(createRequireAuth(sessionRepository, jwtSecret));

  router.get('/', asyncHandler(controller.listarProyectos));
  router.post('/', asyncHandler(controller.crearProyecto));
  router.get('/:id', asyncHandler(controller.obtenerProyecto));
  router.delete('/:id', asyncHandler(controller.archivarProyecto));

  return router;
};
