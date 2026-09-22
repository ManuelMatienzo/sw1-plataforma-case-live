import { describe, expect, it } from 'vitest';
import { mergeUmlDiagrams } from './diagramMerge';
import type { UMLDiagramAST } from '../types/uml';

describe('mergeUmlDiagrams', () => {
  it('combina clases nuevas sin alterar las existentes ni duplicar IDs', () => {
    const current: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'cls-1',
          name: 'Persona',
          isAbstract: false,
          isInterface: false,
          attributes: [{ id: 'a1', name: 'id', type: 'Integer', visibility: '+' }],
          methods: [],
          position: { x: 100, y: 100 },
        },
      ],
      relationships: [],
    };

    const imported: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'cls-rec-1',
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
          sourceClassId: 'cls-rec-1',
          targetClassId: 'cls-1',
          type: 'INHERITANCE',
        },
      ],
    };

    const merged = mergeUmlDiagrams(current, imported);
    expect(merged.classes).toHaveLength(2);
    expect(merged.classes.map(c => c.name)).toEqual(['Persona', 'Paciente']);
    expect(merged.relationships).toHaveLength(1);
    expect(merged.relationships[0].type).toBe('INHERITANCE');
  });

  it('fusiona atributos y métodos en clases con el mismo nombre sin duplicar', () => {
    const current: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'c1',
          name: 'Paciente',
          isAbstract: false,
          isInterface: false,
          attributes: [{ id: 'a1', name: 'id', type: 'Integer', visibility: '+' }],
          methods: [],
          position: { x: 100, y: 100 },
        },
      ],
      relationships: [],
    };

    const imported: UMLDiagramAST = {
      version: 1,
      classes: [
        {
          id: 'c_incoming',
          name: 'paciente', // case-insensitive match
          isAbstract: false,
          isInterface: false,
          attributes: [
            { id: 'a_dup', name: 'id', type: 'Integer', visibility: '+' }, // duplicate, should be skipped
            { id: 'a_new', name: 'direccion', type: 'String', visibility: '+' }, // new attribute
          ],
          methods: [
            { id: 'm1', name: 'calcularEdad', returnType: 'Integer', visibility: '+', parameters: [] },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relationships: [],
    };

    const merged = mergeUmlDiagrams(current, imported);
    expect(merged.classes).toHaveLength(1);
    expect(merged.classes[0].attributes).toHaveLength(2);
    expect(merged.classes[0].attributes.map(a => a.name)).toEqual(['id', 'direccion']);
    expect(merged.classes[0].methods).toHaveLength(1);
    expect(merged.classes[0].methods[0].name).toBe('calcularEdad');
  });
});
