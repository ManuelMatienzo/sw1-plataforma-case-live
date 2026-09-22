import { Router } from 'express';
import multer from 'multer';
import { AuthSessionRepository, createRequireAuth } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { createAiController } from '../controllers/aiController';
import { createGeminiService, GeminiService } from '../services/geminiService';
import { HybridVisionService } from '../services/hybridVisionService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo para notas de voz e imágenes
  },
});

export const createAiRouter = (
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
  geminiService: GeminiService = createGeminiService(),
  hybridVisionService?: HybridVisionService,
): Router => {
  const router = Router();
  const controller = createAiController(geminiService, hybridVisionService);

  router.use(createRequireAuth(sessionRepository, jwtSecret));

  router.post(
    '/comando-voz',
    upload.single('audio'),
    asyncHandler(controller.interpretarComandoVoz),
  );

  router.post(
    '/importar-foto',
    upload.single('imagen'),
    asyncHandler(controller.importarDiagramaFoto),
  );

  return router;
};
