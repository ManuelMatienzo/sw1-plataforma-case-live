import axios from 'axios';
import { getStoredSession } from './authStorage';
import { ChatHistoryResponse, ChatMessage } from '../types/chat';

const getClient = () => {
  const session = getStoredSession();
  return axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
    timeout: 10_000,
  });
};

export const chatApi = {
  async getHistorial(sesionId: string): Promise<ChatMessage[]> {
    const response = await getClient().get<ChatHistoryResponse>(`/sesiones/${sesionId}/mensajes`);
    return response.data.mensajes;
  },

  async limpiarHistorial(sesionId: string): Promise<void> {
    await getClient().delete(`/sesiones/${sesionId}/mensajes`);
  },
};
