import type { UMLDiagramAST } from '../types/uml';

const uniqueId = (preferred: string, used: Set<string>): string => {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  let suffix = 2;
  while (used.has(`${preferred}_imported_${suffix}`)) {
    suffix += 1;
  }
  const id = `${preferred}_imported_${suffix}`;
  used.add(id);
  return id;
};

const normalizedName = (value: string) => value.trim().toLocaleLowerCase('es');

/**
 * Fusiona un diagrama UML entrante con el diagrama actual, preservando elementos
 * existentes, evitando duplicados por nombre de clase, atributo o firma de método,
 * y reasignando IDs de forma determinista y segura.
 */
export const mergeUmlDiagrams = (current: UMLDiagramAST, imported: UMLDiagramAST): UMLDiagramAST => {
  const classes = structuredClone(current.classes || []);
  const relationships = structuredClone(current.relationships || []);

  const usedClassIds = new Set(classes.map(cls => cls.id));
  const usedMemberIds = new Set(
    classes.flatMap(cls => [
      ...(cls.attributes || []).map(a => a.id),
      ...(cls.methods || []).map(m => m.id),
    ])
  );

  const idMap = new Map<string, string>();

  // 1. Procesar clases importadas
  (imported.classes || []).forEach(incoming => {
    const existing = classes.find(cls => normalizedName(cls.name) === normalizedName(incoming.name));
    if (existing) {
      idMap.set(incoming.id, existing.id);

      // Fusionar atributos no duplicados
      const attributeNames = new Set(existing.attributes.map(a => normalizedName(a.name)));
      (incoming.attributes || []).forEach(attr => {
        if (attributeNames.has(normalizedName(attr.name))) return;
        const cloned = structuredClone(attr);
        cloned.id = uniqueId(cloned.id, usedMemberIds);
        existing.attributes.push(cloned);
        attributeNames.add(normalizedName(attr.name));
      });

      // Fusionar métodos no duplicados
      const methodSignatures = new Set(
        existing.methods.map(
          m => `${normalizedName(m.name)}(${(m.parameters || []).map(p => normalizedName(p.type)).join(',')})`
        )
      );
      (incoming.methods || []).forEach(method => {
        const signature = `${normalizedName(method.name)}(${(method.parameters || []).map(p => normalizedName(p.type)).join(',')})`;
        if (methodSignatures.has(signature)) return;
        const cloned = structuredClone(method);
        cloned.id = uniqueId(cloned.id, usedMemberIds);
        existing.methods.push(cloned);
        methodSignatures.add(signature);
      });
      return;
    }

    // Nueva clase no existente previamente
    const cloned = structuredClone(incoming);
    cloned.id = uniqueId(cloned.id, usedClassIds);
    idMap.set(incoming.id, cloned.id);
    cloned.attributes = (cloned.attributes || []).map(attr => ({
      ...attr,
      id: uniqueId(attr.id, usedMemberIds),
    }));
    cloned.methods = (cloned.methods || []).map(m => ({
      ...m,
      id: uniqueId(m.id, usedMemberIds),
    }));
    classes.push(cloned);
  });

  // 2. Procesar relaciones importadas
  const usedRelationshipIds = new Set(relationships.map(r => r.id));
  const relationKeys = new Set(
    relationships.map(r => `${r.type}|${r.sourceClassId}|${r.targetClassId}|${normalizedName(r.name ?? '')}`)
  );

  (imported.relationships || []).forEach(incoming => {
    const sourceClassId = idMap.get(incoming.sourceClassId) || incoming.sourceClassId;
    const targetClassId = idMap.get(incoming.targetClassId) || incoming.targetClassId;

    const sourceExists = classes.some(c => c.id === sourceClassId);
    const targetExists = classes.some(c => c.id === targetClassId);
    if (!sourceExists || !targetExists) return;

    const key = `${incoming.type}|${sourceClassId}|${targetClassId}|${normalizedName(incoming.name ?? '')}`;
    if (relationKeys.has(key)) return;

    relationships.push({
      ...structuredClone(incoming),
      id: uniqueId(incoming.id, usedRelationshipIds),
      sourceClassId,
      targetClassId,
    });
    relationKeys.add(key);
  });

  return {
    ...structuredClone(current),
    classes,
    relationships,
  };
};
