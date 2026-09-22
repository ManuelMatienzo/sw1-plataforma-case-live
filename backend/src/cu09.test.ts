import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createApp } from './app';
import { UMLDiagramAST } from './models/uml.types';
import { DiagramRepository } from './services/diagramaService';
import { AppError } from './errors/AppError';
import { mergeUmlDiagrams, parseXmi, serializeXmi, XmiSessionService } from './services/xmiService';
import { AuthService } from './services/authService';
import { AdminService } from './services/adminService';
import { AuthSessionRepository } from './middlewares/auth';
import { CollaborationRepository, setupUMLSocket } from './sockets/umlSocket';

const completeDiagram: UMLDiagramAST = {
  version: 7,
  nombre: 'Clínica & Turnos',
  classes: [
    {
      id: 'class-patient',
      name: 'Paciente',
      isAbstract: false,
      isInterface: false,
      position: { x: 80, y: 120 },
      attributes: [
        { id: 'attr-id', name: 'id', type: 'Long', visibility: '-', isPrimaryKey: true },
        { id: 'attr-name', name: 'nombre', type: 'String', visibility: '-' },
      ],
      methods: [
        {
          id: 'method-find',
          name: 'buscar',
          returnType: 'Paciente',
          visibility: '+',
          parameters: [{ name: 'id', type: 'Long' }],
        },
      ],
    },
    {
      id: 'interface-auditable',
      name: 'Auditable',
      isAbstract: false,
      isInterface: true,
      position: { x: 440, y: 120 },
      attributes: [],
      methods: [],
    },
  ],
  relationships: [
    {
      id: 'rel-realization',
      sourceClassId: 'class-patient',
      targetClassId: 'interface-auditable',
      type: 'REALIZATION',
      name: 'implementa',
    },
  ],
};

test('serializa un modelo XMI 2.1 compatible y conserva layout de Enterprise Architect', () => {
  const xml = serializeXmi(completeDiagram, 'Clínica & Turnos');

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /xmlns:xmi="http:\/\/schema\.omg\.org\/spec\/XMI\/2\.1"/);
  assert.match(xml, /xmi:type="uml:Interface"/);
  assert.match(xml, /name="Clínica &amp; Turnos"/);
  assert.match(xml, /<ownedOperation[^>]+name="buscar"/);
  assert.match(xml, /<interfaceRealization[^>]+contract="interface-auditable"/);
  assert.match(xml, /Left=80;Top=120/);
  assert.match(xml, /subject="class-patient"/);
});

test('hace round-trip de clases, métodos, relaciones y coordenadas sin perder estructura', () => {
  const parsed = parseXmi(serializeXmi(completeDiagram));

  assert.equal(parsed.diagram.classes.length, 2);
  assert.deepEqual(parsed.diagram.classes[0].position, { x: 80, y: 120 });
  assert.deepEqual(parsed.diagram.classes[0].methods[0].parameters, [{ name: 'id', type: 'Long' }]);
  assert.equal(parsed.diagram.relationships[0].type, 'REALIZATION');
  assert.equal(parsed.diagram.relationships[0].sourceClassId, 'class-patient');
  assert.equal(parsed.diagram.relationships[0].targetClassId, 'interface-auditable');
  assert.equal(parsed.warnings.length, 0);
  assert.deepEqual(parsed.summary, { classes: 1, interfaces: 1, attributes: 2, methods: 1, relationships: 1 });
});

test('acepta XMI 2.5 externo, normaliza tipos propietarios y aplica layout automático', () => {
  const external = `<?xml version="1.0" encoding="UTF-8"?>
  <xmi:XMI xmi:version="2.5.1" xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001">
    <uml:Model xmi:id="model" name="Facturación">
      <packagedElement xmi:type="uml:Class" xmi:id="invoice" name="Factura">
        <ownedAttribute xmi:type="uml:Property" xmi:id="total" name="total" visibility="private">
          <type xmi:type="uml:PrimitiveType" href="pathmap://UML_LIBRARIES/JavaPrimitiveTypes.library.uml#varchar" />
        </ownedAttribute>
      </packagedElement>
      <packagedElement xmi:type="uml:Class" xmi:id="customer" name="Cliente" />
      <packagedElement xmi:type="uml:Dependency" xmi:id="uses" client="invoice" supplier="customer" name="usa" />
      </uml:Model>
  </xmi:XMI>`;

  const parsed = parseXmi(external);

  assert.equal(parsed.diagram.classes[0].attributes[0].type, 'String');
  assert.deepEqual(parsed.diagram.classes.map(item => item.position), [{ x: 48, y: 48 }, { x: 328, y: 48 }]);
  assert.equal(parsed.diagram.relationships[0].type, 'DEPENDENCY');
  assert.match(parsed.warnings.join(' '), /varchar.*String/i);
});

test('rechaza XML malformado, entidades externas y documentos sin modelo UML', () => {
  assert.throws(() => parseXmi('<xmi:XMI><uml:Model></xmi:XMI>'), /XML.*inválido/i);
  assert.throws(() => parseXmi('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><xmi:XMI/>'), /DOCTYPE|entidades/i);
  assert.throws(() => parseXmi('<?xml version="1.0"?><root />'), /modelo UML/i);
});

test('fusiona por nombre conservando IDs existentes y evitando miembros duplicados', () => {
  const current: UMLDiagramAST = {
    version: 4,
    classes: [{
      id: 'existing-patient', name: 'Paciente', isAbstract: false, isInterface: false,
      position: { x: 20, y: 30 },
      attributes: [{ id: 'existing-id', name: 'id', type: 'Long', visibility: '-' }], methods: [],
    }],
    relationships: [],
  };
  const imported: UMLDiagramAST = {
    version: 1,
    classes: [
      {
        id: 'imported-patient', name: 'paciente', isAbstract: false, isInterface: false,
        position: { x: 400, y: 300 },
        attributes: [
          { id: 'duplicate-id', name: 'ID', type: 'Long', visibility: '-' },
          { id: 'new-name', name: 'nombre', type: 'String', visibility: '-' },
        ],
        methods: [],
      },
      { id: 'doctor', name: 'Doctor', isAbstract: false, isInterface: false, position: { x: 680, y: 300 }, attributes: [], methods: [] },
    ],
    relationships: [{ id: 'patient-doctor', sourceClassId: 'imported-patient', targetClassId: 'doctor', type: 'ASSOCIATION' }],
  };

  const merged = mergeUmlDiagrams(current, imported);

  assert.equal(merged.classes.length, 2);
  assert.equal(merged.classes[0].id, 'existing-patient');
  assert.deepEqual(merged.classes[0].position, { x: 20, y: 30 });
  assert.deepEqual(merged.classes[0].attributes.map(item => item.name), ['id', 'nombre']);
  assert.equal(merged.relationships[0].sourceClassId, 'existing-patient');
  assert.equal(merged.relationships[0].targetClassId, 'doctor');
});

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hostId = '11111111-1111-4111-8111-111111111111';
const collaboratorId = '22222222-2222-4222-8222-222222222222';
const secret = 'cu09-test-secret-long-enough';

const sessionFixture = () => {
  let stored = structuredClone(completeDiagram);
  const repository: DiagramRepository = {
    async run(_sessionId, userId, action) {
      return action({
        proyectoId: 'project-1', proyectoNombre: 'Clínica Central', sesionNombre: 'Modelo principal',
        estado: 'ABIERTA', proyectoEstado: 'ACTIVO', canRead: true, canEdit: true,
        isHost: userId === hostId,
      }, {
        load: async () => structuredClone(stored),
        save: async diagram => { stored = structuredClone(diagram); return structuredClone(stored); },
      });
    },
  };
  return { repository, getStored: () => stored };
};

test('el servicio de sesión exporta solo para el anfitrión con nombre de archivo seguro', async () => {
  const fixture = sessionFixture();
  const service = new XmiSessionService(fixture.repository);

  const exported = await service.export(sessionId, hostId);

  assert.match(exported.xml, /<uml:Model/);
  assert.equal(exported.filename, 'clinica-central.xmi');
  await assert.rejects(
    () => service.export(sessionId, collaboratorId),
    (error: unknown) => error instanceof AppError && error.statusCode === 403 && error.code === 'ONLY_HOST_ALLOWED',
  );
});

test('importa, valida, incrementa versión y publica el reemplazo después de guardar', async () => {
  const fixture = sessionFixture();
  const service = new XmiSessionService(fixture.repository);
  const events: Array<{ sessionId: string; diagram: UMLDiagramAST }> = [];
  service.subscribe(event => events.push(event));
  const imported: UMLDiagramAST = {
    version: 1,
    classes: [{ id: 'appointment', name: 'Cita', isAbstract: false, isInterface: false, position: { x: 48, y: 48 }, attributes: [], methods: [] }],
    relationships: [],
  };

  const result = await service.import(sessionId, hostId, {
    content: serializeXmi(imported, 'Agenda'), strategy: 'replace', expectedVersion: 7,
  });

  assert.equal(result.diagram.version, 8);
  assert.deepEqual(result.diagram.classes.map(cls => cls.name), ['Cita']);
  assert.equal(result.validationReport.warningsCount, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].diagram.version, 8);
  assert.deepEqual(fixture.getStored(), result.diagram);
});

test('bloquea importación ajena, sesiones cerradas y versiones obsoletas sin publicar eventos', async () => {
  const fixture = sessionFixture();
  const service = new XmiSessionService(fixture.repository);
  let events = 0;
  service.subscribe(() => { events += 1; });
  const input = { content: serializeXmi(completeDiagram), strategy: 'merge' as const, expectedVersion: 6 };

  await assert.rejects(
    () => service.import(sessionId, collaboratorId, input),
    (error: unknown) => error instanceof AppError && error.statusCode === 403 && error.code === 'ONLY_HOST_ALLOWED',
  );
  await assert.rejects(
    () => service.import(sessionId, hostId, input),
    (error: unknown) => error instanceof AppError && error.statusCode === 409 && error.code === 'DIAGRAM_CONFLICT',
  );
  assert.equal(events, 0);
});

const authServices = () => {
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
  return { authService, adminService, sessionRepository };
};

test('expone exportación XML e importación JSON autenticadas en las rutas de sesión', async () => {
  const fixture = sessionFixture();
  const xmiService = new XmiSessionService(fixture.repository);
  const auth = authServices();
  const app = createApp({ ...auth, jwtSecret: secret, corsOrigin: 'http://localhost:5173', xmiService });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de prueba sin puerto');
  const baseUrl = `http://127.0.0.1:${address.port}/api/sesiones/${sessionId}/xmi`;
  const token = (id: string) => jwt.sign({}, secret, { subject: id, expiresIn: '1h' });

  try {
    const exported = await fetch(`${baseUrl}/exportar`, { headers: { Authorization: `Bearer ${token(hostId)}` } });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type') ?? '', /application\/xml/);
    assert.match(exported.headers.get('content-disposition') ?? '', /clinica-central\.xmi/);
    assert.match(await exported.text(), /<uml:Model/);

    const forbidden = await fetch(`${baseUrl}/exportar`, { headers: { Authorization: `Bearer ${token(collaboratorId)}` } });
    assert.equal(forbidden.status, 403);

    const incoming: UMLDiagramAST = {
      version: 1,
      classes: [{ id: 'invoice', name: 'Factura', isAbstract: false, isInterface: false, position: { x: 48, y: 48 }, attributes: [], methods: [] }],
      relationships: [],
    };
    const imported = await fetch(`${baseUrl}/importar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(hostId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: serializeXmi(incoming), strategy: 'replace', expectedVersion: 7 }),
    });
    assert.equal(imported.status, 200);
    const payload = await imported.json() as { data: { diagram: UMLDiagramAST } };
    assert.equal(payload.data.diagram.version, 8);
    assert.equal(payload.data.diagram.classes[0].name, 'Factura');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

interface ClientSocket {
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

test('difunde por Socket.IO el diagrama importado a los miembros conectados', async () => {
  const fixture = sessionFixture();
  const xmiService = new XmiSessionService(fixture.repository);
  const auth = authServices();
  const collaborationRepository: CollaborationRepository = {
    resolveAccess: async () => ({ canJoin: true, canEdit: true, role: 'COLABORADOR', permission: 'EDICION_COMPLETA' }),
  };
  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  setupUMLSocket(io, { jwtSecret: secret, authRepository: auth.sessionRepository, collaborationRepository, xmiService });
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Servidor Socket.IO sin puerto');
  const client = clientModule.io(`http://127.0.0.1:${address.port}/uml-session`, {
    auth: { token: jwt.sign({}, secret, { subject: collaboratorId, expiresIn: '1h' }) }, transports: ['websocket'],
  });

  try {
    await waitEvent(client, 'connect');
    assert.deepEqual(await emitAck(client, 'session:join', { sesionId: sessionId }), { ok: true });
    const replacement = waitEvent<{ diagram: UMLDiagramAST }>(client, 'diagram:replaced');
    await xmiService.import(sessionId, hostId, {
      content: serializeXmi({ version: 1, classes: [], relationships: [] }),
      strategy: 'replace', expectedVersion: 7,
    });
    assert.equal((await replacement).diagram.version, 8);
  } finally {
    client.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});
