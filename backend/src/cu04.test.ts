import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createApp } from './app';
import { AppError } from './errors/AppError';
import { AuthSessionRepository } from './middlewares/auth';
import { AdminService } from './services/adminService';
import { AuthService } from './services/authService';
import { CollaborationRepository, setupUMLSocket } from './sockets/umlSocket';
import {
  createParticipantManagementService,
  ParticipantManagementEvent,
  ParticipantManagementRepository,
} from './services/participantManagementService';

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hostId = '11111111-1111-4111-8111-111111111111';
const collaboratorId = '22222222-2222-4222-8222-222222222222';
const outsiderId = '33333333-3333-4333-8333-333333333333';
const secret = 'cu04-test-secret-long-enough';

interface ClientSocket {
  on(event: string, listener: (...args: unknown[]) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): this;
  disconnect(): this;
}
type ClientFactory = (url: string, options: { auth: { token: string }; transports: string[] }) => ClientSocket;
const clientModule = require(path.resolve(__dirname, '../../frontend/node_modules/socket.io-client')) as { io: ClientFactory };
const waitEvent = <T>(socket: ClientSocket, event: string) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timeout waiting ${event}`)), 1_500);
  socket.once(event, (...args) => { clearTimeout(timer); resolve(args[0] as T); });
});
const emitAck = <T>(socket: ClientSocket, event: string, payload: unknown) => new Promise<T>(resolve => socket.emit(event, payload, resolve));

const repositoryFixture = () => {
  let permission: 'SOLO_LECTURA' | 'EDICION_COMPLETA' = 'SOLO_LECTURA';
  let present = true;
  const repository: ParticipantManagementRepository = {
    findHostId: async id => id === sessionId ? hostId : null,
    isSessionMember: async (id, userId) =>
      id === sessionId && (userId === hostId || (userId === collaboratorId && present)),
    updatePermissionWithAudit: async (id, targetUserId, nextPermission) => {
      if (id !== sessionId || targetUserId !== collaboratorId || !present) return null;
      permission = nextPermission;
      return { userId: collaboratorId, permission };
    },
    removeParticipantWithAudit: async (id, targetUserId) => {
      if (id !== sessionId || targetUserId !== collaboratorId || !present) return false;
      present = false;
      return true;
    },
  };
  return { repository, getPermission: () => permission, isPresent: () => present };
};

test('solo anfitrión y participantes pueden consultar la lista de la sesión', async () => {
  const service = createParticipantManagementService(repositoryFixture().repository);

  await service.assertCanViewSession(sessionId, hostId);
  await service.assertCanViewSession(sessionId, collaboratorId);
  await assert.rejects(
    () => service.assertCanViewSession(sessionId, outsiderId),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 403 && error.code === 'SESSION_ACCESS_DENIED',
  );
});

test('el anfitrión cambia permisos y publica el cambio para todos los sockets del colaborador', async () => {
  const fixture = repositoryFixture();
  const service = createParticipantManagementService(fixture.repository);
  const events: ParticipantManagementEvent[] = [];
  service.subscribe(event => events.push(event));

  const result = await service.updatePermission(sessionId, hostId, collaboratorId, 'EDICION_COMPLETA');

  assert.deepEqual(result, { userId: collaboratorId, permission: 'EDICION_COMPLETA' });
  assert.equal(fixture.getPermission(), 'EDICION_COMPLETA');
  assert.deepEqual(events, [{ type: 'permission-updated', sessionId, targetUserId: collaboratorId, permission: 'EDICION_COMPLETA' }]);
});

test('impide que un colaborador administre permisos y protege al anfitrión', async () => {
  const service = createParticipantManagementService(repositoryFixture().repository);

  await assert.rejects(
    () => service.updatePermission(sessionId, collaboratorId, hostId, 'SOLO_LECTURA'),
    (error: unknown) => error instanceof AppError && error.statusCode === 403 && error.code === 'ONLY_HOST_ALLOWED',
  );
  await assert.rejects(
    () => service.removeParticipant(sessionId, hostId, hostId),
    (error: unknown) => error instanceof AppError && error.statusCode === 409 && error.code === 'HOST_IMMUTABLE',
  );
});

test('remueve al colaborador, publica la expulsión e informa si ya no pertenece a la sesión', async () => {
  const fixture = repositoryFixture();
  const service = createParticipantManagementService(fixture.repository);
  const events: ParticipantManagementEvent[] = [];
  service.subscribe(event => events.push(event));

  await service.removeParticipant(sessionId, hostId, collaboratorId);

  assert.equal(fixture.isPresent(), false);
  assert.deepEqual(events, [{ type: 'participant-kicked', sessionId, targetUserId: collaboratorId }]);
  await assert.rejects(
    () => service.removeParticipant(sessionId, hostId, collaboratorId),
    (error: unknown) => error instanceof AppError && error.statusCode === 404 && error.code === 'PARTICIPANT_NOT_FOUND',
  );
});

test('las rutas REST exigen al anfitrión, validan el permiso y protegen su propia membresía', async () => {
  const service = createParticipantManagementService(repositoryFixture().repository);
  const authService: AuthService = { login: async () => { throw new Error('No usado'); } };
  const adminService: AdminService = {
    listUsers: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    createUser: async () => { throw new Error('No usado'); },
    setUserStatus: async () => { throw new Error('No usado'); },
    deleteUser: async () => { throw new Error('No usado'); },
    listProjects: async () => [],
    setProjectStatus: async () => { throw new Error('No usado'); },
  };
  const sessionRepository: AuthSessionRepository = {
    findSessionUserById: async id => ({
      id,
      nombre: id === hostId ? 'Elena' : 'Rafael',
      email: `${id}@example.com`,
      rol: id === hostId ? 'ANFITRION' : 'COLABORADOR',
      activo: true,
    }),
  };
  const app = createApp({
    authService,
    adminService,
    sessionRepository,
    jwtSecret: secret,
    corsOrigin: 'http://localhost:5173',
    participantService: service,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de prueba sin puerto');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const token = (userId: string) => jwt.sign({}, secret, { subject: userId, expiresIn: '1h' });
  const request = (method: string, actorId: string, targetId: string, body?: unknown) => fetch(
    `${baseUrl}/api/sesiones/${sessionId}/participantes/${targetId}`,
    {
      method,
      headers: { Authorization: `Bearer ${token(actorId)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );

  try {
    const hiddenFromOutsider = await fetch(`${baseUrl}/api/sesiones/${sessionId}`, {
      headers: { Authorization: `Bearer ${token(outsiderId)}` },
    });
    assert.equal(hiddenFromOutsider.status, 403);
    const invalid = await request('PATCH', hostId, collaboratorId, { permiso: 'EDICION_PARCIAL' });
    assert.equal(invalid.status, 400);
    const forbidden = await request('PATCH', collaboratorId, collaboratorId, { permiso: 'EDICION_COMPLETA' });
    assert.equal(forbidden.status, 403);
    const updated = await request('PATCH', hostId, collaboratorId, { permiso: 'EDICION_COMPLETA' });
    assert.equal(updated.status, 200);
    assert.deepEqual((await updated.json() as { data: unknown }).data, { userId: collaboratorId, permission: 'EDICION_COMPLETA' });
    const immutable = await request('DELETE', hostId, hostId);
    assert.equal(immutable.status, 409);
    const removed = await request('DELETE', hostId, collaboratorId);
    assert.equal(removed.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('actualiza o expulsa todas las pestañas del colaborador y renueva la presencia en vivo', async () => {
  const fixture = repositoryFixture();
  const participantService = createParticipantManagementService(fixture.repository);
  const authRepository: AuthSessionRepository = {
    findSessionUserById: async id => ({
      id,
      nombre: id === hostId ? 'Elena' : 'Rafael',
      email: `${id}@example.com`,
      rol: id === hostId ? 'ANFITRION' : 'COLABORADOR',
      activo: true,
    }),
  };
  const collaborationRepository: CollaborationRepository = {
    async resolveAccess(id, userId) {
      if (id !== sessionId || (userId !== hostId && (!fixture.isPresent() || userId !== collaboratorId))) {
        return { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' };
      }
      if (userId === hostId) return { canJoin: true, canEdit: true, role: 'ANFITRION', permission: 'EDICION_COMPLETA' };
      const permission = fixture.getPermission();
      return { canJoin: true, canEdit: permission === 'EDICION_COMPLETA', role: 'COLABORADOR', permission };
    },
  };
  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  setupUMLSocket(io, { jwtSecret: secret, authRepository, collaborationRepository, participantService });
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Servidor Socket.IO sin puerto');
  const url = `http://127.0.0.1:${address.port}/uml-session`;
  const connect = (userId: string) => clientModule.io(url, {
    auth: { token: jwt.sign({}, secret, { subject: userId, expiresIn: '1h' }) },
    transports: ['websocket'],
  });
  const host = connect(hostId);
  const collaboratorA = connect(collaboratorId);
  const collaboratorB = connect(collaboratorId);

  try {
    await Promise.all([waitEvent(host, 'connect'), waitEvent(collaboratorA, 'connect'), waitEvent(collaboratorB, 'connect')]);
    assert.deepEqual(await emitAck(host, 'session:join', { sesionId: sessionId }), { ok: true });
    assert.deepEqual(await emitAck(collaboratorA, 'session:join', { sesionId: sessionId }), { ok: true });
    assert.deepEqual(await emitAck(collaboratorB, 'session:join', { sesionId: sessionId }), { ok: true });

    const forbidden = await emitAck<{ ok: boolean; error: { code: string } }>(collaboratorA, 'participant:set-permission', {
      targetUserId: collaboratorId,
      permission: 'EDICION_COMPLETA',
    });
    assert.equal(forbidden.error.code, 'ONLY_HOST_ALLOWED');

    const updatedA = waitEvent<{ permission: string; canEdit: boolean }>(collaboratorA, 'session:permission-updated');
    const updatedB = waitEvent<{ permission: string; canEdit: boolean }>(collaboratorB, 'session:permission-updated');
    const presenceAfterPermission = waitEvent<Array<{ userId: string; canEdit: boolean }>>(host, 'presence:list');
    assert.deepEqual(await emitAck(host, 'participant:set-permission', {
      targetUserId: collaboratorId,
      permission: 'EDICION_COMPLETA',
    }), { ok: true });
    assert.deepEqual(await Promise.all([updatedA, updatedB]), [
      { userId: collaboratorId, permission: 'EDICION_COMPLETA', canEdit: true },
      { userId: collaboratorId, permission: 'EDICION_COMPLETA', canEdit: true },
    ]);
    assert.equal((await presenceAfterPermission).filter(user => user.userId === collaboratorId).every(user => user.canEdit), true);

    const kickedA = waitEvent<{ message: string }>(collaboratorA, 'session:kicked');
    const kickedB = waitEvent<{ message: string }>(collaboratorB, 'session:kicked');
    const presenceAfterKick = waitEvent<Array<{ userId: string }>>(host, 'presence:list');
    assert.deepEqual(await emitAck(host, 'participant:kick', { targetUserId: collaboratorId }), { ok: true });
    assert.match((await kickedA).message, /removido/i);
    assert.match((await kickedB).message, /removido/i);
    assert.deepEqual((await presenceAfterKick).map(user => user.userId), [hostId]);
    const rejected = await emitAck<{ ok: boolean; error: { code: string } }>(collaboratorA, 'diagram:operation', {
      type: 'class:delete', payload: { classId: 'Paciente' }, operationId: 'after-kick',
    });
    assert.equal(rejected.error.code, 'SESSION_NOT_JOINED');
  } finally {
    host.disconnect(); collaboratorA.disconnect(); collaboratorB.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});
