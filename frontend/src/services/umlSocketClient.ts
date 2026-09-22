import { io, Socket } from 'socket.io-client';
import type { AppliedDiagramOperation, DiagramConflict, DiagramOperation, ParticipantPermission, PermissionUpdatedEvent, PresenceUser, SessionKickedEvent } from '../types/realtime';
import type { ChatMessage } from '../types/chat';
import type { XmiImportResult } from './xmiService';

export type RealtimeStatus = 'connecting' | 'online' | 'offline';
export interface RealtimeError { code: string; message: string }
interface AckResult { ok: boolean; error?: RealtimeError }
export interface RealtimeTransport {
  readonly id?: string;
  readonly connected: boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, payload: unknown, ack?: (result: unknown) => void): this;
  connect(): this;
  disconnect(): this;
}
interface Options {
  token: string;
  sessionId: string;
  endpoint?: string;
  transportFactory?: (endpoint: string, token: string) => RealtimeTransport;
  onOperation?: (operation: AppliedDiagramOperation) => void;
  onPresence?: (users: PresenceUser[], selfSocketId: string | null) => void;
  onCursor?: (cursor: { socketId: string; userId: string; x: number; y: number }) => void;
  onConflict?: (conflict: DiagramConflict) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onChatCleared?: (event: { timestamp: string; clearedBy: string }) => void;
  onPermissionUpdated?: (event: PermissionUpdatedEvent) => void;
  onKicked?: (event: SessionKickedEvent) => void;
  onDiagramReplaced?: (event: XmiImportResult) => void;
  onStatus?: (status: RealtimeStatus) => void;
  onError?: (error: RealtimeError) => void;
}
export interface UmlSocketClient {
  connect(): void;
  disconnect(): void;
  emitOperation(operation: DiagramOperation): void;
  moveCursor(x: number, y: number): void;
  sendChatMessage(contenido: string, ackCallback?: (ok: boolean, error?: string) => void): void;
  clearChat(ackCallback?: (ok: boolean, error?: string) => void): void;
  setParticipantPermission(userId: string, permission: ParticipantPermission, ackCallback?: (ok: boolean, error?: string) => void): void;
  kickParticipant(userId: string, ackCallback?: (ok: boolean, error?: string) => void): void;
}

const socketEndpoint = () => {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl || apiUrl.startsWith('/')) return '/uml-session';
  return apiUrl.replace(/\/api\/?$/, '') + '/uml-session';
};
const defaultTransport = (endpoint: string, token: string): RealtimeTransport => {
  const socket: Socket = io(endpoint, { auth: { token }, autoConnect: false, transports: ['websocket', 'polling'] });
  return {
    get id() { return socket.id; },
    get connected() { return socket.connected; },
    on(event, listener) { socket.on(event, listener); return this; },
    emit(event, payload, ack) { if (ack) socket.emit(event, payload, ack); else socket.emit(event, payload); return this; },
    connect() { socket.connect(); return this; },
    disconnect() { socket.disconnect(); return this; },
  };
};
const errorFrom = (value: unknown, fallback: string): RealtimeError => {
  if (value && typeof value === 'object') {
    const candidate = value as { code?: unknown; message?: unknown };
    if (typeof candidate.message === 'string') return { code: typeof candidate.code === 'string' ? candidate.code : 'REALTIME_ERROR', message: candidate.message };
  }
  return { code: 'REALTIME_ERROR', message: fallback };
};
const ack = (value: unknown): AckResult => value && typeof value === 'object' && 'ok' in value ? value as AckResult : { ok: false, error: { code: 'REALTIME_ERROR', message: 'El servidor no confirmó la operación.' } };

export function createUmlSocketClient(options: Options): UmlSocketClient {
  const transport = (options.transportFactory ?? defaultTransport)(options.endpoint ?? socketEndpoint(), options.token);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCursor: { x: number; y: number } | null = null;
  let lastCursorSentAt = Number.NEGATIVE_INFINITY;
  const pendingMoves = new Map<string, DiagramOperation>();
  const moveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastMoveSentAt = new Map<string, number>();
  let stopped = false;
  let joined = false;
  const pendingOperations: DiagramOperation[] = [];
  const reportAck = (result: unknown) => {
    const response = ack(result);
    if (!response.ok) options.onError?.(response.error ?? { code: 'REALTIME_ERROR', message: 'No se pudo sincronizar el cambio.' });
  };
  const flushCursor = () => {
    cursorTimer = null;
    if (!pendingCursor || stopped || !transport.connected || !joined) return;
    const cursor = pendingCursor;
    pendingCursor = null;
    lastCursorSentAt = Date.now();
    transport.emit('cursor:move', cursor);
  };
  const sendOperation = (operation: DiagramOperation) => transport.emit('diagram:operation', operation, reportAck);
  const flushMove = (classId: string) => {
    const timer = moveTimers.get(classId);
    if (timer) { clearTimeout(timer); moveTimers.delete(classId); }
    const op = pendingMoves.get(classId);
    if (!op || stopped || !transport.connected || !joined) return;
    pendingMoves.delete(classId);
    lastMoveSentAt.set(classId, Date.now());
    sendOperation(op);
  };
  const flushAllMoves = () => {
    for (const classId of [...pendingMoves.keys()]) flushMove(classId);
  };
  transport.on('connect', () => {
    if (stopped) return;
    joined = false;
    options.onStatus?.('connecting');
    transport.emit('session:join', { sesionId: options.sessionId }, result => {
      const response = ack(result);
      if (!response.ok) { options.onStatus?.('offline'); reportAck(result); return; }
      joined = true;
      options.onStatus?.('online');
      pendingOperations.splice(0).forEach(sendOperation);
      flushCursor();
      flushAllMoves();
    });
  });
  transport.on('disconnect', () => { joined = false; options.onStatus?.('offline'); });
  transport.on('connect_error', value => {
    options.onStatus?.('offline');
    options.onError?.(errorFrom(value, 'No se pudo conectar con la colaboración en vivo.'));
  });
  transport.on('presence:list', value => options.onPresence?.(value as PresenceUser[], transport.id ?? null));
  transport.on('cursor:updated', value => options.onCursor?.(value as { socketId: string; userId: string; x: number; y: number }));
  transport.on('diagram:applied', value => {
    const event = value as { operation?: AppliedDiagramOperation };
    if (event.operation) options.onOperation?.(event.operation);
  });
  transport.on('diagram:conflict', value => options.onConflict?.(value as DiagramConflict));
  transport.on('session:error', value => options.onError?.(errorFrom(value, 'La sesión en vivo dejó de estar disponible.')));
  transport.on('chat:received', value => {
    if (value && typeof value === 'object') options.onChatMessage?.(value as ChatMessage);
  });
  transport.on('chat:cleared', value => {
    if (value && typeof value === 'object') options.onChatCleared?.(value as { timestamp: string; clearedBy: string });
  });
  transport.on('session:permission-updated', value => {
    if (value && typeof value === 'object') options.onPermissionUpdated?.(value as PermissionUpdatedEvent);
  });
  transport.on('session:kicked', value => {
    if (value && typeof value === 'object') options.onKicked?.(value as SessionKickedEvent);
  });
  transport.on('diagram:replaced', value => {
    if (value && typeof value === 'object') options.onDiagramReplaced?.(value as XmiImportResult);
  });
  const emitManagement = (event: 'participant:set-permission' | 'participant:kick', payload: unknown, callback?: (ok: boolean, error?: string) => void) => {
    if (stopped || !transport.connected || !joined) {
      callback?.(false, 'Sin conexión con la sesión en vivo.');
      return;
    }
    transport.emit(event, payload, result => {
      const response = ack(result);
      callback?.(response.ok, response.ok ? undefined : response.error?.message);
    });
  };
  return {
    connect() { stopped = false; options.onStatus?.('connecting'); transport.connect(); },
    sendChatMessage(contenido, ackCallback) {
      if (stopped || !transport.connected || !joined) {
        ackCallback?.(false, 'Sin conexión con la sesión en vivo.');
        return;
      }
      transport.emit('chat:message', { contenido }, result => {
        const response = ack(result);
        if (response.ok) ackCallback?.(true);
        else ackCallback?.(false, response.error?.message);
      });
    },
    clearChat(ackCallback) {
      if (stopped || !transport.connected || !joined) {
        ackCallback?.(false, 'Sin conexión con la sesión en vivo.');
        return;
      }
      transport.emit('chat:clear', {}, result => {
        const response = ack(result);
        if (response.ok) ackCallback?.(true);
        else ackCallback?.(false, response.error?.message);
      });
    },
    setParticipantPermission(userId, permission, ackCallback) {
      emitManagement('participant:set-permission', { targetUserId: userId, permission }, ackCallback);
    },
    kickParticipant(userId, ackCallback) {
      emitManagement('participant:kick', { targetUserId: userId }, ackCallback);
    },
    disconnect() {
      stopped = true;
      joined = false;
      pendingCursor = null;
      pendingOperations.length = 0;
      if (cursorTimer) clearTimeout(cursorTimer);
      cursorTimer = null;
      moveTimers.forEach(timer => clearTimeout(timer));
      moveTimers.clear();
      pendingMoves.clear();
      transport.disconnect();
      options.onStatus?.('offline');
    },
    emitOperation(operation) {
      if (stopped) return;
      if (operation.type === 'class:move') {
        const classId = (operation.payload as { classId: string }).classId;
        pendingMoves.set(classId, operation);
        if (!transport.connected || !joined) return;
        const last = lastMoveSentAt.get(classId) ?? Number.NEGATIVE_INFINITY;
        const elapsed = Date.now() - last;
        if (elapsed >= 30) { flushMove(classId); return; }
        if (!moveTimers.has(classId)) {
          moveTimers.set(classId, setTimeout(() => flushMove(classId), 30 - elapsed));
        }
        return;
      }
      flushAllMoves();
      if (!transport.connected || !joined) {
        if (pendingOperations.length < 1_000) pendingOperations.push(operation);
        else options.onError?.({ code: 'REALTIME_QUEUE_FULL', message: 'Hay demasiados cambios pendientes. Guarda una copia antes de continuar.' });
        return;
      }
      sendOperation(operation);
    },
    moveCursor(x, y) {
      if (stopped || !Number.isFinite(x) || !Number.isFinite(y)) return;
      pendingCursor = { x, y };
      if (!transport.connected || !joined) return;
      const elapsed = Date.now() - lastCursorSentAt;
      if (elapsed >= 30) { flushCursor(); return; }
      if (!cursorTimer) cursorTimer = setTimeout(flushCursor, 30 - elapsed);
    },
  };
}
