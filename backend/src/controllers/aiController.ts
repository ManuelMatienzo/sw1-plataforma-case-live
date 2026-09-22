import { Request, Response } from 'express';
import { GeminiService } from '../services/geminiService';
import { HybridVisionService, createHybridVisionService, VisionProvider } from '../services/hybridVisionService';
import { AppError } from '../errors/AppError';

export interface AiController {
  interpretarComandoVoz(req: Request, res: Response): Promise<void>;
  importarDiagramaFoto(req: Request, res: Response): Promise<void>;
}

export const createAiController = (
  geminiService: GeminiService,
  hybridVisionService?: HybridVisionService,
): AiController => {
  const visionService = hybridVisionService || createHybridVisionService(undefined, geminiService);

  return {
    interpretarComandoVoz: async (req: Request, res: Response): Promise<void> => {
      const file = req.file;
      const body = req.body as Record<string, unknown>;
      const texto = typeof body.texto === 'string' ? body.texto.trim() : undefined;

      if (!file && !texto) {
        throw new AppError('Debes proporcionar un archivo de audio o una instrucción en texto.', 400, 'MISSING_VOICE_INPUT');
      }

      let currentClasses: string[] = [];
      if (typeof body.clases === 'string') {
        try {
          const parsed = JSON.parse(body.clases);
          if (Array.isArray(parsed)) currentClasses = parsed.map(String);
        } catch {
          // Ignorar error de parseo y continuar con lista vacía
        }
      } else if (Array.isArray(body.clases)) {
        currentClasses = body.clases.map(String);
      }

      const result = await geminiService.interpretCommand({
        audioBuffer: file?.buffer,
        mimeType: file?.mimetype || 'audio/webm',
        text: texto,
        currentClasses,
      });

      res.json({
        data: result,
      });
    },

    importarDiagramaFoto: async (req: Request, res: Response): Promise<void> => {
      const file = req.file;

      if (!file || !file.buffer || file.buffer.length === 0) {
        throw new AppError('Debes adjuntar una imagen del diagrama.', 400, 'MISSING_IMAGE');
      }

      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
        throw new AppError('Formato de imagen no soportado. Debe ser JPG, PNG o WebP.', 400, 'INVALID_IMAGE_FORMAT');
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new AppError('La imagen no puede exceder 10 MB.', 413, 'IMAGE_TOO_LARGE');
      }

      const groqKeyHeader = (req.headers['x-groq-api-key'] as string) || undefined;
      const geminiKeyHeader = (req.headers['x-gemini-api-key'] as string) || undefined;
      const providerParam = (req.body?.provider as string) || (req.query?.provider as string) || undefined;
      const demoParam = req.body?.demo === 'true' || req.query?.demo === 'true';

      const provider: VisionProvider | undefined = demoParam
        ? 'demo'
        : (providerParam as VisionProvider | undefined);

      try {
        const result = await visionService.extractDiagram({
          imageBuffer: file.buffer,
          mimeType: file.mimetype,
          provider,
          groqApiKey: groqKeyHeader,
          geminiApiKey: geminiKeyHeader,
        });

        res.status(200).json({
          data: result,
        });
      } catch (err: any) {
        console.error('[AiController.importarDiagramaFoto] Error digitalizando imagen:', err);
        throw new AppError(err?.message || 'No fue posible digitalizar el diagrama.', 500, 'AI_VISION_ERROR');
      }
    },
  };
};
