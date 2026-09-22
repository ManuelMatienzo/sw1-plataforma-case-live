import { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { ChatService } from '../services/chatService';
import prisma from '../config/prisma';

const routeId = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

export interface ChatController {
  listarMensajes: RequestHandler;
  limpiarMensajes: RequestHandler;
}

export const createChatController = (chatService = new ChatService({ prisma })): ChatController => ({
  listarMensajes: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
    const sesionId = routeId(req.params.sesionId);
    const mensajes = await chatService.obtenerHistorial(sesionId, userId);
    res.json({ mensajes });
  },

  limpiarMensajes: async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
    const sesionId = routeId(req.params.sesionId);
    const resultado = await chatService.limpiarHistorial(sesionId, userId);
    res.json({ ok: true, ...resultado });
  },
});
