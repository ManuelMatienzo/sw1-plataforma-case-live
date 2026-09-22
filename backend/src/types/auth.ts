export type UserRole = 'ADMINISTRADOR' | 'ANFITRION' | 'COLABORADOR';

export interface AuthenticatedUser {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};

