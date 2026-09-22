import crypto from 'crypto';
import { PrismaClient, PermisoColaborador, EstadoSesion } from '@prisma/client';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;
const MAX_RETRIES = 10;

/**
 * Generates a unique 6-character alphanumeric code (A-Z + 0-9).
 * Verifies against the DB and retries on collision (extremely rare).
 */
export const generarCodigoUnico = async (prisma: PrismaClient): Promise<string> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let codigo = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      codigo += CHARSET[bytes[i] % CHARSET.length];
    }

    const existing = await prisma.sesionColaborativa.findUnique({
      where: { codigoAcceso: codigo },
      select: { id: true },
    });

    if (!existing) {
      return codigo;
    }
  }

  throw new Error('No se pudo generar un código de sesión único. Inténtalo de nuevo.');
};

export interface SesionConProyecto {
  id: string;
  codigoAcceso: string;
  nombre: string;
  estado: EstadoSesion;
  fechaInicio: Date;
  fechaFin: Date | null;
  proyectoId: string;
  anfitrionId: string;
  proyecto: {
    nombre: string;
  };
}

/**
 * Joins a session by code. Idempotent: uses upsert for ParticipanteSesion.
 * Throws if the session doesn't exist or is not ABIERTA.
 */
export const unirseASesion = async (
  prisma: PrismaClient,
  codigo: string,
  usuarioId: string,
): Promise<SesionConProyecto> => {
  const sesion = await prisma.sesionColaborativa.findUnique({
    where: { codigoAcceso: codigo.toUpperCase().trim() },
    select: {
      id: true,
      codigoAcceso: true,
      nombre: true,
      estado: true,
      fechaInicio: true,
      fechaFin: true,
      proyectoId: true,
      anfitrionId: true,
      proyecto: { select: { nombre: true } },
    },
  });

  if (!sesion) {
    const { AppError } = await import('../errors/AppError');
    throw new AppError('Código de sesión no encontrado', 404, 'SESSION_NOT_FOUND');
  }

  if (sesion.estado !== EstadoSesion.ABIERTA) {
    const { AppError } = await import('../errors/AppError');
    throw new AppError('Esta sesión ya no está abierta', 409, 'SESSION_CLOSED');
  }

  // Idempotent join — upsert prevents duplicate participant records
  await prisma.participanteSesion.upsert({
    where: {
      sesionId_usuarioId: {
        sesionId: sesion.id,
        usuarioId,
      },
    },
    create: {
      sesionId: sesion.id,
      usuarioId,
      permiso: PermisoColaborador.EDICION_PARCIAL,
      conectado: true,
    },
    update: {
      conectado: true,
    },
  });

  return sesion;
};
