import { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { AdminActor, AdminService } from '../services/adminService';

export interface AdminController {
  listUsers: RequestHandler;
  createUser: RequestHandler;
  setUserStatus: RequestHandler;
  deleteUser: RequestHandler;
  listProjects: RequestHandler;
  setProjectStatus: RequestHandler;
}

const actorFromRequest = (userId: string | undefined, ip?: string): AdminActor => {
  if (!userId) {
    throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
  }
  return { userId, ip };
};

const routeId = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export const createAdminController = (service: AdminService): AdminController => ({
  listUsers: async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json(await service.listUsers({ page, limit }));
  },

  createUser: async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = await service.createUser(
      {
        nombre: typeof body.nombre === 'string' ? body.nombre : '',
        email: typeof body.email === 'string' ? body.email : '',
        password: typeof body.password === 'string' ? body.password : '',
        rol: typeof body.rol === 'string' ? body.rol : '',
      },
      actorFromRequest(req.auth?.id, req.ip),
    );
    res.status(201).json({ data: user });
  },

  setUserStatus: async (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (typeof body.activo !== 'boolean') {
      throw new AppError('El campo activo debe ser booleano', 400, 'INVALID_STATUS');
    }
    const user = await service.setUserStatus(
      routeId(req.params.id),
      body.activo,
      actorFromRequest(req.auth?.id, req.ip),
    );
    res.json({ data: user });
  },

  deleteUser: async (req, res) => {
    const user = await service.deleteUser(
      routeId(req.params.id),
      actorFromRequest(req.auth?.id, req.ip),
    );
    res.json({ data: user, message: 'Usuario desactivado' });
  },

  listProjects: async (_req, res) => {
    res.json({ data: await service.listProjects() });
  },

  setProjectStatus: async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const project = await service.setProjectStatus(
      routeId(req.params.id),
      typeof body.estado === 'string' ? body.estado : '',
      actorFromRequest(req.auth?.id, req.ip),
    );
    res.json({ data: project });
  },
});
