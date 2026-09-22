import { EstadoProyecto } from '@prisma/client';
import prisma from '../config/prisma';
import {
  AdminRepository,
  ProjectStatus,
} from '../services/adminService';

const safeUserSelect = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  fechaCreacion: true,
  ultimoAcceso: true,
} as const;

const adminProjectSelect = {
  id: true,
  nombre: true,
  descripcion: true,
  estado: true,
  fechaActualizacion: true,
  propietario: { select: { id: true, nombre: true, email: true } },
} as const;

export const prismaAdminRepository: AdminRepository = {
  async listUsers(page, limit) {
    const [users, total] = await Promise.all([
      prisma.usuario.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { fechaCreacion: 'desc' },
        select: safeUserSelect,
      }),
      prisma.usuario.count(),
    ]);
    return { users, total };
  },

  createUserWithAudit(input, actor) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.usuario.create({
        data: input,
        select: safeUserSelect,
      });
      await tx.auditoria.create({
        data: {
          usuarioId: actor.userId,
          accion: 'USUARIO_CREADO',
          entidad: 'Usuario',
          entidadId: user.id,
          detalle: { email: user.email, rol: user.rol },
          ipOrigen: actor.ip,
        },
      });
      return user;
    });
  },

  setUserActiveWithAudit(id, active, actor, auditAction) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.usuario.update({
        where: { id },
        data: { activo: active },
        select: safeUserSelect,
      });
      await tx.auditoria.create({
        data: {
          usuarioId: actor.userId,
          accion: auditAction,
          entidad: 'Usuario',
          entidadId: user.id,
          detalle: { activo: active },
          ipOrigen: actor.ip,
        },
      });
      return user;
    });
  },

  async listProjects() {
    const projects = await prisma.proyecto.findMany({
      where: { estado: { not: EstadoProyecto.ELIMINADO } },
      orderBy: { fechaActualizacion: 'desc' },
      select: adminProjectSelect,
    });
    return projects.map((project) => ({
      ...project,
      estado: project.estado as ProjectStatus,
    }));
  },

  setProjectStatusWithAudit(id, status, actor) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.proyecto.update({
        where: { id },
        data: { estado: status },
        select: adminProjectSelect,
      });
      await tx.auditoria.create({
        data: {
          usuarioId: actor.userId,
          accion: status === 'ARCHIVADO' ? 'PROYECTO_ARCHIVADO' : 'PROYECTO_REACTIVADO',
          entidad: 'Proyecto',
          entidadId: project.id,
          detalle: { estado: status },
          ipOrigen: actor.ip,
        },
      });
      return { ...project, estado: project.estado as ProjectStatus };
    });
  },
};

