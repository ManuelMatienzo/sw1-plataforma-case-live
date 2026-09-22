import { PrismaClient } from '@prisma/client';
import { ParticipantManagementRepository } from '../services/participantManagementService';

export const createPrismaParticipantManagementRepository = (
  prisma: PrismaClient,
): ParticipantManagementRepository => ({
  async findHostId(sessionId) {
    const session = await prisma.sesionColaborativa.findUnique({
      where: { id: sessionId },
      select: { anfitrionId: true },
    });
    return session?.anfitrionId ?? null;
  },
  async isSessionMember(sessionId, userId) {
    const participant = await prisma.participanteSesion.findUnique({
      where: { sesionId_usuarioId: { sesionId: sessionId, usuarioId: userId } },
      select: { id: true },
    });
    return participant !== null;
  },
  async updatePermissionWithAudit(sessionId, targetUserId, permission, actorUserId) {
    return prisma.$transaction(async tx => {
      const participant = await tx.participanteSesion.findUnique({
        where: { sesionId_usuarioId: { sesionId: sessionId, usuarioId: targetUserId } },
        select: { id: true, permiso: true, usuarioId: true },
      });
      if (!participant) return null;
      const updated = await tx.participanteSesion.update({
        where: { id: participant.id },
        data: { permiso: permission },
        select: { usuarioId: true, permiso: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: actorUserId,
          accion: 'ACTUALIZAR_PERMISO_COLABORADOR',
          entidad: 'PARTICIPANTE_SESION',
          entidadId: participant.id,
          detalle: { sessionId, targetUserId, permisoAnterior: participant.permiso, permisoNuevo: permission },
        },
      });
      return { userId: updated.usuarioId, permission };
    });
  },
  async removeParticipantWithAudit(sessionId, targetUserId, actorUserId) {
    return prisma.$transaction(async tx => {
      const participant = await tx.participanteSesion.findUnique({
        where: { sesionId_usuarioId: { sesionId: sessionId, usuarioId: targetUserId } },
        select: { id: true, permiso: true },
      });
      if (!participant) return false;
      await tx.participanteSesion.delete({ where: { id: participant.id } });
      await tx.auditoria.create({
        data: {
          usuarioId: actorUserId,
          accion: 'REMOVER_COLABORADOR',
          entidad: 'PARTICIPANTE_SESION',
          entidadId: participant.id,
          detalle: { sessionId, targetUserId, permisoAnterior: participant.permiso },
        },
      });
      return true;
    });
  },
});
