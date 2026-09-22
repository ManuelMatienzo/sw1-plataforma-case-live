import { PrismaClient } from '@prisma/client';
import { CollaborationRepository } from '../sockets/umlSocket';

export const createPrismaCollaborationRepository = (prisma: PrismaClient): CollaborationRepository => ({
  async resolveAccess(sesionId, userId) {
    const session = await prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: {
        estado: true,
        anfitrionId: true,
        proyecto: { select: { estado: true } },
        participantes: { where: { usuarioId: userId }, select: { permiso: true } },
      },
    });
    if (!session) return { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' };
    const isHost = session.anfitrionId === userId;
    const participant = session.participantes[0];
    const active = session.estado === 'ABIERTA' && session.proyecto.estado === 'ACTIVO';
    const permission = isHost ? 'EDICION_COMPLETA' : participant?.permiso ?? 'SOLO_LECTURA';
    return {
      canJoin: active && (isHost || Boolean(participant)),
      canEdit: active && (isHost || Boolean(participant && participant.permiso !== 'SOLO_LECTURA')),
      role: isHost ? 'ANFITRION' : 'COLABORADOR',
      permission,
    };
  },
});
