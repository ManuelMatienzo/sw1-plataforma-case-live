import prisma from '../config/prisma';
import { AuthRepository } from '../services/authService';
import { AuthSessionRepository } from '../middlewares/auth';

export const prismaAuthRepository: AuthRepository = {
  findByEmail(email) {
    return prisma.usuario.findUnique({
      where: { email },
      select: {
        id: true,
        nombre: true,
        email: true,
        passwordHash: true,
        rol: true,
        activo: true,
      },
    });
  },

  async registerSuccessfulLogin(userId, ip) {
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: userId },
        data: { ultimoAcceso: new Date() },
      }),
      prisma.auditoria.create({
        data: {
          usuarioId: userId,
          accion: 'INICIO_SESION',
          entidad: 'Usuario',
          entidadId: userId,
          detalle: { resultado: 'exitoso' },
          ipOrigen: ip,
        },
      }),
    ]);
  },
};

export const prismaAuthSessionRepository: AuthSessionRepository = {
  findSessionUserById(id) {
    return prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
    });
  },
};

