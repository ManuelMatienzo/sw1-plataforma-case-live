import { Request, Response } from 'express';
import { GeminiService } from '../services/geminiService';
import { AppError } from '../errors/AppError';

export interface AiController {
  interpretarComandoVoz(req: Request, res: Response): Promise<void>;
  importarDiagramaFoto(req: Request, res: Response): Promise<void>;
}

export const createAiController = (geminiService: GeminiService): AiController => ({
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

    const result = await geminiService.extractDiagramFromImage({
      imageBuffer: file.buffer,
      mimeType: file.mimetype,
    });

    res.status(200).json({
      data: result,
    });
  },
});
