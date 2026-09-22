import { Router } from 'express';
import { createAdminController } from '../controllers/adminController';
import {
  AuthSessionRepository,
  createRequireAuth,
  requireAdmin,
} from '../middlewares/auth';
import { AdminService } from '../services/adminService';
import { asyncHandler } from '../utils/asyncHandler';

export const createAdminRouter = (
  service: AdminService,
  sessionRepository: AuthSessionRepository,
  jwtSecret: string,
): Router => {
  const router = Router();
  const controller = createAdminController(service);

  router.use(createRequireAuth(sessionRepository, jwtSecret), requireAdmin);
  router.get('/usuarios', asyncHandler(controller.listUsers));
  router.post('/usuarios', asyncHandler(controller.createUser));
  router.patch('/usuarios/:id/estado', asyncHandler(controller.setUserStatus));
  router.delete('/usuarios/:id', asyncHandler(controller.deleteUser));
  router.get('/proyectos', asyncHandler(controller.listProjects));
  router.patch('/proyectos/:id/estado', asyncHandler(controller.setProjectStatus));

  return router;
};

