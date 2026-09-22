import axios from 'axios';
import { getStoredSession } from './authStorage';
import { DiagramResponse, UMLDiagramAST } from '../types/uml';
import { UmlValidationReport } from '../types/validation';
import {
  AdminProject,
  AdminUser,
  CreateUserInput,
  LoginResponse,
  PaginatedUsers,
  ProjectStatus,
} from '../types/admin';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 12_000,
});

apiClient.interceptors.request.use((config) => {
  const session = getStoredSession();
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

export const authApi = {
  async login(input: { email: string; password: string }): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', input);
    return response.data;
  },
};

export const adminApi = {
  async listUsers(page = 1, limit = 20): Promise<PaginatedUsers> {
    const response = await apiClient.get<PaginatedUsers>('/admin/usuarios', {
      params: { page, limit },
    });
    return response.data;
  },

  async createUser(input: CreateUserInput): Promise<AdminUser> {
    const response = await apiClient.post<{ data: AdminUser }>('/admin/usuarios', input);
    return response.data.data;
  },

  async setUserStatus(id: string, activo: boolean): Promise<AdminUser> {
    const response = await apiClient.patch<{ data: AdminUser }>(
      `/admin/usuarios/${id}/estado`,
      { activo },
    );
    return response.data.data;
  },

  async deleteUser(id: string): Promise<AdminUser> {
    const response = await apiClient.delete<{ data: AdminUser }>(`/admin/usuarios/${id}`);
    return response.data.data;
  },

  async listProjects(): Promise<AdminProject[]> {
    const response = await apiClient.get<{ data: AdminProject[] }>('/admin/proyectos');
    return response.data.data;
  },

  async setProjectStatus(id: string, estado: ProjectStatus): Promise<AdminProject> {
    const response = await apiClient.patch<{ data: AdminProject }>(
      `/admin/proyectos/${id}/estado`,
      { estado },
    );
    return response.data.data;
  },
};

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: 'ACTIVO' | 'ARCHIVADO';
  fechaCreacion: string;
  fechaActualizacion: string;
  propietarioId: string;
  _count: { sesiones: number };
  sesiones?: { id: string; estado: string }[];
}

export interface SesionCreada {
  id: string;
  codigoAcceso: string;
  nombre: string;
  estado: 'ABIERTA' | 'EN_PAUSA' | 'CERRADA';
  fechaInicio: string;
  proyectoId: string;
  anfitrionId: string;
  proyecto: { nombre: string };
}

export interface UnirseResult {
  sesionId: string;
  proyectoNombre: string;
  codigoAcceso: string;
}

export interface SesionResumen {
  id: string;
  codigoAcceso: string;
  nombre: string;
  estado: 'ABIERTA' | 'EN_PAUSA' | 'CERRADA';
  fechaInicio: string;
  fechaFin: string | null;
  _count: { participantes: number };
}

export interface ProyectoDetalle extends Proyecto {
  sesiones: SesionResumen[];
}

export const proyectosApi = {
  async listar(): Promise<Proyecto[]> {
    const response = await apiClient.get<{ data: Proyecto[] }>('/proyectos');
    return response.data.data;
  },

  async obtener(id: string): Promise<ProyectoDetalle> {
    const response = await apiClient.get<{ data: ProyectoDetalle }>(`/proyectos/${id}`);
    return response.data.data;
  },

  async crear(input: { nombre: string; descripcion?: string }): Promise<Proyecto> {
    const response = await apiClient.post<{ data: Proyecto }>('/proyectos', input);
    return response.data.data;
  },

  async archivar(id: string): Promise<Proyecto> {
    const response = await apiClient.delete<{ data: Proyecto }>(`/proyectos/${id}`);
    return response.data.data;
  },
};

export const sesionesApi = {
  async getDiagrama(sesionId: string): Promise<DiagramResponse> {
    const response = await apiClient.get<{ data: DiagramResponse }>(`/sesiones/${sesionId}/diagrama`);
    return response.data.data;
  },
  async saveDiagrama(sesionId: string, diagram: UMLDiagramAST): Promise<DiagramResponse> {
    const response = await apiClient.put<{ data: DiagramResponse }>(`/sesiones/${sesionId}/diagrama`, diagram);
    return response.data.data;
  },
  async validarDiagrama(sesionId: string, diagram?: UMLDiagramAST): Promise<UmlValidationReport> {
    const response = await apiClient.post<{ data: UmlValidationReport }>(
      `/sesiones/${sesionId}/validar`,
      diagram || {},
    );
    return response.data.data;
  },
  async crear(proyectoId: string, nombre?: string): Promise<SesionCreada> {
    const response = await apiClient.post<{ data: SesionCreada }>(
      `/proyectos/${proyectoId}/sesiones`,
      nombre ? { nombre } : {},
    );
    return response.data.data;
  },

  async unirse(codigo: string): Promise<UnirseResult> {
    const response = await apiClient.post<{ data: UnirseResult }>('/sesiones/unirse', { codigo });
    return response.data.data;
  },

  async cerrar(sesionId: string): Promise<SesionResumen> {
    const response = await apiClient.patch<{ data: SesionResumen }>(`/sesiones/${sesionId}/cerrar`);
    return response.data.data;
  },

  async eliminar(sesionId: string): Promise<void> {
    await apiClient.delete(`/sesiones/${sesionId}`);
  },
};
