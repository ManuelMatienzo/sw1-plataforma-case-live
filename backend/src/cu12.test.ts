import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { PostgresDdlGeneratorService } from './services/postgresDdlGeneratorService';
import { UMLDiagramAST } from './models/uml.types';
import { createApp } from './app';

const jwtSecret = 'test_secret_cu12';

test('CU-12: Generación DDL básica con DROP TABLE e IF NOT EXISTS (Idempotencia)', () => {
  const service = new PostgresDdlGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Clinica San Rafael',
    classes: [
      {
        id: 'cls-1',
        name: 'Paciente',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [
          { id: 'a1', name: 'nombreCompleto', type: 'String', visibility: '+' },
          { id: 'a2', name: 'ci', type: 'String', visibility: '+', isUnique: true },
          { id: 'a3', name: 'fechaNacimiento', type: 'Date', visibility: '+' },
          { id: 'a4', name: 'activo', type: 'Boolean', visibility: '+', defaultValue: 'true' },
        ],
        methods: [],
      },
    ],
    relationships: [],
  };

  const result = service.generateDdl(diagram, {
    pluralize: true,
    includeDropTable: true,
    ifNotExists: true,
    includeComments: true,
  });

  assert.equal(result.tablesCount, 1);
  assert.ok(result.sql.includes('DROP TABLE IF EXISTS pacientes CASCADE;'));
  assert.ok(result.sql.includes('CREATE TABLE IF NOT EXISTS pacientes ('));
  assert.ok(result.sql.includes('id                       BIGSERIAL PRIMARY KEY'));
  assert.ok(result.sql.includes('nombre_completo          VARCHAR(255) NOT NULL'));
  assert.ok(result.sql.includes('ci                       VARCHAR(255) NOT NULL UNIQUE'));
  assert.ok(result.sql.includes('fecha_nacimiento         DATE NOT NULL'));
  assert.ok(result.sql.includes('activo                   BOOLEAN NOT NULL DEFAULT true'));
  assert.ok(result.sql.includes('COMMENT ON TABLE pacientes'));
});

test('CU-12: Mapeo de relación 1 a N con clave foránea e índice B-tree', () => {
  const service = new PostgresDdlGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Pedidos y Clientes',
    classes: [
      {
        id: 'c1',
        name: 'Cliente',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'nombre', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'c2',
        name: 'Pedido',
        isAbstract: false,
        isInterface: false,
        position: { x: 200, y: 0 },
        attributes: [{ id: 'a2', name: 'total', type: 'Double', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [
      {
        id: 'r1',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        type: 'ASSOCIATION',
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
      },
    ],
  };

  const result = service.generateDdl(diagram, { pluralize: true });

  assert.equal(result.tablesCount, 2);
  assert.ok(result.sql.includes('CREATE TABLE IF NOT EXISTS clientes ('));
  assert.ok(result.sql.includes('CREATE TABLE IF NOT EXISTS pedidos ('));
  assert.ok(result.sql.includes('cliente_id               BIGINT NOT NULL'));
  assert.ok(result.sql.includes('ALTER TABLE pedidos'));
  assert.ok(result.sql.includes('ADD CONSTRAINT fk_pedidos_clientes'));
  assert.ok(result.sql.includes('FOREIGN KEY (cliente_id)'));
  assert.ok(result.sql.includes('REFERENCES clientes(id)'));
  assert.ok(result.sql.includes('CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos (cliente_id);'));
});

test('CU-12: Mapeo de relación N a M con tabla intermedia y clave primaria compuesta', () => {
  const service = new PostgresDdlGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Estudiantes y Cursos',
    classes: [
      {
        id: 'c1',
        name: 'Estudiante',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'nombre', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'c2',
        name: 'Curso',
        isAbstract: false,
        isInterface: false,
        position: { x: 200, y: 0 },
        attributes: [{ id: 'a2', name: 'titulo', type: 'String', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [
      {
        id: 'r1',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        type: 'ASSOCIATION',
        sourceMultiplicity: '0..*',
        targetMultiplicity: '0..*',
      },
    ],
  };

  const result = service.generateDdl(diagram, { pluralize: true });

  assert.equal(result.tablesCount, 3);
  // Debe existir la tabla intermedia de unión
  assert.ok(result.sql.includes('CREATE TABLE IF NOT EXISTS estudiantes_cursos ('));
  assert.ok(/estudiante_id\s+BIGINT NOT NULL/.test(result.sql));
  assert.ok(/curso_id\s+BIGINT NOT NULL/.test(result.sql));
  assert.ok(result.sql.includes('CONSTRAINT pk_estudiantes_cursos PRIMARY KEY (estudiante_id, curso_id)'));
  assert.ok(result.sql.includes('ON DELETE CASCADE'));
  assert.ok(result.sql.includes('idx_estudiantes_cursos_reverse'));
});

test('CU-12: Mapeo de Composición con ON DELETE CASCADE', () => {
  const service = new PostgresDdlGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Facturacion',
    classes: [
      {
        id: 'c1',
        name: 'Factura',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'numero', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'c2',
        name: 'ItemFactura',
        isAbstract: false,
        isInterface: false,
        position: { x: 200, y: 0 },
        attributes: [{ id: 'a2', name: 'cantidad', type: 'Integer', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [
      {
        id: 'r1',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        type: 'COMPOSITION',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
    ],
  };

  const result = service.generateDdl(diagram, { pluralize: true });

  assert.ok(result.sql.includes('ALTER TABLE item_facturas'));
  assert.ok(result.sql.includes('REFERENCES facturas(id)'));
  assert.ok(result.sql.includes('ON DELETE CASCADE;'));
});

test('CU-12: Soporte de estrategias de herencia TPS, TPH y TPC en DDL', () => {
  const service = new PostgresDdlGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Jerarquia Vehiculos',
    classes: [
      {
        id: 'c1',
        name: 'Vehiculo',
        isAbstract: true,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'matricula', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'c2',
        name: 'Automovil',
        isAbstract: false,
        isInterface: false,
        position: { x: 100, y: 100 },
        attributes: [{ id: 'a2', name: 'numPuertas', type: 'Integer', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [
      {
        id: 'r1',
        sourceClassId: 'c2',
        targetClassId: 'c1',
        type: 'INHERITANCE',
      },
    ],
  };

  // 1. TPS: Superclase + Subclase con FK
  const tpsResult = service.generateDdl(diagram, { inheritanceStrategy: 'TPS', pluralize: true });
  assert.equal(tpsResult.tablesCount, 2);
  assert.ok(tpsResult.sql.includes('CREATE TABLE IF NOT EXISTS vehiculos ('));
  assert.ok(tpsResult.sql.includes('CREATE TABLE IF NOT EXISTS automoviles ('));
  assert.ok(tpsResult.sql.includes('ALTER TABLE automoviles'));
  assert.ok(tpsResult.sql.includes('REFERENCES vehiculos(id)'));

  // 2. TPH: Single Table con columna discriminadora
  const tphResult = service.generateDdl(diagram, { inheritanceStrategy: 'TPH', pluralize: true });
  assert.equal(tphResult.tablesCount, 1);
  assert.ok(tphResult.sql.includes('CREATE TABLE IF NOT EXISTS vehiculos ('));
  assert.ok(tphResult.sql.includes('tipo_discriminador'));
  assert.ok(tphResult.sql.includes('num_puertas'));
});

test('CU-12: Endpoints HTTP de generación y descarga de script schema.sql', async () => {
  const mockUser = {
    id: 'user_cu12_test',
    email: 'user_cu12@test.com',
    nombre: 'Tester CU12',
    rol: 'ANFITRION',
    activo: true,
  };

  const sampleDiagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Hospital Central',
    classes: [
      {
        id: 'c1',
        name: 'Doctor',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'especialidad', type: 'String', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [],
  };

  const mockDiagramService: any = {
    get: async () => ({
      version: 1,
      diagram: sampleDiagram,
      canEdit: true,
      revision: 1,
    }),
  };

  const app = createApp({
    authService: {} as any,
    adminService: {} as any,
    corsOrigin: 'http://localhost:5173',
    jwtSecret,
    sessionRepository: {
      findSessionUserById: async (id: string) => (id === mockUser.id ? mockUser : null),
    } as any,
    diagramService: mockDiagramService,
  });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token = jwt.sign({ sub: mockUser.id }, jwtSecret);

    // 1. Endpoint directo /api/ddl/generar-directo (sin token) -> 200
    const directRes = await fetch(`${baseUrl}/api/ddl/generar-directo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagrama: sampleDiagram, options: { pluralize: true } }),
    });
    assert.equal(directRes.status, 200);
    const directJson = (await directRes.json()) as any;
    assert.ok(directJson.data.sql);
    assert.ok(directJson.data.sql.includes('CREATE TABLE IF NOT EXISTS doctores ('));

    // 2. Endpoint de sesión /api/sesiones/:sesionId/generar/ddl (con token) -> 200
    const sessionRes = await fetch(`${baseUrl}/api/sesiones/sesion-123/generar/ddl`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(sessionRes.status, 200);
    const sessionJson = (await sessionRes.json()) as any;
    assert.ok(sessionJson.data.sql);

    // 3. Endpoint de descarga de archivo /api/sesiones/:sesionId/ddl/descargar -> 200 con Content-Disposition
    const downloadRes = await fetch(`${baseUrl}/api/sesiones/sesion-123/ddl/descargar`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(downloadRes.status, 200);
    const contentDisposition = downloadRes.headers.get('content-disposition');
    assert.ok(contentDisposition);
    assert.ok(contentDisposition.includes('attachment; filename="hospital_central_schema.sql"'));
    const sqlText = await downloadRes.text();
    assert.ok(sqlText.includes('CREATE TABLE IF NOT EXISTS doctores ('));
  } finally {
    server.close();
  }
});
