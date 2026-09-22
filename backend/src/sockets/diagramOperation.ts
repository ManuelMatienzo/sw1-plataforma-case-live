import { AppError } from '../errors/AppError';
import { UMLAttribute, UMLClass, UMLMethod, UMLRelationship } from '../models/uml.types';
import { parseDiagram } from '../utils/validateDiagram';

export type DiagramOperation =
  | { type: 'class:add'; payload: { class: UMLClass }; operationId: string }
  | { type: 'class:update'; payload: { classId: string; updates: Partial<UMLClass> }; operationId: string }
  | { type: 'class:move'; payload: { classId: string; x: number; y: number }; operationId: string }
  | { type: 'class:delete'; payload: { classId: string }; operationId: string }
  | { type: 'attribute:add'; payload: { classId: string; attribute: UMLAttribute }; operationId: string }
  | { type: 'attribute:update'; payload: { classId: string; attributeId: string; updates: Partial<UMLAttribute> }; operationId: string }
  | { type: 'attribute:delete'; payload: { classId: string; attributeId: string }; operationId: string }
  | { type: 'method:add'; payload: { classId: string; method: UMLMethod }; operationId: string }
  | { type: 'method:update'; payload: { classId: string; methodId: string; updates: Partial<UMLMethod> }; operationId: string }
  | { type: 'method:delete'; payload: { classId: string; methodId: string }; operationId: string }
  | { type: 'relationship:add'; payload: { relationship: UMLRelationship }; operationId: string }
  | { type: 'relationship:update'; payload: { relationshipId: string; updates: Partial<UMLRelationship> }; operationId: string }
  | { type: 'relationship:delete'; payload: { relationshipId: string }; operationId: string };

const types = new Set<DiagramOperation['type']>([
  'class:add', 'class:update', 'class:move', 'class:delete',
  'attribute:add', 'attribute:update', 'attribute:delete',
  'method:add', 'method:update', 'method:delete',
  'relationship:add', 'relationship:update', 'relationship:delete',
]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const fail = (): never => { throw new AppError('Operación de diagrama inválida', 400, 'INVALID_OPERATION'); };
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : fail();
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const dummyClass = (classId: string, attributes: UMLAttribute[] = [], methods: UMLMethod[] = []): UMLClass => ({
  id: classId, name: `Class_${classId.replace(/[^a-z0-9]/gi, '').slice(0, 30) || 'item'}`,
  isAbstract: false, isInterface: false, attributes, methods, position: { x: 0, y: 0 },
});
const validatedAttribute = (value: unknown) => parseDiagram({ version: 1, classes: [dummyClass('class', [value as UMLAttribute])], relationships: [] }).classes[0].attributes[0];
const validatedMethod = (value: unknown) => parseDiagram({ version: 1, classes: [dummyClass('class', [], [value as UMLMethod])], relationships: [] }).classes[0].methods[0];
const validatedRelationship = (value: unknown) => {
  const candidate = record(value);
  if (!id(candidate.sourceClassId) || !id(candidate.targetClassId)) fail();
  const classIds = [...new Set([candidate.sourceClassId as string, candidate.targetClassId as string])];
  return parseDiagram({ version: 1, classes: classIds.map(classId => dummyClass(classId)), relationships: [candidate] }).relationships[0];
};

export function parseDiagramOperation(input: unknown): DiagramOperation {
  const candidate = record(input);
  if (typeof candidate.type !== 'string' || !types.has(candidate.type as DiagramOperation['type']) || !id(candidate.operationId) || !isRecord(candidate.payload)) fail();
  let serialized = '';
  try { serialized = JSON.stringify(candidate); } catch { fail(); }
  if (serialized.length > 64_000) fail();
  const operationId = candidate.operationId as string;
  const payload = candidate.payload as Record<string, unknown>;
  switch (candidate.type as DiagramOperation['type']) {
    case 'class:add': {
      if (!onlyKeys(payload, ['class'])) fail();
      const cls = parseDiagram({ version: 1, classes: [payload.class], relationships: [] }).classes[0];
      return { type: 'class:add', payload: { class: cls }, operationId };
    }
    case 'class:update': {
      if (!id(payload.classId)) fail();
      const updateInput = record(payload.updates);
      if (!onlyKeys(updateInput, ['name', 'isAbstract', 'isInterface', 'position', 'width', 'height', 'comment'])) fail();
      const base = dummyClass(payload.classId as string);
      const cls = parseDiagram({ version: 1, classes: [{ ...base, ...updateInput, id: base.id }], relationships: [] }).classes[0];
      const updates = Object.fromEntries(Object.keys(updateInput).map(key => [key, cls[key as keyof UMLClass]])) as Partial<UMLClass>;
      return { type: 'class:update', payload: { classId: base.id, updates }, operationId };
    }
    case 'class:move':
      if (!id(payload.classId) || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) fail();
      return { type: 'class:move', payload: { classId: payload.classId as string, x: payload.x as number, y: payload.y as number }, operationId };
    case 'class:delete':
      if (!id(payload.classId)) fail();
      return { type: 'class:delete', payload: { classId: payload.classId as string }, operationId };
    case 'attribute:add':
      if (!id(payload.classId)) fail();
      return { type: 'attribute:add', payload: { classId: payload.classId as string, attribute: validatedAttribute(payload.attribute) }, operationId };
    case 'attribute:update': {
      if (!id(payload.classId) || !id(payload.attributeId)) fail();
      const updateInput = record(payload.updates);
      if (!onlyKeys(updateInput, ['name', 'type', 'visibility', 'isPrimaryKey', 'isNullable', 'isUnique', 'defaultValue'])) fail();
      const base: UMLAttribute = { id: payload.attributeId as string, name: 'field', type: 'String', visibility: '-' };
      const validated = validatedAttribute({ ...base, ...updateInput, id: base.id });
      const updates = Object.fromEntries(Object.keys(updateInput).map(key => [key, validated[key as keyof UMLAttribute]])) as Partial<UMLAttribute>;
      return { type: 'attribute:update', payload: { classId: payload.classId as string, attributeId: base.id, updates }, operationId };
    }
    case 'attribute:delete':
      if (!id(payload.classId) || !id(payload.attributeId)) fail();
      return { type: 'attribute:delete', payload: { classId: payload.classId as string, attributeId: payload.attributeId as string }, operationId };
    case 'method:add':
      if (!id(payload.classId)) fail();
      return { type: 'method:add', payload: { classId: payload.classId as string, method: validatedMethod(payload.method) }, operationId };
    case 'method:update': {
      if (!id(payload.classId) || !id(payload.methodId)) fail();
      const updateInput = record(payload.updates);
      if (!onlyKeys(updateInput, ['name', 'returnType', 'visibility', 'parameters', 'isAbstract', 'isStatic'])) fail();
      const base: UMLMethod = { id: payload.methodId as string, name: 'method', returnType: 'void', visibility: '+', parameters: [] };
      const validated = validatedMethod({ ...base, ...updateInput, id: base.id });
      const updates = Object.fromEntries(Object.keys(updateInput).map(key => [key, validated[key as keyof UMLMethod]])) as Partial<UMLMethod>;
      return { type: 'method:update', payload: { classId: payload.classId as string, methodId: base.id, updates }, operationId };
    }
    case 'method:delete':
      if (!id(payload.classId) || !id(payload.methodId)) fail();
      return { type: 'method:delete', payload: { classId: payload.classId as string, methodId: payload.methodId as string }, operationId };
    case 'relationship:add':
      return { type: 'relationship:add', payload: { relationship: validatedRelationship(payload.relationship) }, operationId };
    case 'relationship:update': {
      if (!id(payload.relationshipId)) fail();
      const updateInput = record(payload.updates);
      if (!onlyKeys(updateInput, ['type', 'sourceMultiplicity', 'targetMultiplicity', 'sourceRole', 'targetRole', 'name', 'isOrthogonal'])) fail();
      const base: UMLRelationship = { id: payload.relationshipId as string, sourceClassId: 'source', targetClassId: 'target', type: 'ASSOCIATION' };
      const validated = validatedRelationship({ ...base, ...updateInput, id: base.id });
      const updates = Object.fromEntries(Object.keys(updateInput).map(key => [key, validated[key as keyof UMLRelationship]])) as Partial<UMLRelationship>;
      return { type: 'relationship:update', payload: { relationshipId: base.id, updates }, operationId };
    }
    case 'relationship:delete':
      if (!id(payload.relationshipId)) fail();
      return { type: 'relationship:delete', payload: { relationshipId: payload.relationshipId as string }, operationId };
  }
}

export const operationTargets = (operation: DiagramOperation): string[] => {
  switch (operation.type) {
    case 'class:add': return [`class:${operation.payload.class.id}`];
    case 'class:update': return Object.keys(operation.payload.updates).map(field => `class:${operation.payload.classId}:${field}`);
    case 'class:move': return [`class:${operation.payload.classId}:position`];
    case 'class:delete': return [`class:${operation.payload.classId}`];
    case 'attribute:add': return [`class:${operation.payload.classId}:attribute:${operation.payload.attribute.id}`];
    case 'attribute:update': return Object.keys(operation.payload.updates).map(field => `class:${operation.payload.classId}:attribute:${operation.payload.attributeId}:${field}`);
    case 'attribute:delete': return [`class:${operation.payload.classId}:attribute:${operation.payload.attributeId}`];
    case 'method:add': return [`class:${operation.payload.classId}:method:${operation.payload.method.id}`];
    case 'method:update': return Object.keys(operation.payload.updates).map(field => `class:${operation.payload.classId}:method:${operation.payload.methodId}:${field}`);
    case 'method:delete': return [`class:${operation.payload.classId}:method:${operation.payload.methodId}`];
    case 'relationship:add': return [`relationship:${operation.payload.relationship.id}`];
    case 'relationship:update': return Object.keys(operation.payload.updates).map(field => `relationship:${operation.payload.relationshipId}:${field}`);
    case 'relationship:delete': return [`relationship:${operation.payload.relationshipId}`];
  }
};
