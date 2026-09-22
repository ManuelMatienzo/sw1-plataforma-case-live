import { describe, expect, it } from 'vitest';
import {
  calculateNextClassPosition,
  mapUmlType,
  normalizeText,
  parseVoiceCommandLocal,
  toCamelCase,
  toPascalCase,
} from './voiceCommandParser';
import { UMLClass } from '../types/uml';

describe('Voice Command Parser - Frontend Unit Tests', () => {
  describe('Utilidades de normalización y casing', () => {
    it('normalizeText elimina tildes y caracteres especiales preservando palabras', () => {
      expect(normalizeText('¿Podrías crear la clase Médico con cédula?')).toBe(
        'Podrias crear la clase Medico con cedula',
      );
    });

    it('toPascalCase convierte frases separadas por espacio a PascalCase', () => {
      expect(toPascalCase('historia clinica')).toBe('HistoriaClinica');
      expect(toPascalCase('paciente')).toBe('Paciente');
      expect(toPascalCase('OrdenCompra')).toBe('OrdenCompra');
    });

    it('toCamelCase convierte nombres a camelCase estándar', () => {
      expect(toCamelCase('fecha de nacimiento')).toBe('fechaDeNacimiento');
      expect(toCamelCase('nombre')).toBe('nombre');
    });

    it('mapUmlType mapea tipos cotidianos a tipos estándar UML', () => {
      expect(mapUmlType('entero')).toBe('Integer');
      expect(mapUmlType('texto')).toBe('String');
      expect(mapUmlType('booleano')).toBe('Boolean');
      expect(mapUmlType('precio')).toBe('Double');
      expect(mapUmlType('fecha')).toBe('Date');
      expect(mapUmlType('vacio')).toBe('void');
    });
  });

  describe('parseVoiceCommandLocal', () => {
    it('reconoce creación de clase con atributos y tipos', () => {
      const action = parseVoiceCommandLocal(
        'crear clase Paciente con atributos nombre texto, edad entero y activo boolean',
      );
      expect(action.type).toBe('CREATE_CLASS');
      if (action.type === 'CREATE_CLASS') {
        expect(action.name).toBe('Paciente');
        expect(action.isInterface).toBe(false);
        expect(action.attributes).toHaveLength(3);
        expect(action.attributes?.[0]).toEqual({ name: 'nombre', type: 'String', isPrimaryKey: false });
        expect(action.attributes?.[1]).toEqual({ name: 'edad', type: 'Integer', isPrimaryKey: false });
        expect(action.attributes?.[2]).toEqual({ name: 'activo', type: 'Boolean', isPrimaryKey: false });
      }
    });

    it('reconoce creación de interfaz', () => {
      const action = parseVoiceCommandLocal('crear interfaz Notificador');
      expect(action.type).toBe('CREATE_CLASS');
      if (action.type === 'CREATE_CLASS') {
        expect(action.name).toBe('Notificador');
        expect(action.isInterface).toBe(true);
      }
    });

    it('reconoce agregar atributo a una clase existente', () => {
      const action = parseVoiceCommandLocal('agregar atributo email de tipo String a Paciente');
      expect(action.type).toBe('ADD_ATTRIBUTE');
      if (action.type === 'ADD_ATTRIBUTE') {
        expect(action.className).toBe('Paciente');
        expect(action.attribute.name).toBe('email');
        expect(action.attribute.type).toBe('String');
      }
    });

    it('reconoce agregar método a una clase', () => {
      const action = parseVoiceCommandLocal('agregar metodo calcularTotal con retorno Double a Factura');
      expect(action.type).toBe('ADD_METHOD');
      if (action.type === 'ADD_METHOD') {
        expect(action.className).toBe('Factura');
        expect(action.method.name).toBe('calcularTotal');
        expect(action.method.returnType).toBe('Double');
      }
    });

    it('reconoce conexión entre clases con tipo de relación', () => {
      const action = parseVoiceCommandLocal('conectar Paciente con Medico como asociacion');
      expect(action.type).toBe('CREATE_RELATION');
      if (action.type === 'CREATE_RELATION') {
        expect(action.sourceName).toBe('Paciente');
        expect(action.targetName).toBe('Medico');
        expect(action.relationshipType).toBe('ASSOCIATION');
      }
    });

    it('reconoce herencia directa', () => {
      const action = parseVoiceCommandLocal('Medico hereda de Persona');
      expect(action.type).toBe('CREATE_RELATION');
      if (action.type === 'CREATE_RELATION') {
        expect(action.sourceName).toBe('Medico');
        expect(action.targetName).toBe('Persona');
        expect(action.relationshipType).toBe('INHERITANCE');
      }
    });

    it('reconoce eliminación de clase', () => {
      const action = parseVoiceCommandLocal('eliminar la clase Temporal');
      expect(action.type).toBe('DELETE_CLASS');
      if (action.type === 'DELETE_CLASS') {
        expect(action.className).toBe('Temporal');
      }
    });

    it('devuelve UNKNOWN para frases no relacionadas', () => {
      const action = parseVoiceCommandLocal('hola qué hora es');
      expect(action.type).toBe('UNKNOWN');
    });
  });

  describe('calculateNextClassPosition', () => {
    it('centra la primera clase en el área visible', () => {
      const pos = calculateNextClassPosition([], { x: 0, y: 0, scale: 1 }, 800, 600);
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.y).toBeGreaterThan(0);
    });

    it('posiciona una clase subsecuente sin colisionar con la existente', () => {
      const firstClass: UMLClass = {
        id: 'c1',
        name: 'Clase1',
        isAbstract: false,
        isInterface: false,
        attributes: [],
        methods: [],
        position: { x: 290, y: 220 },
      };

      const secondPos = calculateNextClassPosition([firstClass], { x: 0, y: 0, scale: 1 }, 800, 600);
      const distance = Math.hypot(secondPos.x - firstClass.position.x, secondPos.y - firstClass.position.y);
      expect(distance).toBeGreaterThanOrEqual(100);
    });
  });
});
