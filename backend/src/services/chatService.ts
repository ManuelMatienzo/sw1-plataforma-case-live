import { PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError';

export interface GuardarMensajeParams {
  sesionId: string;
  usuarioId: string;
  autorNombre: string;
  contenido: string;
}

export interface ChatServiceDependencies {
  prisma: PrismaClient;
}

export class ChatService {
  constructor(private dependencies: ChatServiceDependencies) {}

  /**
   * Guarda un mensaje de chat en la base de datos tras verificar que el usuario pertenece a la sesión.
   */
  async guardarMensaje(params: GuardarMensajeParams) {
    const { sesionId, usuarioId, autorNombre, contenido } = params;
    const cleanContent = (contenido ?? '').trim();

    if (!cleanContent) {
      throw new AppError('El mensaje no puede estar vacío', 400, 'INVALID_MESSAGE');
    }

    if (cleanContent.length > 2000) {
      throw new AppError('El mensaje no puede superar los 2000 caracteres', 400, 'MESSAGE_TOO_LONG');
    }

    const session = await this.dependencies.prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: {
        id: true,
        estado: true,
        anfitrionId: true,
        participantes: { where: { usuarioId }, select: { id: true } },
      },
    });

    if (!session || session.estado !== 'ABIERTA') {
      throw new AppError('La sesión no existe o no está activa', 404, 'SESSION_NOT_ACTIVE');
    }

    const isHost = session.anfitrionId === usuarioId;
    const isParticipant = session.participantes.length > 0;

    if (!isHost && !isParticipant) {
      throw new AppError('No perteneces a esta sesión colaborativa', 403, 'FORBIDDEN');
    }

    const mensaje = await this.dependencies.prisma.mensajeChat.create({
      data: {
        sesionId,
        usuarioId,
        autorNombre: autorNombre.trim().slice(0, 100),
        contenido: cleanContent,
      },
    });

    return {
      id: mensaje.id,
      sesionId: mensaje.sesionId,
      usuarioId: mensaje.usuarioId,
      autorNombre: mensaje.autorNombre,
      contenido: mensaje.contenido,
      timestamp: mensaje.timestamp.toISOString(),
    };
  }

  /**
   * Obtiene los últimos 100 mensajes del historial de la sesión ordenados cronológicamente.
   */
  async obtenerHistorial(sesionId: string, usuarioId: string) {
    const session = await this.dependencies.prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: {
        id: true,
        anfitrionId: true,
        participantes: { where: { usuarioId }, select: { id: true } },
      },
    });

    if (!session) {
      throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
    }

    const isHost = session.anfitrionId === usuarioId;
    const isParticipant = session.participantes.length > 0;

    if (!isHost && !isParticipant) {
      throw new AppError('No tienes acceso al historial de esta sesión', 403, 'FORBIDDEN');
    }

    const mensajes = await this.dependencies.prisma.mensajeChat.findMany({
      where: { sesionId },
      orderBy: { timestamp: 'asc' },
      take: 100,
    });

    return mensajes.map(m => ({
      id: m.id,
      sesionId: m.sesionId,
      usuarioId: m.usuarioId,
      autorNombre: m.autorNombre,
      contenido: m.contenido,
      timestamp: m.timestamp.toISOString(),
    }));
  }

  /**
   * Limpia el historial de chat de la sesión (solo permitido al anfitrión).
   */
  async limpiarHistorial(sesionId: string, usuarioId: string) {
    const session = await this.dependencies.prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: { id: true, anfitrionId: true },
    });

    if (!session) {
      throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
    }

    if (session.anfitrionId !== usuarioId) {
      throw new AppError('Solo el Anfitrión puede vaciar el historial de chat', 403, 'ONLY_HOST_ALLOWED');
    }

    const result = await this.dependencies.prisma.mensajeChat.deleteMany({
      where: { sesionId },
    });

    return { eliminados: result.count };
  }
}
