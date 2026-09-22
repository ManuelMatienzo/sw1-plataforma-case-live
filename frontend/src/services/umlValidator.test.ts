import { describe, expect, it } from 'vitest';
import { validateUmlDiagram } from './umlValidator';
import { UMLDiagramAST, UMLMultiplicity } from '../types/uml';

describe('UML Validator (CU-08) - Reglas UML 2.5+', () => {
  it('valida exitosamente un modelo UML 2.5+ bien estructurado', () => {
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
    expect(report.isValid).toBe(true);
    expect(report.criticalErrorsCount).toBe(0);
  });

  it('VAL-CLS-01 y VAL-CLS-02: detecta nombres duplicados, vacíos y palabras reservadas', () => {
    const ast: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'c1',
          name: 'Select', // Palabra reservada SQL
          isAbstract: false,
          isInterface: false,
          attributes: [],
          methods: [],
          position: { x: 0, y: 0 },
        },
        {
          id: 'c2',
          name: 'Paciente',
          isAbstract: false,
          isInterface: false,
          attributes: [],
          methods: [],
          position: { x: 0, y: 0 },
        },
        {
          id: 'c3',
          name: 'paciente', // Duplicado case-insensitive
          isAbstract: false,
          isInterface: false,
          attributes: [],
          methods: [],
          position: { x: 0, y: 0 },
        },
        {
          id: 'c4',
          name: '', // Vacío
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
    expect(report.isValid).toBe(false);
    const codes = report.diagnostics.map(d => d.code);
    expect(codes).toContain('VAL-CLS-01');
    expect(codes).toContain('VAL-CLS-02');
  });

  it('VAL-CLS-04: detecta interfaces con atributos de estado mutables', () => {
    const ast: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'i1',
          name: 'Repositorio',
          isAbstract: false,
          isInterface: true,
          attributes: [{ id: 'a1', name: 'contador', type: 'Integer', visibility: '-' }],
          methods: [],
          position: { x: 0, y: 0 },
        },
      ],
      relationships: [],
    };

    const report = validateUmlDiagram(ast);
    expect(report.isValid).toBe(false);
    expect(report.diagnostics.some(d => d.code === 'VAL-CLS-04')).toBe(true);
  });

  it('VAL-ATR-01 y VAL-ATR-02: detecta atributos duplicados y tipos de datos inválidos', () => {
    const ast: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'c1',
          name: 'Factura',
          isAbstract: false,
          isInterface: false,
          attributes: [
            { id: 'a1', name: 'total', type: 'Double', visibility: '+' },
            { id: 'a2', name: 'TOTAL', type: 'Double', visibility: '-' }, // Duplicado
            { id: 'a3', name: 'codigo', type: 'TipoDesconocidoXYZ', visibility: '+' }, // Tipo inválido
          ],
          methods: [],
          position: { x: 0, y: 0 },
        },
      ],
      relationships: [],
    };

    const report = validateUmlDiagram(ast);
    expect(report.isValid).toBe(false);
    const codes = report.diagnostics.map(d => d.code);
    expect(codes).toContain('VAL-ATR-01');
    expect(codes).toContain('VAL-ATR-02');
  });

  it('VAL-REL-01, VAL-REL-02 y VAL-REL-03: valida extremos, multiplicidades y composición', () => {
    const ast: UMLDiagramAST = {
      version: 1,
      classes: [
        { id: 'c1', name: 'Empresa', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: 'c2', name: 'Departamento', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      ],
      relationships: [
        {
          id: 'r1',
          sourceClassId: 'c1',
          targetClassId: 'inexistente',
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
          sourceMultiplicity: 'rango-invalido' as unknown as UMLMultiplicity,
        },
      ],
    };

    const report = validateUmlDiagram(ast);
    expect(report.isValid).toBe(false);
    const codes = report.diagnostics.map(d => d.code);
    expect(codes).toContain('VAL-REL-01');
    expect(codes).toContain('VAL-REL-02');
    expect(codes).toContain('VAL-REL-03');
  });

  it('VAL-GEN-01: detecta ciclos de herencia mediante algoritmo DFS', () => {
    // Ciclo A -> B -> C -> A
    const ast: UMLDiagramAST = {
      version: 1,
      classes: [
        { id: 'a', name: 'ClaseA', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: 'b', name: 'ClaseB', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: 'c', name: 'ClaseC', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      ],
      relationships: [
        { id: 'r1', sourceClassId: 'a', targetClassId: 'b', type: 'INHERITANCE' },
        { id: 'r2', sourceClassId: 'b', targetClassId: 'c', type: 'INHERITANCE' },
        { id: 'r3', sourceClassId: 'c', targetClassId: 'a', type: 'INHERITANCE' },
      ],
    };

    const report = validateUmlDiagram(ast);
    expect(report.isValid).toBe(false);
    const diag = report.diagnostics.find(d => d.code === 'VAL-GEN-01');
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('Ciclo de herencia detectado');
  });

  it('VAL-GEN-02: detecta herencia múltiple de clases concretas', () => {
    const ast: UMLDiagramAST = {
      version: 1,
      classes: [
        { id: 'c1', name: 'Padre1', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: 'c2', name: 'Padre2', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
        { id: 'c3', name: 'Hijo', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
      ],
      relationships: [
        { id: 'r1', sourceClassId: 'c3', targetClassId: 'c1', type: 'INHERITANCE' },
        { id: 'r2', sourceClassId: 'c3', targetClassId: 'c2', type: 'INHERITANCE' },
      ],
    };

    const report = validateUmlDiagram(ast);
    expect(report.isValid).toBe(false);
    const diag = report.diagnostics.find(d => d.code === 'VAL-GEN-02');
    expect(diag).toBeDefined();
  });
});
