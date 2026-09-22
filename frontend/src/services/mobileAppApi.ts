import { apiClient, getApiErrorMessage } from './api';
import type { UMLDiagramAST } from '../types/uml';
import type { MobileAccess, MobileAppResult } from '../types/mobile';

const download = (data: BlobPart, disposition: string | undefined, fallback: string) => {
  const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
  const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const mobileAppApi = {
  async generateDirect(diagrama: UMLDiagramAST): Promise<MobileAppResult> {
    try {
      const response = await apiClient.post<{ data: MobileAppResult }>('/movil/generar-directo', { diagrama }, { timeout: 30_000 });
      return response.data.data;
    } catch (error) { throw new Error(getApiErrorMessage(error, 'No fue posible generar la app móvil.')); }
  },
  async generateSession(sesionId: string): Promise<MobileAppResult> {
    try {
      const response = await apiClient.post<{ data: MobileAppResult }>(`/movil/sesiones/${sesionId}/generar`, {}, { timeout: 30_000 });
      return response.data.data;
    } catch (error) { throw new Error(getApiErrorMessage(error, 'No fue posible generar la app de esta sesión.')); }
  },
  async getQr(sesionId: string): Promise<MobileAccess> {
    const response = await apiClient.get<{ data: MobileAccess }>(`/movil/sesiones/${sesionId}/qr`);
    return response.data.data;
  },
  async downloadZip(sesionId: string): Promise<void> {
    const response = await apiClient.get(`/movil/sesiones/${sesionId}/descargar-zip`, { responseType: 'blob', timeout: 30_000 });
    download(response.data, response.headers['content-disposition'], 'app_movil.zip');
  },
  async downloadZipDirect(diagrama: UMLDiagramAST): Promise<void> {
    const response = await apiClient.post('/movil/generar-directo?format=zip', { diagrama }, { responseType: 'blob', timeout: 30_000 });
    download(response.data, response.headers['content-disposition'], 'app_movil.zip');
  },
};
