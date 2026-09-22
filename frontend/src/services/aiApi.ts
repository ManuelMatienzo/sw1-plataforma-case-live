import { apiClient, getApiErrorMessage } from './api';
import { InterpretCommandResult, PhotoImportResult } from '../types/ai';

export const aiApi = {
  /**
   * Envía un archivo de audio grabado por el usuario al backend para interpretación
   * semántica con Gemini 3.5 Flash Lite (o fallback determinista si no hay conexión externa).
   */
  async interpretarAudio(audioBlob: Blob, clasesActuales: string[] = []): Promise<InterpretCommandResult> {
    const formData = new FormData();
    const extension = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio', audioBlob, `voice-command.${extension}`);
    formData.append('clases', JSON.stringify(clasesActuales));

    try {
      const response = await apiClient.post<{ data: InterpretCommandResult }>('/ia/comando-voz', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30_000,
      });
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible procesar el audio del comando de voz.');
      throw new Error(msg);
    }
  },

  /**
   * Envía una instrucción escrita en lenguaje natural para ser interpretada semánticamente.
   */
  async interpretarTexto(texto: string, clasesActuales: string[] = []): Promise<InterpretCommandResult> {
    try {
      const response = await apiClient.post<{ data: InterpretCommandResult }>(
        '/ia/comando-voz',
        {
          texto,
          clases: clasesActuales,
        },
        {
          timeout: 30_000,
        },
      );
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible interpretar la instrucción en lenguaje natural.');
      throw new Error(msg);
    }
  },

  /**
   * Envía una fotografía o imagen de un diagrama UML al backend para su
   * digitalización mediante visión por computadora con Google Gemini.
   */
  async importarDiagramaFoto(imageFile: File): Promise<PhotoImportResult> {
    const formData = new FormData();
    formData.append('imagen', imageFile, imageFile.name);

    try {
      const response = await apiClient.post<{ data: PhotoImportResult }>('/ia/importar-foto', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60_000,
      });
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible digitalizar el diagrama a partir de la imagen.');
      throw new Error(msg);
    }
  },
};
