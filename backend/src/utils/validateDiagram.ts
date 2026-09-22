import { AppError } from '../errors/AppError';
import { UMLDiagramAST } from '../models/uml.types';

const fail = (message: string): never => { throw new AppError(message, 400, 'INVALID_DIAGRAM'); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('El diagrama contiene un objeto inválido');
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, max = 200): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(`${label} inválido`);
  return value;
};
const array = (value: unknown, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max) return fail('La colección del diagrama es inválida o demasiado grande');
  return value;
};
const oneOf = (value: unknown, allowed: readonly unknown[]) => { if (!allowed.includes(value)) fail('Valor UML inválido'); };
const optionalBool = (value: unknown) => { if (value !== undefined && typeof value !== 'boolean') fail('Propiedad booleana inválida'); };
const optionalText = (value: unknown, max = 200) => { if (value !== undefined && (typeof value !== 'string' || value.length > max)) fail('Texto UML inválido'); };

/** Structural validation only. Semantic modeling warnings belong to CU-08. */
export function parseDiagram(value: unknown): UMLDiagramAST {
  const ast = record(value);
  if (!Number.isSafeInteger(ast.version) || Number(ast.version) < 1) fail('Versión inválida');
  const classes = array(ast.classes, 500);
  const relationships = array(ast.relationships, 2000);
  const ids = new Set<string>();
  const classIds = new Set<string>();
  const names = new Set<string>();
  const id = (value: unknown) => { const key = text(value, 'ID', 128); if (ids.has(key)) fail('ID duplicado'); ids.add(key); return key; };
  for (const entry of classes) {
    const cls = record(entry);
    classIds.add(id(cls.id));
    const name = text(cls.name, 'Nombre de clase').trim().toLocaleLowerCase();
    if (names.has(name)) fail('Ya existe una clase con ese nombre'); names.add(name);
    if (typeof cls.isAbstract !== 'boolean' || typeof cls.isInterface !== 'boolean') fail('Tipo de clase inválido');
    const position = record(cls.position);
    for (const n of [position.x, position.y]) if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 100000) fail('Posición inválida');
    for (const n of [cls.width, cls.height]) if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 40 || n > 10000)) fail('Tamaño inválido');
    optionalText(cls.comment, 2000);
    for (const entry of array(cls.attributes, 100)) {
      const attr = record(entry); id(attr.id); text(attr.name, 'Nombre de atributo'); text(attr.type, 'Tipo');
      oneOf(attr.visibility, ['+', '-', '#', '~']);
      for (const b of [attr.isPrimaryKey, attr.isNullable, attr.isUnique]) optionalBool(b);
      optionalText(attr.defaultValue, 1000);
    }
    for (const entry of array(cls.methods, 100)) {
      const method = record(entry); id(method.id); text(method.name, 'Nombre de método'); text(method.returnType, 'Retorno');
      oneOf(method.visibility, ['+', '-', '#', '~']); optionalBool(method.isAbstract); optionalBool(method.isStatic);
      for (const entry of array(method.parameters, 30)) { const p = record(entry); text(p.name, 'Parámetro'); text(p.type, 'Tipo'); }
    }
  }
  for (const entry of relationships) {
    const rel = record(entry); id(rel.id);
    if (!classIds.has(String(rel.sourceClassId)) || !classIds.has(String(rel.targetClassId))) fail('La relación referencia una clase inexistente');
    oneOf(rel.type, ['ASSOCIATION', 'AGGREGATION', 'COMPOSITION', 'INHERITANCE', 'REALIZATION', 'DEPENDENCY']);
    for (const m of [rel.sourceMultiplicity, rel.targetMultiplicity]) if (m !== undefined) oneOf(m, ['1', '0..1', '1..*', '0..*', '*']);
    for (const t of [rel.name, rel.sourceRole, rel.targetRole]) optionalText(t);
    optionalBool(rel.isOrthogonal);
  }
  // Re-serialization detaches the validated data from the request object.
  return JSON.parse(JSON.stringify({ version: ast.version, classes, relationships })) as UMLDiagramAST;
}
