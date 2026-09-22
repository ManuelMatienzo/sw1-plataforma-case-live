import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import { AuthenticatedUser } from '../types/auth';

export interface AuthSessionRepository {
  findSessionUserById(id: string): Promise<AuthenticatedUser | null>;
}

interface JwtClaims {
  sub?: string;
}

export const createRequireAuth = (
  repository: AuthSessionRepository,
  jwtSecret: string,
): RequestHandler =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorization = req.header('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
      }

      const token = authorization.slice('Bearer '.length).trim();
      const decoded = jwt.verify(token, jwtSecret) as JwtClaims | string;
      const subject = typeof decoded === 'string' ? undefined : decoded.sub;
      if (!subject) {
        throw new AppError('La sesión no es válida', 401, 'INVALID_TOKEN');
      }

      const user = await repository.findSessionUserById(subject);
      if (!user?.activo) {
        throw new AppError('La sesión ya no está activa', 401, 'SESSION_REVOKED');
      }

      req.auth = user;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      next(new AppError('La sesión expiró o no es válida', 401, 'INVALID_TOKEN'));
    }
  };

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth?.rol !== 'ADMINISTRADOR') {
    next(new AppError('Esta acción requiere rol de administrador', 403, 'ADMIN_REQUIRED'));
    return;
  }
  next();
};

