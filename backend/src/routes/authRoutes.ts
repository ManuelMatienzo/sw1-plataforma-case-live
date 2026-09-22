import { Router } from 'express';
import { createAuthController } from '../controllers/authController';
import { AuthService } from '../services/authService';
import { asyncHandler } from '../utils/asyncHandler';

export const createAuthRouter = (service: AuthService): Router => {
  const router = Router();
  const controller = createAuthController(service);
  router.post('/login', asyncHandler(controller.login));
  return router;
};

