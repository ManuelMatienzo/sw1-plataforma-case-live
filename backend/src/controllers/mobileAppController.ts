import { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { UMLDiagramAST } from '../models/uml.types';
import { mobileAccessUrl } from '../services/mobileAppService';
import { MobilePipelineService } from '../services/mobilePipelineService';

const safeFilename = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'app_case';
const requestPort = (req: Request) => req.socket.localPort || Number(process.env.PORT) || 4000;
const urlFor = (req: Request, appId: string) => mobileAccessUrl(appId, requestPort(req), undefined, process.env.PUBLIC_MOBILE_ORIGIN);
const metadata = (req: Request, appId: string) => {
  const url = urlFor(req, appId);
  return {
    url, appId,
    secureContext: url.startsWith('https://') || /:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url),
    note: url.startsWith('https://')
      ? 'Instalable y disponible sin conexión tras abrirla una vez.'
      : 'Para instalar y usar Service Worker desde otro dispositivo, publica esta URL con HTTPS confiable.',
  };
};

export const createMobileAppController = (pipeline: MobilePipelineService) => ({
  async generateDirect(req: Request, res: Response) {
    const { diagrama, backendBaseUrl } = req.body as { diagrama: UMLDiagramAST; backendBaseUrl?: string };
    const result = await pipeline.generateDirect(diagrama, backendBaseUrl);
    if (req.query.format === 'zip') {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(result.config.name)}_movil.zip"`);
      res.status(200).send(result.zipBuffer);
      return;
    }
    res.status(200).json({ data: { appId: result.appId, config: result.config, files: result.files,
      summary: result.summary, access: metadata(req, result.appId) } });
  },

  async generateSession(req: Request, res: Response) {
    const result = await pipeline.generateSession(String(req.params.sesionId), req.auth!.id, req.body?.backendBaseUrl);
    res.status(200).json({ data: { appId: result.appId, config: result.config, files: result.files,
      summary: result.summary, access: metadata(req, result.appId) } });
  },

  async downloadZip(req: Request, res: Response) {
    const result = await pipeline.getOrGenerate(String(req.params.sesionId), req.auth!.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(result.config.name)}_movil.zip"`);
    res.status(200).send(result.zipBuffer);
  },

  async qr(req: Request, res: Response) {
    const result = await pipeline.getOrGenerate(String(req.params.sesionId), req.auth!.id);
    res.status(200).json({ data: metadata(req, result.appId) });
  },

  async redirectToApp(req: Request, res: Response) {
    pipeline.getPublic(String(req.params.appId));
    res.redirect(308, `/m/${req.params.appId}/`);
  },

  async serveApp(req: Request, res: Response) {
    const app = pipeline.getPublic(String(req.params.appId));
    const asset = req.params.asset || 'index.html';
    const generated = app.files.find((item) => item.path === asset);
    if (!generated) throw new AppError('Archivo móvil no encontrado', 404, 'MOBILE_FILE_NOT_FOUND');
    res.setHeader('Content-Type', generated.mimeType);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(generated.encoding === 'base64' ? Buffer.from(generated.content, 'base64') : generated.content);
  },
});
