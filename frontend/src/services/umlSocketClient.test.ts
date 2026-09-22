import { afterEach, expect, it, vi } from 'vitest';
import { createUmlSocketClient, RealtimeTransport } from './umlSocketClient';
import type { DiagramOperation } from '../types/realtime';

class FakeTransport implements RealtimeTransport {
  id = 'self-socket';
  connected = false;
  sent: Array<{ event: string; payload: unknown }> = [];
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  on(event: string, listener: (...args: unknown[]) => void) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this; }
  emit(event: string, payload: unknown, ack?: (result: unknown) => void) { this.sent.push({ event, payload }); ack?.({ ok: true }); return this; }
  connect() { this.connected = true; this.trigger('connect'); return this; }
  disconnect() { this.connected = false; this.trigger('disconnect', 'client disconnect'); return this; }
  trigger(event: string, ...args: unknown[]) { this.listeners.get(event)?.forEach(listener => listener(...args)); }
}

afterEach(() => vi.useRealTimers());
it('se une con el token, aplica eventos remotos y deja de escuchar al desconectar', () => {
  const transport = new FakeTransport();
  const applied: string[] = []; const presence: number[] = []; const statuses: string[] = [];
  const client = createUmlSocketClient({
    token: 'jwt', sessionId: 'session', transportFactory: () => transport,
    onOperation: operation => applied.push(operation.operationId),
    onPresence: users => presence.push(users.length),
    onStatus: status => statuses.push(status),
  });
  client.connect();
  expect(transport.sent[0]).toEqual({ event: 'session:join', payload: { sesionId: 'session' } });
  transport.trigger('presence:list', []);
  transport.trigger('diagram:applied', { operation: { operationId: 'remote' } });
  expect(presence).toEqual([0]);
  expect(applied).toEqual(['remote']);
  expect(statuses).toContain('online');
  client.disconnect();
  expect(statuses.at(-1)).toBe('offline');
});
it('limita cursores a 30 ms, conserva la posición más reciente y publica operaciones completas', () => {
  vi.useFakeTimers();
  const transport = new FakeTransport();
  const client = createUmlSocketClient({ token: 'jwt', sessionId: 'session', transportFactory: () => transport });
  client.connect(); transport.sent.length = 0;
  client.moveCursor(1, 2); client.moveCursor(3, 4); client.moveCursor(5, 6);
  expect(transport.sent).toEqual([{ event: 'cursor:move', payload: { x: 1, y: 2 } }]);
  vi.advanceTimersByTime(30);
  expect(transport.sent.at(-1)).toEqual({ event: 'cursor:move', payload: { x: 5, y: 6 } });
  const operation: DiagramOperation = { type: 'class:delete', payload: { classId: 'patient' }, operationId: 'local' };
  client.emitOperation(operation);
  expect(transport.sent.at(-1)).toEqual({ event: 'diagram:operation', payload: operation });
  client.disconnect();
});
it('expone errores de unión y de permisos con un mensaje accionable', () => {
  const transport = new FakeTransport();
  transport.emit = function (event, payload, ack) {
    this.sent.push({ event, payload });
    ack?.(event === 'session:join' ? { ok: true } : { ok: false, error: { code: 'READ_ONLY', message: 'Tu permiso es de solo lectura' } });
    return this;
  };
  const errors: string[] = [];
  const client = createUmlSocketClient({ token: 'jwt', sessionId: 'session', transportFactory: () => transport, onError: error => errors.push(error.message) });
  client.connect();
  client.emitOperation({ type: 'class:delete', payload: { classId: 'patient' }, operationId: 'local' });
  expect(errors).toEqual(['Tu permiso es de solo lectura']);
});
it('retiene cambios hechos durante la conexión y los envía después de unirse a la sala', () => {
  const transport = new FakeTransport();
  let joinAck: ((result: unknown) => void) | undefined;
  transport.emit = function (event, payload, callback) {
    this.sent.push({ event, payload });
    if (event === 'session:join') joinAck = callback;
    else callback?.({ ok: true });
    return this;
  };
  const client = createUmlSocketClient({ token: 'jwt', sessionId: 'session', transportFactory: () => transport });
  client.connect();
  client.emitOperation({ type: 'class:delete', payload: { classId: 'patient' }, operationId: 'queued' });
  expect(transport.sent.map(item => item.event)).toEqual(['session:join']);
  joinAck?.({ ok: true });
  expect(transport.sent.map(item => item.event)).toEqual(['session:join', 'diagram:operation']);
});
it('no anuncia estado en línea cuando el servidor rechaza la unión a la sesión', () => {
  const transport = new FakeTransport();
  transport.emit = function (event, payload, callback) {
    this.sent.push({ event, payload });
    callback?.({ ok: false, error: { code: 'FORBIDDEN', message: 'No perteneces a la sesión' } });
    return this;
  };
  const statuses: string[] = [];
  const client = createUmlSocketClient({ token: 'jwt', sessionId: 'session', transportFactory: () => transport, onStatus: status => statuses.push(status) });
  client.connect();
  expect(statuses.at(-1)).toBe('offline');
});

it('administra participantes y entrega cambios de permiso o expulsión al usuario afectado', () => {
  const transport = new FakeTransport();
  const permissions: string[] = [];
  const kicks: string[] = [];
  const acknowledgements: boolean[] = [];
  const client = createUmlSocketClient({
    token: 'jwt', sessionId: 'session', transportFactory: () => transport,
    onPermissionUpdated: event => permissions.push(`${event.userId}:${event.permission}:${event.canEdit}`),
    onKicked: event => kicks.push(event.message),
  });
  client.connect();
  transport.sent.length = 0;

  client.setParticipantPermission('user-2', 'SOLO_LECTURA', ok => acknowledgements.push(ok));
  client.kickParticipant('user-2', ok => acknowledgements.push(ok));
  transport.trigger('session:permission-updated', { userId: 'user-2', permission: 'SOLO_LECTURA', canEdit: false });
  transport.trigger('session:kicked', { message: 'Has sido removido de la sesión por el anfitrión.' });

  expect(transport.sent).toEqual([
    { event: 'participant:set-permission', payload: { targetUserId: 'user-2', permission: 'SOLO_LECTURA' } },
    { event: 'participant:kick', payload: { targetUserId: 'user-2' } },
  ]);
  expect(acknowledgements).toEqual([true, true]);
  expect(permissions).toEqual(['user-2:SOLO_LECTURA:false']);
  expect(kicks).toEqual(['Has sido removido de la sesión por el anfitrión.']);
});

it('entrega un reemplazo XMI completo para actualizar el lienzo de forma atómica', () => {
  const transport = new FakeTransport();
  const versions: number[] = [];
  const client = createUmlSocketClient({
    token: 'jwt', sessionId: 'session', transportFactory: () => transport,
    onDiagramReplaced: event => versions.push(event.diagram.version),
  });
  client.connect();
  transport.trigger('diagram:replaced', {
    diagram: { version: 8, classes: [], relationships: [] },
    summary: { classes: 0, interfaces: 0, attributes: 0, methods: 0, relationships: 0 },
    warnings: [],
    validationReport: { isValid: true, criticalErrorsCount: 0, warningsCount: 0, diagnostics: [], validatedAt: new Date().toISOString() },
  });
  expect(versions).toEqual([8]);
});
