import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  DataModelGeneratorService,
  mapUmlTypeToSql,
  toSnakeCase,
} from './services/dataModelGeneratorService';
import { UMLDiagramAST } from './models/uml.types';
import { createApp } from './app';

const jwtSecret = 'test_secret_cu11';

test('CU-11: toSnakeCase y mapUmlTypeToSql convierten nombres y tipos estándar según Reglas de Tom', () => {
  assert.equal(toSnakeCase('HistoriaClinica'), 'historia_clinica');
  assert.equal(toSnakeCase('ConsultaMedica'), 'consulta_medica');
  assert.equal(toSnakeCase('ID'), 'id');
  assert.equal(toSnakeCase('fechaNacimiento'), 'fecha_nacimiento');

  assert.equal(mapUmlTypeToSql('String'), 'VARCHAR(255)');
  assert.equal(mapUmlTypeToSql('Text'), 'TEXT');
  assert.equal(mapUmlTypeToSql('Integer'), 'INTEGER');
  assert.equal(mapUmlTypeToSql('Long'), 'BIGINT');
  assert.equal(mapUmlTypeToSql('Double'), 'NUMERIC(15,2)');
  assert.equal(mapUmlTypeToSql('Boolean'), 'BOOLEAN');
  assert.equal(mapUmlTypeToSql('Date'), 'DATE');
  assert.equal(mapUmlTypeToSql('DateTime'), 'TIMESTAMP');
  assert.equal(mapUmlTypeToSql('UUID'), 'UUID');
  assert.equal(mapUmlTypeToSql('byte[]'), 'BYTEA');
});

test('CU-11: Mapeo de Clases a Tablas con surrogate PK (Regla 1 de Tom)', () => {
  const service = new DataModelGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Modelo Pacientes',
    classes: [
      {
        id: 'cls-1',
        name: 'Paciente',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [
          { id: 'a1', name: 'nombreCompleto', type: 'String', visibility: '+' },
          { id: 'a2', name: 'ci', type: 'String', visibility: '+' },
          { id: 'a3', name: 'fechaNacimiento', type: 'Date', visibility: '+' },
        ],
        methods: [],
      },
    ],
    relationships: [],
  };

  const result = service.generateDataModel(diagram);
  assert.equal(result.tables.length, 1);
  const table = result.tables[0];
  assert.equal(table.name, 'paciente');

  // Verifica que se generó la columna id PK surrogate
  const pkCol = table.columns.find(c => c.isPrimaryKey);
  assert.ok(pkCol);
  assert.equal(pkCol.name, 'id');
  assert.equal(pkCol.sqlType, 'BIGSERIAL');

  // Verifica mapeo de atributos
  assert.ok(table.columns.some(c => c.name === 'nombre_completo' && c.sqlType === 'VARCHAR(255)'));
  assert.ok(table.columns.some(c => c.name === 'ci' && c.sqlType === 'VARCHAR(255)' && c.isUnique));
  assert.ok(table.columns.some(c => c.name === 'fecha_nacimiento' && c.sqlType === 'DATE'));
});

test('CU-11: Mapeo de Asociación 1 a N genera FK en la tabla del lado muchos (Regla 3 de Tom)', () => {
  const service = new DataModelGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Ventas',
    classes: [
      {
        id: 'cls-cliente',
        name: 'Cliente',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'nombre', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'cls-pedido',
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
        id: 'rel-1',
        sourceClassId: 'cls-cliente',
        targetClassId: 'cls-pedido',
        type: 'ASSOCIATION',
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
        name: 'realiza',
      },
    ],
  };

  const result = service.generateDataModel(diagram);
  const pedidoTable = result.tables.find(t => t.name === 'pedido');
  assert.ok(pedidoTable);

  const fkCol = pedidoTable.columns.find(c => c.isForeignKey);
  assert.ok(fkCol);
  assert.equal(fkCol.foreignKeyTarget?.tableName, 'cliente');
  assert.equal(fkCol.foreignKeyTarget?.columnName, 'id');

  assert.ok(pedidoTable.foreignKeys.some(f => f.targetTable === 'cliente'));
  assert.ok(pedidoTable.indices.some(i => i.columns.includes(fkCol.name)));
});

test('CU-11: Mapeo de Asociación N a M genera tabla intermedia con PK compuesta (Regla 3 de Tom)', () => {
  const service = new DataModelGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Citas',
    classes: [
      {
        id: 'cls-medico',
        name: 'Medico',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'especialidad', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'cls-paciente',
        name: 'Paciente',
        isAbstract: false,
        isInterface: false,
        position: { x: 200, y: 0 },
        attributes: [{ id: 'a2', name: 'nombre', type: 'String', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [
      {
        id: 'rel-nm',
        sourceClassId: 'cls-medico',
        targetClassId: 'cls-paciente',
        type: 'ASSOCIATION',
        sourceMultiplicity: '0..*',
        targetMultiplicity: '0..*',
        name: 'atiende',
      },
    ],
  };

  const result = service.generateDataModel(diagram);
  assert.equal(result.tables.length, 3); // Medico, Paciente, y junction table

  const junctionTable = result.tables.find(t => t.isJunctionTable);
  assert.ok(junctionTable);
  assert.equal(junctionTable.name, 'medico_paciente');

  const pkCols = junctionTable.columns.filter(c => c.isPrimaryKey);
  assert.equal(pkCols.length, 2); // Clave compuesta
  assert.ok(junctionTable.foreignKeys.length >= 2);
  assert.ok(junctionTable.indices.some(i => i.name.includes('reverse')));
});

test('CU-11: Composición genera FK NOT NULL con ON DELETE CASCADE (Regla 5 de Tom)', () => {
  const service = new DataModelGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Facturacion',
    classes: [
      {
        id: 'cls-factura',
        name: 'Factura',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'numero', type: 'Integer', visibility: '+' }],
        methods: [],
      },
      {
        id: 'cls-item',
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
        id: 'rel-comp',
        sourceClassId: 'cls-factura',
        targetClassId: 'cls-item',
        type: 'COMPOSITION',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
    ],
  };

  const result = service.generateDataModel(diagram);
  const itemTable = result.tables.find(t => t.name === 'item_factura');
  assert.ok(itemTable);

  const fk = itemTable.foreignKeys.find(f => f.targetTable === 'factura');
  assert.ok(fk);
  assert.equal(fk.onDelete, 'CASCADE');

  const fkCol = itemTable.columns.find(c => c.name === fk.columnName);
  assert.ok(fkCol);
  assert.equal(fkCol.isNullable, false); // NOT NULL para composicion estricta
});

test('CU-11: Herencia soporta estrategias TPS, TPH y TPC (Regla 4 de Tom)', () => {
  const service = new DataModelGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Jerarquia Salud',
    classes: [
      {
        id: 'cls-persona',
        name: 'Persona',
        isAbstract: true,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'nombre', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'cls-medico',
        name: 'Medico',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 200 },
        attributes: [{ id: 'a2', name: 'especialidad', type: 'String', visibility: '+' }],
        methods: [],
      },
    ],
    relationships: [
      {
        id: 'rel-inh',
        sourceClassId: 'cls-medico',
        targetClassId: 'cls-persona',
        type: 'INHERITANCE',
      },
    ],
  };

  // 1. TPS: Joined Table (tabla persona + tabla medico con FK id -> persona.id)
  const resTPS = service.generateDataModel(diagram, { inheritanceStrategy: 'TPS' });
  assert.equal(resTPS.tables.length, 2);
  const medicoTps = resTPS.tables.find(t => t.name === 'medico');
  assert.ok(medicoTps?.foreignKeys.some(f => f.targetTable === 'persona' && f.relationshipType === 'INHERITANCE'));

  // 2. TPH: Single Table (tabla persona con columna discriminadora tipo_discriminador)
  const resTPH = service.generateDataModel(diagram, { inheritanceStrategy: 'TPH' });
  assert.equal(resTPH.tables.length, 1);
  const personaTph = resTPH.tables[0];
  assert.ok(personaTph.columns.some(c => c.name === 'tipo_discriminador'));
  assert.ok(personaTph.columns.some(c => c.name === 'especialidad' && c.isNullable));

  // 3. TPC: Concrete Table (medico duplica la columna nombre de persona)
  const resTPC = service.generateDataModel(diagram, { inheritanceStrategy: 'TPC' });
  const medicoTpc = resTPC.tables.find(t => t.name === 'medico');
  assert.ok(medicoTpc?.columns.some(c => c.name === 'nombre'));
  assert.ok(medicoTpc?.columns.some(c => c.name === 'especialidad'));
});

test('CU-11: Auditoría 3FN detecta dependencias transitivas y aprueba esquemas normalizados', () => {
  const service = new DataModelGeneratorService();

  // Esquema normalizado
  const cleanDiagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Modelo Normalizado',
    classes: [
      {
        id: 'c1',
        name: 'Producto',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [
          { id: 'a1', name: 'nombre', type: 'String', visibility: '+' },
          { id: 'a2', name: 'precio', type: 'Double', visibility: '+' },
        ],
        methods: [],
      },
    ],
    relationships: [],
  };
  const cleanRes = service.generateDataModel(cleanDiagram);
  assert.equal(cleanRes.normalizationReport.enForma3FN, true);
  assert.equal(cleanRes.normalizationReport.violations.length, 0);

  // Esquema con dependencia transitiva sospechosa
  const unnormalizedDiagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Modelo Con Dependencia Transitiva',
    classes: [
      {
        id: 'c2',
        name: 'Empleado',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [
          { id: 'a1', name: 'nombre', type: 'String', visibility: '+' },
          { id: 'a2', name: 'departamentoId', type: 'Integer', visibility: '+' },
          { id: 'a3', name: 'departamentoNombre', type: 'String', visibility: '+' },
        ],
        methods: [],
      },
    ],
    relationships: [],
  };
  const unnormRes = service.generateDataModel(unnormalizedDiagram);
  assert.equal(unnormRes.normalizationReport.is3FN, false);
  assert.ok(unnormRes.normalizationReport.violations.some(v => v.level === '3FN'));
});

test('CU-11: Generador Mermaid erDiagram produce sintaxis válida con entidades y relaciones', () => {
  const service = new DataModelGeneratorService();
  const diagram: UMLDiagramAST = {
    version: 1,
    nombre: 'Mermaid Test',
    classes: [
      {
        id: 'c1',
        name: 'Autor',
        isAbstract: false,
        isInterface: false,
        position: { x: 0, y: 0 },
        attributes: [{ id: 'a1', name: 'nombre', type: 'String', visibility: '+' }],
        methods: [],
      },
      {
        id: 'c2',
        name: 'Libro',
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
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
        name: 'escribe',
      },
    ],
  };

  const result = service.generateDataModel(diagram);
  assert.ok(result.mermaidErDiagram.startsWith('erDiagram'));
  assert.ok(result.mermaidErDiagram.includes('AUTOR {'));
  assert.ok(result.mermaidErDiagram.includes('LIBRO {'));
  assert.ok(result.mermaidErDiagram.includes('AUTOR ||--o{ LIBRO'));
});

test('CU-11: Endpoints POST /api/modelo-datos/generar-directo y /api/modelo-datos/generar responden exitosamente', async () => {
  const mockUser = { id: 'u-model-1', nombre: 'Ingeniero Datos', email: 'datos@sw1.edu', rol: 'ANFITRION' as const, activo: true };
  const sessionRepo = {
    findSessionUserById: async (id: string) => (id === mockUser.id ? mockUser : null),
  };
  const app = createApp({
    authService: {} as any,
    adminService: {} as any,
    sessionRepository: sessionRepo,
    jwtSecret,
    corsOrigin: 'http://localhost:5173',
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const sampleDiagram: UMLDiagramAST = {
      version: 1,
      nombre: 'Prueba API',
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
      ],
      relationships: [],
    };

    // 1. Endpoint directo (sin token) -> 200
    const directRes = await fetch(`${baseUrl}/api/modelo-datos/generar-directo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagrama: sampleDiagram, estrategiaHerencia: 'TPS' }),
    });

    assert.equal(directRes.status, 200);
    const directJson = (await directRes.json()) as any;
    assert.ok(directJson.data);
    assert.equal(directJson.data.tables.length, 1);
    assert.equal(directJson.data.tables[0].name, 'cliente');
    assert.ok(directJson.data.mermaidErDiagram);

    // 2. Endpoint protegido sin token -> 401
    const unauthRes = await fetch(`${baseUrl}/api/modelo-datos/generar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagrama: sampleDiagram }),
    });
    assert.equal(unauthRes.status, 401);

    // 3. Endpoint protegido con token -> 200
    const token = jwt.sign({ sub: mockUser.id }, jwtSecret);
    const authRes = await fetch(`${baseUrl}/api/modelo-datos/generar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ diagrama: sampleDiagram, estrategiaHerencia: 'TPH' }),
    });
    assert.equal(authRes.status, 200);
    const authJson = (await authRes.json()) as any;
    assert.equal(authJson.data.inheritanceStrategy, 'TPH');
  } finally {
    server.close();
  }
});
