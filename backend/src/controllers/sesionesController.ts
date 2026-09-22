import { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import prisma from '../config/prisma';
import { EstadoSesion, PermisoColaborador } from '@prisma/client';
import { generarCodigoUnico, unirseASesion } from '../services/sesionesService';
import { createParticipantManagementService, ParticipantManagementService } from '../services/participantManagementService';
import { createPrismaParticipantManagementRepository } from '../repositories/prismaParticipantManagementRepository';

const routeId = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

export interface SesionesController {
  crearSesion: RequestHandler;
  obtenerSesion: RequestHandler;
  unirseASesion: RequestHandler;
  cerrarSesion: RequestHandler;
  eliminarSesion: RequestHandler;
  actualizarPermisoParticipante: RequestHandler;
  removerParticipante: RequestHandler;
}

export const createSesionesController = (
  participantService: ParticipantManagementService = createParticipantManagementService(
    createPrismaParticipantManagementRepository(prisma),
  ),
): SesionesController => ({
  crearSesion: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const proyectoId = routeId(req.params.id);

    // Verify the project belongs to the host
    const proyecto = await prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { id: true, nombre: true, propietarioId: true },
    });

    if (!proyecto) {
      throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    }
    if (proyecto.propietarioId !== userId) {
      throw new AppError('Solo el propietario puede crear sesiones en este proyecto', 403, 'FORBIDDEN');
    }

    const body = req.body as Record<string, unknown>;
    const nombreSesion =
      typeof body.nombre === 'string' && body.nombre.trim()
        ? body.nombre.trim()
        : `Sesión de ${proyecto.nombre}`;

    // Generate unique code and create session + host participant in a transaction
    const codigoAcceso = await generarCodigoUnico(prisma);

    const sesion = await prisma.$transaction(async (tx) => {
      const nuevaSesion = await tx.sesionColaborativa.create({
        data: {
          codigoAcceso,
          nombre: nombreSesion,
          proyectoId,
          anfitrionId: userId,
          estado: EstadoSesion.ABIERTA,
        },
        select: {
          id: true,
          codigoAcceso: true,
          nombre: true,
          estado: true,
          fechaInicio: true,
          proyectoId: true,
          anfitrionId: true,
          proyecto: { select: { nombre: true } },
        },
      });

      // Register the host as first participant with full edit permission
      await tx.participanteSesion.create({
        data: {
          sesionId: nuevaSesion.id,
          usuarioId: userId,
          permiso: PermisoColaborador.EDICION_COMPLETA,
          conectado: true,
        },
      });

      return nuevaSesion;
    });

    res.status(201).json({ data: sesion });
  },

  obtenerSesion: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const sesionId = routeId(req.params.sesionId);
    await participantService.assertCanViewSession(sesionId, userId);

    const sesion = await prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: {
        id: true,
        codigoAcceso: true,
        nombre: true,
        estado: true,
        fechaInicio: true,
        fechaFin: true,
        proyectoId: true,
        anfitrionId: true,
        proyecto: {
          select: { id: true, nombre: true, descripcion: true },
        },
        participantes: {
          select: {
            id: true,
            permiso: true,
            conectado: true,
            fechaUnion: true,
            usuario: { select: { id: true, nombre: true, email: true, rol: true } },
          },
          orderBy: { fechaUnion: 'asc' },
        },
      },
    });

    if (!sesion) {
      throw new AppError('Sesión no encontrada', 404, 'NOT_FOUND');
    }

    res.json({ data: sesion });
  },

  unirseASesion: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const body = req.body as Record<string, unknown>;
    const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : '';
    if (!codigo) {
      throw new AppError('El código de sesión es obligatorio', 400, 'MISSING_CODIGO');
    }

    const sesion = await unirseASesion(prisma, codigo, userId);

    res.json({
      data: {
        sesionId: sesion.id,
        proyectoNombre: sesion.proyecto.nombre,
        codigoAcceso: sesion.codigoAcceso,
      },
    });
  },

  cerrarSesion: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const sesionId = routeId(req.params.sesionId);

    const sesion = await prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: { anfitrionId: true, estado: true },
    });

    if (!sesion) {
      throw new AppError('Sesión no encontrada', 404, 'NOT_FOUND');
    }
    if (sesion.anfitrionId !== userId) {
      throw new AppError('Solo el anfitrión puede cerrar la sesión', 403, 'FORBIDDEN');
    }
    if (sesion.estado === EstadoSesion.CERRADA) {
      throw new AppError('La sesión ya está cerrada', 409, 'ALREADY_CLOSED');
    }

    const actualizada = await prisma.sesionColaborativa.update({
      where: { id: sesionId },
      data: { estado: EstadoSesion.CERRADA, fechaFin: new Date() },
      select: {
        id: true,
        codigoAcceso: true,
        nombre: true,
        estado: true,
        fechaInicio: true,
        fechaFin: true,
      },
    });

    res.json({ data: actualizada, message: 'Sesión cerrada' });
  },

  eliminarSesion: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const sesionId = routeId(req.params.sesionId);

    const sesion = await prisma.sesionColaborativa.findUnique({
      where: { id: sesionId },
      select: { anfitrionId: true },
    });

    if (!sesion) {
      throw new AppError('Sesión no encontrada', 404, 'NOT_FOUND');
    }
    if (sesion.anfitrionId !== userId) {
      throw new AppError('Solo el anfitrión puede eliminar la sesión', 403, 'FORBIDDEN');
    }

    await prisma.sesionColaborativa.delete({
      where: { id: sesionId },
    });

    res.json({ message: 'Sesión eliminada correctamente' });
  },

  actualizarPermisoParticipante: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
    const sesionId = routeId(req.params.sesionId);
    const targetUserId = routeId(req.params.usuarioId);
    const body = req.body as Record<string, unknown>;
    const permission = body.permiso;
    if (permission !== 'SOLO_LECTURA' && permission !== 'EDICION_COMPLETA') {
      throw new AppError('El permiso debe ser EDICION_COMPLETA o SOLO_LECTURA', 400, 'INVALID_PERMISSION');
    }
    const participant = await participantService.updatePermission(sesionId, userId, targetUserId, permission);
    res.json({ data: participant, message: 'Permiso actualizado' });
  },

  removerParticipante: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
    const sesionId = routeId(req.params.sesionId);
    const targetUserId = routeId(req.params.usuarioId);
    await participantService.removeParticipant(sesionId, userId, targetUserId);
    res.json({ message: 'Colaborador removido de la sesión' });
  },
});
