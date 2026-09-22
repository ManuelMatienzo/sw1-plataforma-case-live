import { beforeEach, expect, it } from 'vitest';
import { useDiagramStore } from './useDiagramStore';
import { subscribeDiagramOperations } from './useDiagramStore';
import type { AppliedDiagramOperation, PresenceUser } from '../types/realtime';
const empty = { version: 1, classes: [], relationships: [] };
const cls = (id: string) => ({ id, name: id, isAbstract: false, isInterface: false,
  attributes: [], methods: [], position: { x: 0, y: 0 } });
beforeEach(() => useDiagramStore.getState().setDiagram(empty));
it('edita clases y miembros por ID estable y elimina las relaciones de una clase borrada', () => {
  const s = useDiagramStore.getState();
  s.addClass(cls('Paciente')); s.addClass(cls('Historia'));
  s.addAttribute('Paciente', { id: 'a', name: 'id', type: 'Long', visibility: '-', isPrimaryKey: true });
  s.updateAttribute('Paciente', 'a', { name: 'pacienteId' });
  s.addMethod('Paciente', { id: 'm', name: 'registrar', returnType: 'void', visibility: '+', parameters: [] });
  s.moveClass('Paciente', 40, 80);
  s.startConnecting('Paciente'); s.finishConnecting('Historia', 'COMPOSITION');
  expect(useDiagramStore.getState().classes[0]).toMatchObject({ position: { x: 40, y: 80 }, attributes: [{ id: 'a', name: 'pacienteId' }] });
  expect(useDiagramStore.getState().relationships).toHaveLength(1);
  s.deleteClass('Paciente');
  expect(useDiagramStore.getState().relationships).toHaveLength(0);
  expect(useDiagramStore.getState().isDirty).toBe(true);
});
it('advierte nombres duplicados sin mutar el diagrama', () => {
  const s = useDiagramStore.getState(); s.addClass(cls('Paciente')); s.addClass(cls('Historia'));
  s.updateClass('Historia', { name: 'Paciente' });
  expect(useDiagramStore.getState().classes[1].name).toBe('Historia');
  expect(useDiagramStore.getState().error).toMatch(/nombre/i);
});
it('conserva cambios hechos durante un guardado y aísla respuestas de otra sesión', () => {
  const s = useDiagramStore.getState(); s.addClass(cls('Paciente'));
  const snapshot = s.beginSave();
  s.moveClass('Paciente', 20, 30);
  s.completeSave(snapshot, 2);
  expect(useDiagramStore.getState().isDirty).toBe(true);
  expect(useDiagramStore.getState().version).toBe(2);
  const old = s.beginSave();
  s.setDiagram({ ...empty, version: 8 });
  s.completeSave(old, 3);
  expect(useDiagramStore.getState().version).toBe(8);
  expect(useDiagramStore.getState().isDirty).toBe(false);
});
it('publica deltas locales y aplica deltas remotos una sola vez sin eco', () => {
  const operations: string[] = [];
  const stop = subscribeDiagramOperations(operation => operations.push(operation.type));
  const s = useDiagramStore.getState();
  s.addClass(cls('Paciente'));
  s.moveClass('Paciente', 25, 35);
  expect(operations).toEqual(['class:add', 'class:move']);
  const remote: AppliedDiagramOperation = {
    type: 'class:update', payload: { classId: 'Paciente', updates: { name: 'Persona' } }, operationId: 'remote-1',
    actor: { userId: 'remote', name: 'Remota', color: '#22D3A0' }, serverSequence: 1, timestamp: new Date().toISOString(),
  };
  s.applyRemoteOperation(remote);
  s.applyRemoteOperation(remote);
  expect(useDiagramStore.getState().classes[0].name).toBe('Persona');
  expect(operations).toEqual(['class:add', 'class:move']);
  expect(useDiagramStore.getState().isDirty).toBe(true);
  stop();
});
it('mantiene presencia y cursores remotos fuera del AST persistente', () => {
  const users: PresenceUser[] = [
    { socketId: 'self', userId: 'me', name: 'Yo', color: '#9DB0FF', role: 'ANFITRION', permission: 'EDICION_COMPLETA', canEdit: true },
    { socketId: 'remote', userId: 'other', name: 'Ana', color: '#22D3A0', role: 'COLABORADOR', permission: 'SOLO_LECTURA', canEdit: false },
  ];
  const s = useDiagramStore.getState();
  s.setPresence(users, 'self');
  s.updateRemoteCursor({ socketId: 'remote', userId: 'other', x: 120, y: 80 });
  expect(useDiagramStore.getState().presenceUsers).toEqual(users);
  expect(useDiagramStore.getState().remoteCursors.remote).toMatchObject({ x: 120, y: 80, name: 'Ana' });
  s.setPresence([users[0]], 'self');
  expect(useDiagramStore.getState().remoteCursors.remote).toBeUndefined();
  expect({ version: s.version, classes: s.classes, relationships: s.relationships }).toEqual(empty);
});
