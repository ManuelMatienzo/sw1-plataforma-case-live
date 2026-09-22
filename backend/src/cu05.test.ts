import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagramService, DiagramRepository, DiagramContext } from './services/diagramaService';
import { UMLDiagramAST } from './models/uml.types';
import express from 'express';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createSesionesRouter } from './routes/sesionesRoutes';
import { errorHandler } from './middlewares/errorHandler';

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const initial: UMLDiagramAST = { version: 1, classes: [], relationships: [] };
const example = { id: 'paciente', name: 'Paciente', isAbstract: false, isInterface: false,
  position: { x: 40, y: 60 }, attributes: [], methods: [] };
function fixture(overrides: Partial<DiagramContext> = {}) {
  let saved: UMLDiagramAST | null = null;
  const context: DiagramContext = { proyectoId: 'project', proyectoNombre: 'Clínica',
    sesionNombre: 'Modelado', estado: 'ABIERTA', proyectoEstado: 'ACTIVO', canRead: true, canEdit: true, ...overrides };
  const repository: DiagramRepository = {
    async run(_id, _user, action) {
      return action(context, {
        async load() { return saved ??= structuredClone(initial); },
        async save(ast) { saved = structuredClone(ast); return saved; },
      });
    },
  };
  return { service: new DiagramService(repository), current: () => saved };
}

test('carga el diagrama vacío del proyecto y guarda una versión nueva sin perder atributos', async () => {
  const { service } = fixture();
  const loaded = await service.get(sessionId, 'user');
  assert.deepEqual(loaded.diagram, initial);
  const cls = { ...example, attributes: [{ id: 'id', name: 'id', type: 'Long', visibility: '-' as const, isPrimaryKey: true }] };
  const result = await service.save(sessionId, 'user', { ...initial, classes: [cls] });
  assert.equal(result.diagram.version, 2);
  assert.deepEqual((await service.get(sessionId, 'user')).diagram.classes, [cls]);
});
test('rechaza acceso ajeno, escritura de solo lectura y sesiones cerradas', async () => {
  await assert.rejects(fixture({ canRead: false }).service.get(sessionId, 'user'), { statusCode: 403 });
  await assert.rejects(fixture({ canEdit: false }).service.save(sessionId, 'user', initial), { statusCode: 403 });
  await assert.rejects(fixture({ estado: 'CERRADA' }).service.save(sessionId, 'user', initial), { statusCode: 409 });
  await assert.rejects(fixture({ proyectoEstado: 'ARCHIVADO' }).service.save(sessionId, 'user', initial), { statusCode: 409 });
});
test('un guardado obsoleto nunca sobrescribe la versión actual', async () => {
  const { service, current } = fixture();
  await service.save(sessionId, 'user', { ...initial, classes: [example] });
  await assert.rejects(service.save(sessionId, 'user', initial), { statusCode: 409, code: 'DIAGRAM_CONFLICT' });
  assert.equal(current()?.classes.length, 1);
});
test('rechaza AST corrupto, IDs duplicados, clases duplicadas y relaciones huérfanas', async () => {
  const { service } = fixture();
  for (const body of [null, { ...initial, version: -1 },
    { ...initial, classes: [{ ...example, position: { x: null, y: 0 } }] },
    { ...initial, classes: [example, { ...example, id: 'otro' }] },
    { ...initial, classes: [example], relationships: [{ id: 'r', sourceClassId: 'paciente', targetClassId: 'missing', type: 'ASSOCIATION' }] },
    { ...initial, classes: [{ ...example, methods: [{ id: 'm', name: 'go', visibility: '+', returnType: 'void', parameters: 'bad' }] }] },
  ]) await assert.rejects(service.save(sessionId, 'user', body), { statusCode: 400 });
});

test('HTTP GET/PUT exige autenticación, carga el proyecto y devuelve conflictos de versión', async () => {
  const secret = 'cu05-local-test-secret';
  const app = express(); app.use(express.json());
  app.use('/api/sesiones', createSesionesRouter({ findSessionUserById: async id => ({ id, nombre: 'Test', email: 'test@example.com', rol: 'ANFITRION', activo: true }) }, secret, fixture().service));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}/api/sesiones/${sessionId}/diagrama`;
  const headers = { Authorization: `Bearer ${jwt.sign({}, secret, { subject: 'user', expiresIn: '1h' })}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers })).status, 200);
    const saved = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ ...initial, classes: [example] }) });
    assert.equal(saved.status, 200);
    const reloaded = await (await fetch(url, { headers })).json() as { data: { diagram: UMLDiagramAST } };
    assert.equal(reloaded.data.diagram.classes[0].name, 'Paciente');
    assert.equal(reloaded.data.diagram.version, 2);
    assert.equal((await fetch(url, { method: 'PUT', headers, body: JSON.stringify(initial) })).status, 409);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
