export type UserRole = 'ADMINISTRADOR' | 'ANFITRION' | 'COLABORADOR';
export type ProjectStatus = 'ACTIVO' | 'ARCHIVADO';

export interface SessionUser {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export interface AdminUser extends SessionUser {
  activo: boolean;
  fechaCreacion: string;
  ultimoAcceso: string | null;
}

export interface AdminProject {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: ProjectStatus;
  fechaActualizacion: string;
  propietario: Pick<SessionUser, 'id' | 'nombre' | 'email'>;
}

export interface PaginatedUsers {
  data: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUserInput {
  nombre: string;
  email: string;
  password: string;
  rol: UserRole;
}

