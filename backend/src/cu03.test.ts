import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { ChatService } from './services/chatService';
import { AuthSessionRepository } from './middlewares/auth';
import { CollaborationAccess, CollaborationRepository, setupUMLSocket } from './sockets/umlSocket';

const sessionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret = 'cu03-local-test-secret';

interface ClientSocket {
  connected: boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): this;
  disconnect(): this;
}
type ClientFactory = (url: string, options: { auth: { token: string }; transports: string[] }) => ClientSocket;
const clientModule = require(path.resolve(__dirname, '../../frontend/node_modules/socket.io-client')) as { io: ClientFactory };

const users = new Map([
  ['host', { id: 'host', nombre: 'Carlos Anfitrión', email: 'carlos@example.com', rol: 'ANFITRION' as const, activo: true }],
  ['collab', { id: 'collab', nombre: 'Ana Colaboradora', email: 'ana@example.com', rol: 'COLABORADOR' as const, activo: true }],
  ['stranger', { id: 'stranger', nombre: 'Pedro Ajeno', email: 'pedro@example.com', rol: 'COLABORADOR' as const, activo: true }],
]);

const authRepository: AuthSessionRepository = {
  async findSessionUserById(id) { return users.get(id) ?? null; },
};

const accessMap = new Map<string, CollaborationAccess>([
  [`${sessionA}:host`, { canJoin: true, canEdit: true, role: 'ANFITRION', permission: 'EDICION_COMPLETA' }],
  [`${sessionA}:collab`, { canJoin: true, canEdit: true, role: 'COLABORADOR', permission: 'EDICION_COMPLETA' }],
  [`${sessionA}:stranger`, { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' }],
]);

const collaborationRepository: CollaborationRepository = {
  async resolveAccess(sesionId, userId) {
    return accessMap.get(`${sesionId}:${userId}`) ?? { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' };
  },
};

const makeMockPrisma = () => {
  const messages: any[] = [];
  return {
    sesionColaborativa: {
      findUnique: async ({ where, select }: any) => {
        if (where.id !== sessionA) return null;
        const requestedUserId = select?.participantes?.where?.usuarioId;
        const participantes = requestedUserId === 'collab' ? [{ usuarioId: 'collab', id: 'part-1' }] : [];
        return {
          id: sessionA,
          estado: 'ABIERTA',
          anfitrionId: 'host',
          participantes,
        };
      },
    },
    mensajeChat: {
      create: async ({ data }: any) => {
        const row = { id: 'msg-' + (messages.length + 1), timestamp: new Date(), ...data };
        messages.push(row);
        return row;
      },
      findMany: async ({ where }: any) => {
        return messages.filter(m => m.sesionId === where.sesionId);
      },
      deleteMany: async ({ where }: any) => {
        const count = messages.filter(m => m.sesionId === where.sesionId).length;
        messages.length = 0;
        return { count };
      },
    },
  } as any;
};

test('ChatService: guarda mensajes válidos y rechaza vacíos o excesivos', async () => {
  const prisma = makeMockPrisma();
  const service = new ChatService({ prisma });

  const msg = await service.guardarMensaje({
    sesionId: sessionA,
    usuarioId: 'collab',
    autorNombre: 'Ana Colaboradora',
    contenido: 'Hola a todos!',
  });

  assert.equal(msg.contenido, 'Hola a todos!');
  assert.equal(msg.autorNombre, 'Ana Colaboradora');
  assert.ok(msg.id);
  assert.ok(msg.timestamp);

  await assert.rejects(
    service.guardarMensaje({
      sesionId: sessionA,
      usuarioId: 'collab',
      autorNombre: 'Ana',
      contenido: '   ',
    }),
    /vac/i,
  );

  await assert.rejects(
    service.guardarMensaje({
      sesionId: sessionA,
      usuarioId: 'collab',
      autorNombre: 'Ana',
      contenido: 'a'.repeat(2001),
    }),
    /2000/i,
  );

  await assert.rejects(
    service.guardarMensaje({
      sesionId: sessionA,
      usuarioId: 'stranger',
      autorNombre: 'Pedro',
      contenido: 'No pertenezco',
    }),
    /No perteneces/i,
  );
});

test('ChatService: solo el anfitrión puede limpiar el historial de chat', async () => {
  const prisma = makeMockPrisma();
  const service = new ChatService({ prisma });

  await service.guardarMensaje({
    sesionId: sessionA,
    usuarioId: 'host',
    autorNombre: 'Carlos',
    contenido: 'Mensaje 1',
  });

  const historialAntes = await service.obtenerHistorial(sessionA, 'host');
  assert.equal(historialAntes.length, 1);

  await assert.rejects(
    service.limpiarHistorial(sessionA, 'collab'),
    /Solo el Anfitrión/i,
  );

  const res = await service.limpiarHistorial(sessionA, 'host');
  assert.equal(res.eliminados, 1);

  const historialDespues = await service.obtenerHistorial(sessionA, 'host');
  assert.equal(historialDespues.length, 0);
});

test('WebSocket: sincronización de chat y evento chat:cleared en tiempo real', async () => {
  const prisma = makeMockPrisma();
  const chatService = new ChatService({ prisma });
  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  setupUMLSocket(io, { jwtSecret: secret, authRepository, collaborationRepository, chatService });
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}/uml-session`;

  const connect = (userId: string) => {
    return clientModule.io(url, {
      auth: { token: jwt.sign({}, secret, { subject: userId, expiresIn: '1h' }) },
      transports: ['websocket'],
    });
  };

  const waitEvent = <T>(socket: ClientSocket, event: string) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting ${event}`)), 1500);
    socket.once(event, (...args) => { clearTimeout(timer); resolve(args[0] as T); });
  });
  const emitAck = <T>(socket: ClientSocket, event: string, payload: unknown) => new Promise<T>(resolve => socket.emit(event, payload, resolve));

  const hostSocket = connect('host');
  const collabSocket = connect('collab');

  try {
    await Promise.all([waitEvent(hostSocket, 'connect'), waitEvent(collabSocket, 'connect')]);
    assert.deepEqual(await emitAck(hostSocket, 'session:join', { sesionId: sessionA }), { ok: true });
    assert.deepEqual(await emitAck(collabSocket, 'session:join', { sesionId: sessionA }), { ok: true });

    const chatReceivedPromise = waitEvent<{ contenido: string; autorNombre: string }>(hostSocket, 'chat:received');

    const ackResult = await emitAck<{ ok: boolean }>(collabSocket, 'chat:message', { contenido: '¡Hola Anfitrión!' });
    assert.equal(ackResult.ok, true);

    const received = await chatReceivedPromise;
    assert.equal(received.contenido, '¡Hola Anfitrión!');
    assert.equal(received.autorNombre, 'Ana Colaboradora');

    const unauthorizedClear = await emitAck<{ ok: boolean; error: { code: string } }>(collabSocket, 'chat:clear', {});
    assert.equal(unauthorizedClear.ok, false);
    assert.equal(unauthorizedClear.error.code, 'ONLY_HOST_ALLOWED');

    const clearReceivedPromise = waitEvent<{ clearedBy: string }>(collabSocket, 'chat:cleared');
    const hostClearAck = await emitAck<{ ok: boolean }>(hostSocket, 'chat:clear', {});
    assert.equal(hostClearAck.ok, true);

    const clearEvent = await clearReceivedPromise;
    assert.equal(clearEvent.clearedBy, 'Carlos Anfitrión');
  } finally {
    hostSocket.disconnect();
    collabSocket.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});
