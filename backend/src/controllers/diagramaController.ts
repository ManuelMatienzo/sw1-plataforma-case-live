import { RequestHandler } from 'express';
import { DiagramService } from '../services/diagramaService';
import { AppError } from '../errors/AppError';

export function createDiagramaController(service: DiagramService): { obtenerDiagrama: RequestHandler; guardarDiagrama: RequestHandler } {
  return {
    obtenerDiagrama: async (req, res) => {
      if (!req.auth) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
      res.json({ data: await service.get(String(req.params.sesionId), req.auth.id) });
    },
    guardarDiagrama: async (req, res) => {
      if (!req.auth) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
      res.json({ data: await service.save(String(req.params.sesionId), req.auth.id, req.body) });
    },
  };
}
