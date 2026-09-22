import { apiClient } from './api';
import type { ParticipantPermission } from '../types/realtime';

export interface SessionParticipant {
  id: string;
  permiso: ParticipantPermission;
  usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: 'ANFITRION' | 'COLABORADOR' | 'ADMINISTRADOR';
  };
}

export interface SessionParticipantsDetails {
  id: string;
  codigoAcceso: string;
  nombre: string;
  anfitrionId: string;
  participantes: SessionParticipant[];
}

export const participantsApi = {
  async listar(sessionId: string): Promise<SessionParticipantsDetails> {
    const response = await apiClient.get<{ data: SessionParticipantsDetails }>(`/sesiones/${sessionId}`);
    return response.data.data;
  },
  async actualizarPermiso(sessionId: string, userId: string, permission: ParticipantPermission) {
    const response = await apiClient.patch<{ data: { userId: string; permission: ParticipantPermission } }>(
      `/sesiones/${sessionId}/participantes/${userId}`,
      { permiso: permission },
    );
    return response.data.data;
  },
  async remover(sessionId: string, userId: string): Promise<void> {
    await apiClient.delete(`/sesiones/${sessionId}/participantes/${userId}`);
  },
};
