import jwt from 'jsonwebtoken';
import { Namespace, Server, Socket } from 'socket.io';
import { AppError } from '../errors/AppError';
import { AuthSessionRepository } from '../middlewares/auth';
import { AuthenticatedUser } from '../types/auth';
import { DiagramOperation, operationTargets, parseDiagramOperation } from './diagramOperation';

import { ChatService } from '../services/chatService';
import prisma from '../config/prisma';
import { createParticipantManagementService, ManagedPermission, ParticipantManagementService } from '../services/participantManagementService';
import { createPrismaParticipantManagementRepository } from '../repositories/prismaParticipantManagementRepository';
import { XmiSessionService } from '../services/xmiService';
import { UMLDiagramAST } from '../models/uml.types';
import { UmlValidationReport } from '../services/umlValidator';

export interface CollaborationAccess {
  canJoin: boolean;
  canEdit: boolean;
  role: 'ANFITRION' | 'COLABORADOR';
  permission: 'SOLO_LECTURA' | 'EDICION_PARCIAL' | 'EDICION_COMPLETA';
}
export interface CollaborationRepository {
  resolveAccess(sesionId: string, userId: string): Promise<CollaborationAccess>;
}
export interface UserPresence {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  role: CollaborationAccess['role'];
  permission: CollaborationAccess['permission'];
  canEdit: boolean;
  cursor?: { x: number; y: number };
}
export interface AppliedOperation {
  type: DiagramOperation['type'];
  payload: DiagramOperation['payload'];
  operationId: string;
  actor: { userId: string; name: string; color: string };
  serverSequence: number;
  timestamp: string;
}
interface AckSuccess { ok: true }
interface AckFailure { ok: false; error: { code: string; message: string } }
type Ack = (result: AckSuccess | AckFailure) => void;
interface ClientEvents {
  'session:join': (payload: unknown, ack?: Ack) => void;
  'cursor:move': (payload: unknown) => void;
  'diagram:operation': (payload: unknown, ack?: Ack) => void;
  'chat:message': (payload: unknown, ack?: Ack) => void;
  'chat:clear': (payload: unknown, ack?: Ack) => void;
  'participant:set-permission': (payload: unknown, ack?: Ack) => void;
  'participant:kick': (payload: unknown, ack?: Ack) => void;
}
interface ServerEvents {
  'presence:list': (users: UserPresence[]) => void;
  'cursor:updated': (cursor: { socketId: string; userId: string; x: number; y: number }) => void;
  'diagram:applied': (payload: { operation: AppliedOperation }) => void;
  'diagram:conflict': (payload: { target: string; previous: { userId: string; name: string }; winner: { userId: string; name: string }; timestamp: string }) => void;
  'session:error': (payload: { code: string; message: string }) => void;
  'chat:received': (payload: { id: string; sesionId: string; usuarioId: string; autorNombre: string; contenido: string; timestamp: string }) => void;
  'chat:cleared': (payload: { timestamp: string; clearedBy: string }) => void;
  'session:permission-updated': (payload: { userId: string; permission: ManagedPermission; canEdit: boolean }) => void;
  'session:kicked': (payload: { message: string }) => void;
  'diagram:replaced': (payload: { diagram: UMLDiagramAST; summary: { classes: number; interfaces: number; attributes: number; methods: number; relationships: number }; warnings: string[]; validationReport: UmlValidationReport }) => void;
}
interface InterServerEvents {}
interface SocketData { user: AuthenticatedUser; sessionId?: string; access?: CollaborationAccess; accessCheckedAt?: number; }
type UmlSocket = Socket<ClientEvents, ServerEvents, InterServerEvents, SocketData>;
type UmlNamespace = Namespace<ClientEvents, ServerEvents, InterServerEvents, SocketData>;
interface SetupDependencies {
  jwtSecret: string;
  authRepository: AuthSessionRepository;
  collaborationRepository: CollaborationRepository;
  chatService?: ChatService;
  participantService?: ParticipantManagementService;
  xmiService?: XmiSessionService;
}
interface LatestEdit { userId: string; name: string; at: number }

const uuid = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i;
const colors = ['#22D3A0', '#F4C76B', '#FF8A99', '#9DB0FF', '#56B4E9', '#E69F00'];
const ackError = (error: unknown, ack?: Ack) => {
  const known = error instanceof AppError ? error : new AppError('No se pudo procesar el evento en tiempo real', 500, 'REALTIME_ERROR');
  ack?.({ ok: false, error: { code: known.code || 'REALTIME_ERROR', message: known.message } });
};
const readJoin = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || !uuid.test(String((payload as { sesionId?: unknown }).sesionId))) {
    throw new AppError('Identificador de sesión inválido', 400, 'INVALID_SESSION');
  }
  return (payload as { sesionId: string }).sesionId;
};
const readCursor = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return null;
  const { x, y } = payload as { x?: unknown; y?: unknown };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const bounded = (value: number) => Math.max(-100_000, Math.min(100_000, value));
  return { x: bounded(x as number), y: bounded(y as number) };
};
const readParticipantTarget = (payload: unknown) => {
  const targetUserId = payload && typeof payload === 'object' ? (payload as { targetUserId?: unknown }).targetUserId : undefined;
  if (typeof targetUserId !== 'string' || !uuid.test(targetUserId)) {
    throw new AppError('Identificador de colaborador inválido', 400, 'INVALID_PARTICIPANT');
  }
  return targetUserId;
};
const readParticipantPermission = (payload: unknown): { targetUserId: string; permission: ManagedPermission } => {
  const targetUserId = readParticipantTarget(payload);
  const permission = (payload as { permission?: unknown }).permission;
  if (permission !== 'SOLO_LECTURA' && permission !== 'EDICION_COMPLETA') {
    throw new AppError('Permiso inválido', 400, 'INVALID_PERMISSION');
  }
  return { targetUserId, permission };
};
const nextColor = (users: Map<string, UserPresence>) => colors.find(color => ![...users.values()].some(user => user.color === color)) ?? colors[users.size % colors.length];

export const setupUMLSocket = (io: Server, dependencies: SetupDependencies) => {
  const namespace = io.of('/uml-session') as UmlNamespace;
  const sessionUsers = new Map<string, Map<string, UserPresence>>();
  const sequences = new Map<string, number>();
  const latestEdits = new Map<string, Map<string, LatestEdit>>();
  const chatService = dependencies.chatService ?? new ChatService({ prisma });
  const participantService = dependencies.participantService ?? createParticipantManagementService(
    createPrismaParticipantManagementRepository(prisma),
  );

  dependencies.xmiService?.subscribe(event => {
    namespace.to(event.sessionId).emit('diagram:replaced', {
      diagram: event.diagram,
      summary: event.summary,
      warnings: event.warnings,
      validationReport: event.validationReport,
    });
  });

  namespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) throw new Error('missing token');
      const decoded = jwt.verify(token, dependencies.jwtSecret);
      const subject = typeof decoded === 'string' ? undefined : decoded.sub;
      if (!subject) throw new Error('missing subject');
      const user = await dependencies.authRepository.findSessionUserById(subject);
      if (!user?.activo) throw new Error('inactive user');
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Autenticación requerida para la colaboración en vivo'));
    }
  });

  const publishPresence = (sessionId: string) => {
    const users = sessionUsers.get(sessionId);
    namespace.to(sessionId).emit('presence:list', users ? [...users.values()] : []);
  };
  const leaveCurrent = (socket: UmlSocket, shouldPublish = true) => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;
    socket.leave(sessionId);
    const users = sessionUsers.get(sessionId);
    users?.delete(socket.id);
    delete socket.data.sessionId;
    delete socket.data.access;
    delete socket.data.accessCheckedAt;
    if (!users?.size) {
      sessionUsers.delete(sessionId);
      latestEdits.delete(sessionId);
      sequences.delete(sessionId);
    } else if (shouldPublish) publishPresence(sessionId);
  };
  const currentAccess = async (socket: UmlSocket, forceRefresh = false) => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) throw new AppError('Primero debes unirte a la sesión', 409, 'SESSION_NOT_JOINED');
    const now = Date.now();
    let access = socket.data.access;
    if (forceRefresh || !access || !socket.data.accessCheckedAt || now - socket.data.accessCheckedAt > 300_000) {
      access = await dependencies.collaborationRepository.resolveAccess(sessionId, socket.data.user.id);
      socket.data.access = access;
      socket.data.accessCheckedAt = now;
      if (!access.canJoin) {
        leaveCurrent(socket);
        throw new AppError('Ya no tienes acceso a esta sesión', 403, 'SESSION_ACCESS_REVOKED');
      }
      const presence = sessionUsers.get(sessionId)?.get(socket.id);
      if (presence && (presence.canEdit !== access.canEdit || presence.permission !== access.permission)) {
        Object.assign(presence, { canEdit: access.canEdit, permission: access.permission, role: access.role });
        publishPresence(sessionId);
      }
    }
    const presence = sessionUsers.get(sessionId)?.get(socket.id);
    return { sessionId, access, presence };
  };

  participantService.subscribe(event => {
    const users = sessionUsers.get(event.sessionId);
    if (!users) return;
    const targetSocketIds = [...users.values()]
      .filter(user => user.userId === event.targetUserId)
      .map(user => user.socketId);
    if (event.type === 'permission-updated') {
      const canEdit = event.permission === 'EDICION_COMPLETA';
      targetSocketIds.forEach(socketId => {
        const presence = users.get(socketId);
        if (presence) Object.assign(presence, { permission: event.permission, canEdit });
        const targetSocket = namespace.sockets.get(socketId);
        if (targetSocket?.data.access) {
          targetSocket.data.access = { ...targetSocket.data.access, permission: event.permission, canEdit };
          targetSocket.data.accessCheckedAt = Date.now();
        }
        namespace.to(socketId).emit('session:permission-updated', { userId: event.targetUserId, permission: event.permission, canEdit });
      });
      publishPresence(event.sessionId);
      return;
    }
    targetSocketIds.forEach(socketId => {
      const targetSocket = namespace.sockets.get(socketId);
      if (!targetSocket) return;
      targetSocket.emit('session:kicked', { message: 'Has sido removido de la sesión por el anfitrión.' });
      leaveCurrent(targetSocket, false);
    });
    if (sessionUsers.has(event.sessionId)) publishPresence(event.sessionId);
  });

  namespace.on('connection', socket => {
    socket.on('session:join', async (payload, ack) => {
      try {
        const sessionId = readJoin(payload);
        const access = await dependencies.collaborationRepository.resolveAccess(sessionId, socket.data.user.id);
        if (!access.canJoin) throw new AppError('No perteneces a una sesión activa', 403, 'FORBIDDEN');
        leaveCurrent(socket);
        const users = sessionUsers.get(sessionId) ?? new Map<string, UserPresence>();
        sessionUsers.set(sessionId, users);
        const presence: UserPresence = {
          socketId: socket.id, userId: socket.data.user.id, name: socket.data.user.nombre,
          color: nextColor(users), role: access.role, permission: access.permission, canEdit: access.canEdit,
        };
        users.set(socket.id, presence);
        socket.data.sessionId = sessionId;
        socket.data.access = access;
        socket.data.accessCheckedAt = Date.now();
        await socket.join(sessionId);
        publishPresence(sessionId);
        ack?.({ ok: true });
      } catch (error) { ackError(error, ack); }
    });

    socket.on('cursor:move', payload => {
      const cursor = readCursor(payload);
      if (!cursor) return;
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const presence = sessionUsers.get(sessionId)?.get(socket.id);
      if (!presence) return;
      presence.cursor = cursor;
      socket.to(sessionId).emit('cursor:updated', { socketId: socket.id, userId: socket.data.user.id, ...cursor });
    });

    socket.on('diagram:operation', async (payload, ack) => {
      try {
        const { sessionId, access, presence } = await currentAccess(socket);
        if (!access.canEdit) throw new AppError('Tu permiso es de solo lectura', 403, 'READ_ONLY');
        const parsed = parseDiagramOperation(payload);
        const sequence = (sequences.get(sessionId) ?? 0) + 1;
        sequences.set(sessionId, sequence);
        const timestamp = new Date().toISOString();
        const operation: AppliedOperation = {
          ...parsed,
          actor: { userId: socket.data.user.id, name: socket.data.user.nombre, color: presence?.color ?? colors[0] },
          serverSequence: sequence,
          timestamp,
        };
        socket.to(sessionId).emit('diagram:applied', { operation });
        const edits = latestEdits.get(sessionId) ?? new Map<string, LatestEdit>();
        latestEdits.set(sessionId, edits);
        const now = Date.now();
        for (const target of operationTargets(parsed)) {
          const previous = edits.get(target);
          const isPosition = target.endsWith(':position');
          const conflictWindow = isPosition ? 400 : 1_000;
          if (previous && previous.userId !== socket.data.user.id && now - previous.at <= conflictWindow) {
            namespace.to(sessionId).emit('diagram:conflict', {
              target,
              previous: { userId: previous.userId, name: previous.name },
              winner: { userId: socket.data.user.id, name: socket.data.user.nombre },
              timestamp,
            });
          }
          edits.set(target, { userId: socket.data.user.id, name: socket.data.user.nombre, at: now });
        }
        ack?.({ ok: true });
      } catch (error) { ackError(error, ack); }
    });

    socket.on('chat:message', async (payload, ack) => {
      try {
        const { sessionId } = await currentAccess(socket);
        const content = payload && typeof payload === 'object' ? (payload as { contenido?: unknown }).contenido : undefined;
        if (typeof content !== 'string' || !content.trim() || content.length > 2_000) throw new AppError('Mensaje inválido', 400, 'INVALID_MESSAGE');
        const guardado = await chatService.guardarMensaje({
          sesionId: sessionId,
          usuarioId: socket.data.user.id,
          autorNombre: socket.data.user.nombre,
          contenido: content.trim(),
        });
        namespace.to(sessionId).emit('chat:received', guardado);
        ack?.({ ok: true });
      } catch (error) { ackError(error, ack); }
    });

    socket.on('chat:clear', async (_payload, ack) => {
      try {
        const { sessionId, access } = await currentAccess(socket);
        if (access.role !== 'ANFITRION') throw new AppError('Solo el Anfitrión puede vaciar el historial de chat', 403, 'ONLY_HOST_ALLOWED');
        await chatService.limpiarHistorial(sessionId, socket.data.user.id);
        namespace.to(sessionId).emit('chat:cleared', {
          timestamp: new Date().toISOString(),
          clearedBy: socket.data.user.nombre,
        });
        ack?.({ ok: true });
      } catch (error) { ackError(error, ack); }
    });

    socket.on('participant:set-permission', async (payload, ack) => {
      try {
        const { sessionId, access } = await currentAccess(socket, true);
        if (access.role !== 'ANFITRION') throw new AppError('Solo el anfitrión puede administrar colaboradores', 403, 'ONLY_HOST_ALLOWED');
        const { targetUserId, permission } = readParticipantPermission(payload);
        await participantService.updatePermission(sessionId, socket.data.user.id, targetUserId, permission);
        ack?.({ ok: true });
      } catch (error) { ackError(error, ack); }
    });

    socket.on('participant:kick', async (payload, ack) => {
      try {
        const { sessionId, access } = await currentAccess(socket, true);
        if (access.role !== 'ANFITRION') throw new AppError('Solo el anfitrión puede administrar colaboradores', 403, 'ONLY_HOST_ALLOWED');
        const targetUserId = readParticipantTarget(payload);
        await participantService.removeParticipant(sessionId, socket.data.user.id, targetUserId);
        ack?.({ ok: true });
      } catch (error) { ackError(error, ack); }
    });

    socket.on('disconnect', () => leaveCurrent(socket));
  });
};
