import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUmlDiagram } from './services/umlValidator';
import { UMLDiagramAST, UMLMultiplicity } from './models/uml.types';
import { createValidationController } from './controllers/validationController';
import { Request, Response } from 'express';

test('CU-08: valida exitosamente un modelo UML 2.5+ bien estructurado', () => {
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      {
        id: 'cls-1',
        name: 'Persona',
        isAbstract: true,
        isInterface: false,
        attributes: [{ id: 'a1', name: 'id', type: 'Integer', visibility: '+' }],
        methods: [],
        position: { x: 100, y: 100 },
      },
      {
        id: 'cls-2',
        name: 'Paciente',
        isAbstract: false,
        isInterface: false,
        attributes: [{ id: 'a2', name: 'nss', type: 'String', visibility: '+' }],
        methods: [],
        position: { x: 300, y: 100 },
      },
    ],
    relationships: [
      {
        id: 'rel-1',
        sourceClassId: 'cls-2',
        targetClassId: 'cls-1',
        type: 'INHERITANCE',
      },
    ],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, true);
  assert.equal(report.criticalErrorsCount, 0);
});

test('CU-08 VAL-CLS-01 y VAL-CLS-02: detecta nombres duplicados, vacíos y palabras reservadas', () => {
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      {
        id: 'c1',
        name: 'Usuario',
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 0, y: 0 },
      },
      {
        id: 'c2',
        name: 'usuario', // duplicado case-insensitive
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 0, y: 0 },
      },
      {
        id: 'c3',
        name: '', // vacío
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 0, y: 0 },
      },
      {
        id: 'c4',
        name: 'Select', // palabra reservada SQL
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 0, y: 0 },
      },
    ],
    relationships: [],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, false);

  const codes = report.diagnostics.map(d => d.code);
  assert.ok(codes.includes('VAL-CLS-01'), 'Debe detectar duplicados de clases');
  assert.ok(codes.includes('VAL-CLS-02'), 'Debe detectar nombres vacíos y palabras reservadas');
});

test('CU-08 VAL-CLS-04: detecta interfaces con atributos de estado mutables', () => {
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      {
        id: 'int-1',
        name: 'Repositorio',
        isAbstract: false,
        isInterface: true,
        attributes: [{ id: 'a1', name: 'estado', type: 'String', visibility: '+' }],
        methods: [],
        position: { x: 0, y: 0 },
      },
    ],
    relationships: [],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, false);
  const diag = report.diagnostics.find(d => d.code === 'VAL-CLS-04');
  assert.ok(diag, 'Debe emitir VAL-CLS-04 para interfaces con atributos');
  assert.equal(diag.severity, 'ERROR');
});

test('CU-08 VAL-ATR-01 y VAL-ATR-02: detecta atributos duplicados y tipos de datos inválidos', () => {
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      {
        id: 'c1',
        name: 'Producto',
        isAbstract: false,
        isInterface: false,
        attributes: [
          { id: 'a1', name: 'precio', type: 'Double', visibility: '+' },
          { id: 'a2', name: 'precio', type: 'Double', visibility: '+' }, // duplicado
          { id: 'a3', name: 'codigo', type: 'TipoInexistenteXYZ', visibility: '+' }, // tipo inválido
        ],
        methods: [],
        position: { x: 0, y: 0 },
      },
    ],
    relationships: [],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, false);
  const codes = report.diagnostics.map(d => d.code);
  assert.ok(codes.includes('VAL-ATR-01'), 'Debe detectar atributos duplicados');
  assert.ok(codes.includes('VAL-ATR-02'), 'Debe detectar tipos desconocidos');
});

test('CU-08 VAL-REL-01, VAL-REL-02 y VAL-REL-03: valida extremos, multiplicidades y composición', () => {
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      {
        id: 'c1',
        name: 'Factura',
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 0, y: 0 },
      },
      {
        id: 'c2',
        name: 'Detalle',
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 0, y: 0 },
      },
    ],
    relationships: [
      {
        id: 'r1',
        sourceClassId: 'c1',
        targetClassId: 'clase-fantasma', // huérfana
        type: 'ASSOCIATION',
      },
      {
        id: 'r2',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        type: 'COMPOSITION',
        sourceMultiplicity: '*', // inválido en composición
        targetMultiplicity: '1..*',
      },
      {
        id: 'r3',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        type: 'ASSOCIATION',
        sourceMultiplicity: 'rango-invalido' as unknown as UMLMultiplicity, // formato inválido
      },
    ],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, false);
  const codes = report.diagnostics.map(d => d.code);
  assert.ok(codes.includes('VAL-REL-01'), 'Debe detectar relaciones huérfanas');
  assert.ok(codes.includes('VAL-REL-02'), 'Debe detectar multiplicidades inválidas');
  assert.ok(codes.includes('VAL-REL-03'), 'Debe rechazar composición con multiplicidad múltiple en contenedor');
});

test('CU-08 VAL-GEN-01: detecta ciclos de herencia mediante algoritmo DFS', () => {
  // Ciclo A -> B -> C -> A
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      { id: 'A', name: 'ClaseA', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      { id: 'B', name: 'ClaseB', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      { id: 'C', name: 'ClaseC', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
    ],
    relationships: [
      { id: 'r1', sourceClassId: 'A', targetClassId: 'B', type: 'INHERITANCE' },
      { id: 'r2', sourceClassId: 'B', targetClassId: 'C', type: 'INHERITANCE' },
      { id: 'r3', sourceClassId: 'C', targetClassId: 'A', type: 'INHERITANCE' }, // Cierra el ciclo
    ],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, false);
  const cycleDiag = report.diagnostics.find(d => d.code === 'VAL-GEN-01');
  assert.ok(cycleDiag, 'Debe emitir diagnóstico de ciclo de herencia VAL-GEN-01');
  assert.equal(cycleDiag.severity, 'ERROR');
  assert.ok(cycleDiag.message.includes('Ciclo de herencia detectado'));
});

test('CU-08 VAL-GEN-02: detecta herencia múltiple de clases concretas (incompatible con Java)', () => {
  const ast: UMLDiagramAST = {
    version: 1,
    classes: [
      { id: 'c1', name: 'Vehiculo', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      { id: 'c2', name: 'DispositivoElectronico', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      { id: 'c3', name: 'Tesla', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
    ],
    relationships: [
      { id: 'r1', sourceClassId: 'c3', targetClassId: 'c1', type: 'INHERITANCE' },
      { id: 'r2', sourceClassId: 'c3', targetClassId: 'c2', type: 'INHERITANCE' }, // Segunda herencia concreta
    ],
  };

  const report = validateUmlDiagram(ast);
  assert.equal(report.isValid, false);
  const diag = report.diagnostics.find(d => d.code === 'VAL-GEN-02');
  assert.ok(diag, 'Debe detectar herencia múltiple de clases concretas');
});

test('CU-08 Controlador: endpoint validarDiagramaDirecto responde reporte válido', async () => {
  const controller = createValidationController();
  const req = {
    body: {
      version: 1,
      classes: [{ id: '1', name: 'Auto', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } }],
      relationships: [],
    },
  } as unknown as Request;

  let responseData: unknown = null;
  const res = {
    json: (payload: unknown) => {
      responseData = payload;
      return res;
    },
  } as unknown as Response;

  await controller.validarDiagramaDirecto(req, res, () => {});

  assert.ok(responseData, 'Debe devolver un payload de respuesta');
  const typed = responseData as { data: { isValid: boolean } };
  assert.equal(typed.data.isValid, true);
});
