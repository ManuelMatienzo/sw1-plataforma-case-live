import { AppError } from '../errors/AppError';

export type ManagedPermission = 'SOLO_LECTURA' | 'EDICION_COMPLETA';
export interface ManagedParticipant { userId: string; permission: ManagedPermission }
export type ParticipantManagementEvent =
  | { type: 'permission-updated'; sessionId: string; targetUserId: string; permission: ManagedPermission }
  | { type: 'participant-kicked'; sessionId: string; targetUserId: string };

export interface ParticipantManagementRepository {
  findHostId(sessionId: string): Promise<string | null>;
  isSessionMember(sessionId: string, userId: string): Promise<boolean>;
  updatePermissionWithAudit(
    sessionId: string,
    targetUserId: string,
    permission: ManagedPermission,
    actorUserId: string,
  ): Promise<ManagedParticipant | null>;
  removeParticipantWithAudit(
    sessionId: string,
    targetUserId: string,
    actorUserId: string,
  ): Promise<boolean>;
}

type ParticipantEventListener = (event: ParticipantManagementEvent) => void;
export interface ParticipantManagementService {
  assertCanViewSession(sessionId: string, userId: string): Promise<void>;
  updatePermission(sessionId: string, actorUserId: string, targetUserId: string, permission: ManagedPermission): Promise<ManagedParticipant>;
  removeParticipant(sessionId: string, actorUserId: string, targetUserId: string): Promise<void>;
  subscribe(listener: ParticipantEventListener): () => void;
}

export const createParticipantManagementService = (
  repository: ParticipantManagementRepository,
): ParticipantManagementService => {
  const listeners = new Set<ParticipantEventListener>();
  const authorize = async (sessionId: string, actorUserId: string, targetUserId: string) => {
    const hostId = await repository.findHostId(sessionId);
    if (!hostId) throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
    if (actorUserId !== hostId) throw new AppError('Solo el anfitrión puede administrar colaboradores', 403, 'ONLY_HOST_ALLOWED');
    if (targetUserId === hostId) throw new AppError('El anfitrión no puede cambiar sus permisos ni ser removido', 409, 'HOST_IMMUTABLE');
  };
  const publish = (event: ParticipantManagementEvent) => {
    listeners.forEach(listener => listener(event));
  };

  return {
    async assertCanViewSession(sessionId, userId) {
      const hostId = await repository.findHostId(sessionId);
      if (!hostId) throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
      if (userId === hostId) return;
      if (!(await repository.isSessionMember(sessionId, userId))) {
        throw new AppError('No perteneces a esta sesión', 403, 'SESSION_ACCESS_DENIED');
      }
    },
    async updatePermission(sessionId, actorUserId, targetUserId, permission) {
      if (permission !== 'SOLO_LECTURA' && permission !== 'EDICION_COMPLETA') {
        throw new AppError('Permiso inválido', 400, 'INVALID_PERMISSION');
      }
      await authorize(sessionId, actorUserId, targetUserId);
      const participant = await repository.updatePermissionWithAudit(sessionId, targetUserId, permission, actorUserId);
      if (!participant) throw new AppError('El colaborador ya no está en la sesión', 404, 'PARTICIPANT_NOT_FOUND');
      publish({ type: 'permission-updated', sessionId, targetUserId, permission });
      return participant;
    },
    async removeParticipant(sessionId, actorUserId, targetUserId) {
      await authorize(sessionId, actorUserId, targetUserId);
      const removed = await repository.removeParticipantWithAudit(sessionId, targetUserId, actorUserId);
      if (!removed) throw new AppError('El colaborador ya no está en la sesión', 404, 'PARTICIPANT_NOT_FOUND');
      publish({ type: 'participant-kicked', sessionId, targetUserId });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
