import { Router } from 'express';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { createDataModelController } from '../controllers/dataModelController';
import { DiagramService } from '../services/diagramaService';
import { DataModelGeneratorService } from '../services/dataModelGeneratorService';

export function createDataModelRouter(
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
  diagramService?: DiagramService,
  generatorService?: DataModelGeneratorService,
): Router {
  const router = Router();
  const controller = createDataModelController(diagramService, generatorService);

  // Endpoint directo para transformar cualquier AST sin acoplamiento a sesión
  router.post(
    '/generar-directo',
    asyncHandler(controller.generarModeloDatosDirecto),
  );

  // Rutas protegidas por autenticación
  router.use(createRequireAuth(sessionRepository, jwtSecret));

  router.post(
    '/generar',
    asyncHandler(controller.generarModeloDatosDirecto),
  );

  router.post(
    '/sesiones/:sesionId/generar',
    asyncHandler(controller.generarModeloDatosSesion),
  );

  return router;
}
