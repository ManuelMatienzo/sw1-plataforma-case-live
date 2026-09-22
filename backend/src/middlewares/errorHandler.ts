import { Prisma } from '@prisma/client';
import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada', code: 'NOT_FOUND' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe un registro con esos datos', code: 'CONFLICT' });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Registro no encontrado', code: 'NOT_FOUND' });
      return;
    }
    if (error.code === 'P2003') {
      res.status(400).json({ error: 'La operación viola una relación existente', code: 'RELATION_CONFLICT' });
      return;
    }
  }

  console.error('Error no controlado:', error);
  res.status(500).json({ error: 'Ocurrió un error interno', code: 'INTERNAL_ERROR' });
};

