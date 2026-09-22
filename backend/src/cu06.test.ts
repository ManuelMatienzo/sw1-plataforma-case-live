import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { AuthSessionRepository } from './middlewares/auth';
import {
  CollaborationAccess,
  CollaborationRepository,
  setupUMLSocket,
} from './sockets/umlSocket';

const sessionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secret = 'cu06-local-test-secret';

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
  ['editor', { id: 'editor', nombre: 'Elena', email: 'elena@example.com', rol: 'COLABORADOR' as const, activo: true }],
  ['reader', { id: 'reader', nombre: 'Rafael', email: 'rafael@example.com', rol: 'COLABORADOR' as const, activo: true }],
  ['other', { id: 'other', nombre: 'Olga', email: 'olga@example.com', rol: 'COLABORADOR' as const, activo: true }],
]);
const authRepository: AuthSessionRepository = { async findSessionUserById(id) { return users.get(id) ?? null; } };
const access = new Map<string, CollaborationAccess>([
  [`${sessionA}:editor`, { canJoin: true, canEdit: true, role: 'COLABORADOR', permission: 'EDICION_COMPLETA' }],
  [`${sessionA}:reader`, { canJoin: true, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' }],
  [`${sessionB}:other`, { canJoin: true, canEdit: true, role: 'COLABORADOR', permission: 'EDICION_COMPLETA' }],
]);
const collaborationRepository: CollaborationRepository = {
  async resolveAccess(sesionId, userId) {
    return access.get(`${sesionId}:${userId}`) ?? { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' };
  },
};

async function fixture() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  setupUMLSocket(io, { jwtSecret: secret, authRepository, collaborationRepository });
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}/uml-session`;
  const clients: ClientSocket[] = [];
  const connect = (userId: string, validSecret = secret) => {
    const socket = clientModule.io(url, { auth: { token: jwt.sign({}, validSecret, { subject: userId, expiresIn: '1h' }) }, transports: ['websocket'] });
    clients.push(socket);
    return socket;
  };
  const close = async () => {
    clients.forEach(client => client.disconnect());
    await new Promise<void>(resolve => io.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  };
  return { connect, close };
}

const waitEvent = <T>(socket: ClientSocket, event: string) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timeout waiting ${event}`)), 1500);
  socket.once(event, (...args) => { clearTimeout(timer); resolve(args[0] as T); });
});
const emitAck = <T>(socket: ClientSocket, event: string, payload: unknown) => new Promise<T>(resolve => socket.emit(event, payload, resolve));

test('rechaza el handshake sin identidad JWT válida', async () => {
  const app = await fixture();
  try {
    const socket = app.connect('editor', 'wrong-secret');
    const error = await waitEvent<{ message: string }>(socket, 'connect_error');
    assert.match(error.message, /autentic/i);
    assert.equal(socket.connected, false);
  } finally { await app.close(); }
});

test('aísla salas, publica presencia autenticada y bloquea escritura de solo lectura', async () => {
  const app = await fixture();
  try {
    const editor = app.connect('editor');
    const reader = app.connect('reader');
    const other = app.connect('other');
    await Promise.all([waitEvent(editor, 'connect'), waitEvent(reader, 'connect'), waitEvent(other, 'connect')]);
    const editorPresence = waitEvent<Array<{ userId: string; name: string; canEdit: boolean }>>(editor, 'presence:list');
    assert.deepEqual(await emitAck(editor, 'session:join', { sesionId: sessionA }), { ok: true });
    assert.deepEqual((await editorPresence).map(user => user.userId), ['editor']);
    const readerPresence = waitEvent<Array<{ userId: string; name: string; canEdit: boolean }>>(reader, 'presence:list');
    assert.deepEqual(await emitAck(reader, 'session:join', { sesionId: sessionA }), { ok: true });
    assert.deepEqual((await readerPresence).map(user => [user.name, user.canEdit]), [['Elena', true], ['Rafael', false]]);
    assert.deepEqual(await emitAck(other, 'session:join', { sesionId: sessionB }), { ok: true });

    const cursorUpdate = waitEvent<{ socketId: string; userId: string; x: number; y: number }>(reader, 'cursor:updated');
    editor.emit('cursor:move', { x: 120, y: 80 });
    const cursor = await cursorUpdate;
    assert.ok(cursor.socketId);
    assert.deepEqual({ userId: cursor.userId, x: cursor.x, y: cursor.y }, { userId: 'editor', x: 120, y: 80 });

    const forbidden = await emitAck<{ ok: boolean; error: { code: string } }>(reader, 'diagram:operation', {
      type: 'class:delete', payload: { classId: 'paciente' }, operationId: 'op-reader',
    });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.error.code, 'READ_ONLY');

    let leaked = false;
    other.once('diagram:applied', () => { leaked = true; });
    const applied = waitEvent<{ operation: { operationId: string; actor: { name: string } } }>(reader, 'diagram:applied');
    const relayStartedAt = performance.now();
    assert.deepEqual(await emitAck(editor, 'diagram:operation', {
      type: 'class:delete', payload: { classId: 'paciente' }, operationId: 'op-editor',
    }), { ok: true });
    const relay = await applied;
    assert.ok(performance.now() - relayStartedAt < 100, 'el relay local debe tardar menos de 100 ms');
    assert.equal(relay.operation.operationId, 'op-editor');
    assert.equal(relay.operation.actor.name, 'Elena');
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(leaked, false);
    const afterDisconnect = waitEvent<Array<{ userId: string }>>(editor, 'presence:list');
    reader.disconnect();
    assert.deepEqual((await afterDisconnect).map(user => user.userId), ['editor']);
  } finally { await app.close(); }
});

test('rechaza operaciones corruptas y notifica last-write-wins sobre el mismo campo', async () => {
  const app = await fixture();
  try {
    const editor = app.connect('editor');
    const second = app.connect('reader');
    await Promise.all([waitEvent(editor, 'connect'), waitEvent(second, 'connect')]);
    assert.deepEqual(await emitAck(editor, 'session:join', { sesionId: sessionA }), { ok: true });
    access.set(`${sessionA}:reader`, { canJoin: true, canEdit: true, role: 'COLABORADOR', permission: 'EDICION_COMPLETA' });
    assert.deepEqual(await emitAck(second, 'session:join', { sesionId: sessionA }), { ok: true });
    const invalid = await emitAck<{ ok: boolean; error: { code: string } }>(editor, 'diagram:operation', {
      type: 'class:move', payload: { classId: '', x: Number.NaN, y: 3 }, operationId: 'bad',
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, 'INVALID_OPERATION');

    assert.deepEqual(await emitAck(editor, 'diagram:operation', {
      type: 'class:update', payload: { classId: 'paciente', updates: { name: 'Paciente' } }, operationId: 'first',
    }), { ok: true });
    const conflict = waitEvent<{ target: string; winner: { userId: string } }>(editor, 'diagram:conflict');
    assert.deepEqual(await emitAck(second, 'diagram:operation', {
      type: 'class:update', payload: { classId: 'paciente', updates: { name: 'Persona' } }, operationId: 'second',
    }), { ok: true });
    assert.equal((await conflict).winner.userId, 'reader');
  } finally {
    access.set(`${sessionA}:reader`, { canJoin: true, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' });
    await app.close();
  }
});
