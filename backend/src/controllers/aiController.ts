import { Request, Response } from 'express';
import { GeminiService } from '../services/geminiService';
import { AppError } from '../errors/AppError';

export interface AiController {
  interpretarComandoVoz(req: Request, res: Response): Promise<void>;
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
});
