import { apiClient, getApiErrorMessage } from './api';
import { getStoredSession } from './authStorage';
import type { RunnerSnapshot, SpringProjectResult } from '../types/spring';
import type { UMLDiagramAST } from '../types/uml';

const downloadResponse = (data: BlobPart, disposition: string | undefined, fallback: string, type: string) => {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = match?.[1] ?? fallback;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const springApi = {
  async generarDesdeAst(diagrama: UMLDiagramAST): Promise<SpringProjectResult> {
    try {
      const response = await apiClient.post<{ data: SpringProjectResult }>('/spring/generar-directo', { diagrama }, { timeout: 30_000 });
      return response.data.data;
    } catch (error) { throw new Error(getApiErrorMessage(error, 'No fue posible generar el proyecto Spring Boot.')); }
  },

  async generarDesdeSesion(sesionId: string): Promise<SpringProjectResult> {
    try {
      const response = await apiClient.post<{ data: SpringProjectResult }>(`/spring/sesiones/${sesionId}/generar`, {}, { timeout: 30_000 });
      return response.data.data;
    } catch (error) { throw new Error(getApiErrorMessage(error, 'No fue posible generar el proyecto de la sesión.')); }
  },

  async descargarZip(sesionId: string): Promise<void> {
    const response = await apiClient.get(`/spring/sesiones/${sesionId}/descargar-zip`, { responseType: 'blob', timeout: 30_000 });
    downloadResponse(response.data, response.headers['content-disposition'], 'proyecto_backend.zip', 'application/zip');
  },

  async descargarPostman(sesionId: string): Promise<void> {
    const response = await apiClient.get(`/spring/sesiones/${sesionId}/postman`, { responseType: 'blob' });
    downloadResponse(response.data, response.headers['content-disposition'], 'coleccion-postman.json', 'application/json');
  },

  async iniciarRunner(sesionId: string): Promise<RunnerSnapshot> {
    const response = await apiClient.post<{ data: RunnerSnapshot }>(`/spring/runner/${sesionId}/iniciar`, {}, { timeout: 30_000 });
    return response.data.data;
  },

  async detenerRunner(sesionId: string): Promise<RunnerSnapshot> {
    const response = await apiClient.post<{ data: RunnerSnapshot }>(`/spring/runner/${sesionId}/detener`);
    return response.data.data;
  },

  async obtenerEstado(sesionId: string): Promise<RunnerSnapshot> {
    const response = await apiClient.get<{ data: RunnerSnapshot }>(`/spring/runner/${sesionId}/estado`);
    return response.data.data;
  },

  conectarLogs(
    sesionId: string,
    handlers: { onLog(line: string): void; onStatus(status: RunnerSnapshot): void; onError?(): void },
  ): () => void {
    const token = getStoredSession()?.token;
    const base = String(apiClient.defaults.baseURL ?? '/api').replace(/\/$/, '');
    const query = token ? `?access_token=${encodeURIComponent(token)}` : '';
    const source = new EventSource(`${base}/spring/runner/${sesionId}/logs/stream${query}`);
    source.addEventListener('log', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { line: string };
      handlers.onLog(payload.line);
    });
    source.addEventListener('status', (event) => handlers.onStatus(JSON.parse((event as MessageEvent).data)));
    source.onerror = () => handlers.onError?.();
    return () => source.close();
  },
};
