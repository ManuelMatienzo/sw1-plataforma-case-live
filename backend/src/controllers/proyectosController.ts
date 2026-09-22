import { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import prisma from '../config/prisma';
import { EstadoProyecto } from '@prisma/client';

const routeId = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const safeProyectoSelect = {
  id: true,
  nombre: true,
  descripcion: true,
  estado: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  propietarioId: true,
  _count: { select: { sesiones: true } },
  sesiones: {
    where: { estado: 'ABIERTA' },
    orderBy: { fechaInicio: 'desc' },
    take: 1,
    select: { id: true, estado: true },
  },
} as const;

export interface ProyectosController {
  listarProyectos: RequestHandler;
  crearProyecto: RequestHandler;
  obtenerProyecto: RequestHandler;
  archivarProyecto: RequestHandler;
}

export const createProyectosController = (): ProyectosController => ({
  listarProyectos: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const proyectos = await prisma.proyecto.findMany({
      where: {
        propietarioId: userId,
        estado: { not: EstadoProyecto.ELIMINADO },
      },
      select: safeProyectoSelect,
      orderBy: { fechaActualizacion: 'desc' },
    });

    res.json({ data: proyectos });
  },

  crearProyecto: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const body = req.body as Record<string, unknown>;
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    if (!nombre) {
      throw new AppError('El nombre del proyecto es obligatorio', 400, 'MISSING_NOMBRE');
    }

    const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : undefined;

    const proyecto = await prisma.proyecto.create({
      data: {
        nombre,
        descripcion: descripcion ?? null,
        propietarioId: userId,
      },
      select: safeProyectoSelect,
    });

    res.status(201).json({ data: proyecto });
  },

  obtenerProyecto: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const id = routeId(req.params.id);

    const proyecto = await prisma.proyecto.findUnique({
      where: { id },
      select: {
        ...safeProyectoSelect,
        sesiones: {
          select: {
            id: true,
            codigoAcceso: true,
            nombre: true,
            estado: true,
            fechaInicio: true,
            fechaFin: true,
            _count: { select: { participantes: true } },
          },
          orderBy: { fechaInicio: 'desc' },
        },
      },
    });

    if (!proyecto) {
      throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    }
    if (proyecto.propietarioId !== userId) {
      throw new AppError('No tienes acceso a este proyecto', 403, 'FORBIDDEN');
    }

    res.json({ data: proyecto });
  },

  archivarProyecto: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');

    const id = routeId(req.params.id);

    const existente = await prisma.proyecto.findUnique({
      where: { id },
      select: { propietarioId: true },
    });

    if (!existente) {
      throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    }
    if (existente.propietarioId !== userId) {
      throw new AppError('No tienes permiso para archivar este proyecto', 403, 'FORBIDDEN');
    }

    const proyecto = await prisma.proyecto.update({
      where: { id },
      data: { estado: EstadoProyecto.ARCHIVADO },
      select: safeProyectoSelect,
    });

    res.json({ data: proyecto, message: 'Proyecto archivado' });
  },
});
