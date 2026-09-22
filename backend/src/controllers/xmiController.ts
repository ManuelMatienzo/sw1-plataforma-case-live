import { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { XmiImportInput, XmiSessionService } from '../services/xmiService';

export interface XmiController {
  exportar: RequestHandler;
  importar: RequestHandler;
}

export const createXmiController = (service: XmiSessionService): XmiController => ({
  exportar: async (req, res) => {
    if (!req.auth) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
    const result = await service.export(String(req.params.sesionId), req.auth.id);
    res
      .status(200)
      .setHeader('Content-Type', 'application/xml; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.xml);
  },

  importar: async (req, res) => {
    if (!req.auth) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
    const body = req.body as Partial<XmiImportInput> | undefined;
    const result = await service.import(String(req.params.sesionId), req.auth.id, {
      content: body?.content as string,
      strategy: body?.strategy as XmiImportInput['strategy'],
      expectedVersion: body?.expectedVersion as number,
    });
    res.status(200).json({ data: result });
  },
});
