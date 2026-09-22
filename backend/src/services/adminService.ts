import bcrypt from 'bcryptjs';
import { AppError } from '../errors/AppError';
import { UserRole } from '../types/auth';

export type ProjectStatus = 'ACTIVO' | 'ARCHIVADO';

export interface SafeUser {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  fechaCreacion: Date;
  ultimoAcceso: Date | null;
}

export interface AdminProject {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: ProjectStatus;
  fechaActualizacion: Date;
  propietario: { id: string; nombre: string; email: string };
}

export interface AdminActor {
  userId: string;
  ip?: string;
}

export interface CreateUserRepositoryInput {
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRole;
}

export interface AdminRepository {
  listUsers(page: number, limit: number): Promise<{ users: SafeUser[]; total: number }>;
  createUserWithAudit(input: CreateUserRepositoryInput, actor: AdminActor): Promise<SafeUser>;
  setUserActiveWithAudit(
    id: string,
    active: boolean,
    actor: AdminActor,
    auditAction: 'USUARIO_ACTIVADO' | 'USUARIO_DESACTIVADO' | 'USUARIO_ELIMINADO',
  ): Promise<SafeUser>;
  listProjects(): Promise<AdminProject[]>;
  setProjectStatusWithAudit(
    id: string,
    status: ProjectStatus,
    actor: AdminActor,
  ): Promise<AdminProject>;
}

export interface CreateUserInput {
  nombre: string;
  email: string;
  password: string;
  rol: string;
}

export interface AdminService {
  listUsers(input?: { page?: number; limit?: number }): Promise<{
    data: SafeUser[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>;
  createUser(input: CreateUserInput, actor: AdminActor): Promise<SafeUser>;
  setUserStatus(id: string, active: boolean, actor: AdminActor): Promise<SafeUser>;
  deleteUser(id: string, actor: AdminActor): Promise<SafeUser>;
  listProjects(): Promise<AdminProject[]>;
  setProjectStatus(id: string, status: string, actor: AdminActor): Promise<AdminProject>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ROLES = new Set<UserRole>(['ADMINISTRADOR', 'ANFITRION', 'COLABORADOR']);
const PROJECT_STATUSES = new Set<ProjectStatus>(['ACTIVO', 'ARCHIVADO']);

const requireUuid = (id: string) => {
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('Identificador inválido', 400, 'INVALID_ID');
  }
};

export const createAdminService = (repository: AdminRepository): AdminService => ({
  async listUsers(input = {}) {
    const page = Number.isInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
    const requestedLimit = Number.isInteger(input.limit) ? Number(input.limit) : 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const { users, total } = await repository.listUsers(page, limit);
    return {
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async createUser(input, actor) {
    const nombre = input.nombre.trim();
    const email = input.email.trim().toLowerCase();
    if (nombre.length < 2 || nombre.length > 100) {
      throw new AppError('El nombre debe tener entre 2 y 100 caracteres', 400, 'INVALID_NAME');
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 150) {
      throw new AppError('Ingresa un correo electrónico válido', 400, 'INVALID_EMAIL');
    }
    if (input.password.length < 8) {
      throw new AppError('La contraseña debe tener al menos 8 caracteres', 400, 'WEAK_PASSWORD');
    }
    if (!USER_ROLES.has(input.rol as UserRole)) {
      throw new AppError('Rol de usuario inválido', 400, 'INVALID_ROLE');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    return repository.createUserWithAudit(
      { nombre, email, passwordHash, rol: input.rol as UserRole },
      actor,
    );
  },

  async setUserStatus(id, active, actor) {
    requireUuid(id);
    return repository.setUserActiveWithAudit(
      id,
      active,
      actor,
      active ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO',
    );
  },

  async deleteUser(id, actor) {
    requireUuid(id);
    return repository.setUserActiveWithAudit(id, false, actor, 'USUARIO_ELIMINADO');
  },

  listProjects() {
    return repository.listProjects();
  },

  async setProjectStatus(id, status, actor) {
    requireUuid(id);
    if (!PROJECT_STATUSES.has(status as ProjectStatus)) {
      throw new AppError('Estado de proyecto inválido', 400, 'INVALID_PROJECT_STATUS');
    }
    return repository.setProjectStatusWithAudit(id, status as ProjectStatus, actor);
  },
});

