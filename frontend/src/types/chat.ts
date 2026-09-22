export interface ChatMessage {
  id: string;
  sesionId: string;
  usuarioId: string;
  autorNombre: string;
  contenido: string;
  timestamp: string;
}

export interface ChatHistoryResponse {
  mensajes: ChatMessage[];
}

export interface SendChatMessagePayload {
  contenido: string;
}
