import {
  UMLClass,
  UMLDiagramAST,
  UMLMultiplicity,
  UMLRelationship,
} from '../models/uml.types';

export type DiagnosticSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface UmlDiagnostic {
  id: string;
  code: string; // ej: 'VAL-GEN-01', 'VAL-CLS-01'
  severity: DiagnosticSeverity;
  message: string;
  suggestion?: string;
  targetType: 'CLASS' | 'RELATIONSHIP' | 'ATTRIBUTE' | 'METHOD';
  targetId: string;
  targetName: string;
}

export interface UmlValidationReport {
  isValid: boolean; // true si criticalErrorsCount === 0
  criticalErrorsCount: number;
  warningsCount: number;
  diagnostics: UmlDiagnostic[];
  validatedAt: string;
}

// Tipos reconocidos en UML / Java / PostgreSQL
const STANDARD_UML_TYPES = new Set([
  'string',
  'text',
  'varchar',
  'char',
  'character',
  'integer',
  'int',
  'int4',
  'int8',
  'smallint',
  'bigint',
  'long',
  'short',
  'byte',
  'boolean',
  'bool',
  'double',
  'float',
  'real',
  'decimal',
  'numeric',
  'bigdecimal',
  'number',
  'date',
  'time',
  'datetime',
  'timestamp',
  'timestamptz',
  'localdate',
  'localdatetime',
  'localtime',
  'uuid',
  'byte[]',
  'blob',
  'binary',
  'void',
  'object',
  'any',
]);

export function isTypeValid(rawType: string, allKnownClassNames: Set<string>): boolean {
  if (!rawType) return false;
  const clean = rawType.trim().toLowerCase();
  if (!clean) return false;

  if (STANDARD_UML_TYPES.has(clean) || allKnownClassNames.has(clean)) {
    return true;
  }

  // Notación de arreglos (ej: String[], int[], Paciente[])
  if (clean.endsWith('[]')) {
    const base = clean.slice(0, -2).trim();
    return isTypeValid(base, allKnownClassNames);
  }

  // Notación genérica / colecciones (ej: List<String>, Set<Paciente>, Map<String, Integer>)
  const genericMatch = clean.match(/^([a-z0-9_]+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const innerArgs = genericMatch[2].split(',').map(s => s.trim());
    const validContainers = new Set(['list', 'set', 'collection', 'iterable', 'map', 'optional', 'arraylist', 'hashset']);
    if (validContainers.has(container)) {
      return innerArgs.every(arg => isTypeValid(arg, allKnownClassNames));
    }
  }

  return false;
}

// Palabras reservadas críticas de SQL (PostgreSQL) y Java (Spring Boot)
const RESERVED_WORDS = new Set([
  'select', 'insert', 'update', 'delete', 'from', 'where', 'table', 'order',
  'group', 'user', 'class', 'interface', 'enum', 'extends', 'implements',
  'public', 'private', 'protected', 'static', 'final', 'void', 'null',
  'true', 'false', 'package', 'import', 'new', 'return', 'this', 'super',
]);

// Multiplicidades estándar
const VALID_STANDARD_MULTIPLICITIES = new Set<string>(['1', '0..1', '1..*', '0..*', '*']);

function isValidMultiplicity(mult?: string): boolean {
  if (!mult || !mult.trim()) return true; // Si no se define, se toma por defecto
  const clean = mult.trim();
  if (VALID_STANDARD_MULTIPLICITIES.has(clean)) return true;
  
  // Soporte para rangos personalizados "n..m"
  const rangeMatch = clean.match(/^(\d+)\.\.(\d+|\*)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    if (rangeMatch[2] === '*') return true;
    const max = parseInt(rangeMatch[2], 10);
    return min <= max;
  }

  // Soporte para enteros fijos "2", "3"
  if (/^\d+$/.test(clean)) return true;

  return false;
}

/**
 * Motor formal de validación de diagramas de clases según la especificación UML 2.5+ (OMG).
 */
export function validateUmlDiagram(ast: UMLDiagramAST): UmlValidationReport {
  const diagnostics: UmlDiagnostic[] = [];
  const classes = ast.classes || [];
  const relationships = ast.relationships || [];

  const classMap = new Map<string, UMLClass>();
  const classNameMap = new Map<string, string[]>(); // lowercase name -> classIds

  // -------------------------------------------------------------
  // 1. REGLAS DE ENTIDAD (VAL-CLS)
  // -------------------------------------------------------------
  for (const cls of classes) {
    classMap.set(cls.id, cls);
    const lowerName = (cls.name || '').trim().toLowerCase();

    if (!classNameMap.has(lowerName)) {
      classNameMap.set(lowerName, []);
    }
    classNameMap.get(lowerName)!.push(cls.id);

    // VAL-CLS-02: Nombre de clase no vacío y sintaxis válida
    if (!cls.name || !cls.name.trim()) {
      diagnostics.push({
        id: `diag-${cls.id}-empty-name`,
        code: 'VAL-CLS-02',
        severity: 'ERROR',
        message: 'La clase tiene un nombre vacío o no definido.',
        suggestion: 'Asigna un nombre descriptivo en PascalCase (ej: "Paciente").',
        targetType: 'CLASS',
        targetId: cls.id,
        targetName: 'ClaseSinNombre',
      });
    } else {
      const cleanName = cls.name.trim();
      // Formato PascalCase o identificador válido
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanName)) {
        diagnostics.push({
          id: `diag-${cls.id}-invalid-identifier`,
          code: 'VAL-CLS-02',
          severity: 'ERROR',
          message: `El nombre "${cls.name}" contiene caracteres no válidos para un identificador UML/código.`,
          suggestion: 'Usa únicamente letras, números y guiones bajos (ej: "HistoriaClinica").',
          targetType: 'CLASS',
          targetId: cls.id,
          targetName: cls.name,
        });
      }

      // Palabra reservada
      if (RESERVED_WORDS.has(cleanName.toLowerCase())) {
        diagnostics.push({
          id: `diag-${cls.id}-reserved-word`,
          code: 'VAL-CLS-02',
          severity: 'ERROR',
          message: `El nombre "${cls.name}" es una palabra reservada en SQL o Java y causará fallos de compilación/persistencia.`,
          suggestion: `Renombra la clase a un término de negocio específico (ej: "${cleanName}Entity" o "${cleanName}Model").`,
          targetType: 'CLASS',
          targetId: cls.id,
          targetName: cls.name,
        });
      }
    }

    // VAL-CLS-04: Interfaces sin atributos mutables
    if (cls.isInterface && cls.attributes && cls.attributes.length > 0) {
      diagnostics.push({
        id: `diag-${cls.id}-interface-attributes`,
        code: 'VAL-CLS-04',
        severity: 'ERROR',
        message: `La interfaz "${cls.name}" declara atributos de instancia. Las interfaces UML 2.5+ no pueden definir estado mutable.`,
        suggestion: 'Mueve los atributos a las clases que implementan la interfaz o conviértela en una clase abstracta.',
        targetType: 'CLASS',
        targetId: cls.id,
        targetName: cls.name,
      });
    }

    // VAL-CLS-03: Clase aislada o incompleta (Advertencia)
    const hasAttributes = cls.attributes && cls.attributes.length > 0;
    const hasMethods = cls.methods && cls.methods.length > 0;
    const hasRelations = relationships.some(
      r => r.sourceClassId === cls.id || r.targetClassId === cls.id
    );

    if (!cls.isInterface && !hasAttributes && !hasMethods && !hasRelations) {
      diagnostics.push({
        id: `diag-${cls.id}-isolated`,
        code: 'VAL-CLS-03',
        severity: 'WARNING',
        message: `La clase "${cls.name}" está aislada y vacía (sin atributos, métodos ni relaciones en el modelo).`,
        suggestion: 'Agrega atributos o conéctala con otras clases para integrarla al modelo de dominio.',
        targetType: 'CLASS',
        targetId: cls.id,
        targetName: cls.name,
      });
    }
  }

  // VAL-CLS-01: Unicidad de nombres de clases
  for (const [lowerName, ids] of classNameMap.entries()) {
    if (lowerName && ids.length > 1) {
      for (const id of ids) {
        const cls = classMap.get(id);
        diagnostics.push({
          id: `diag-${id}-duplicate-name`,
          code: 'VAL-CLS-01',
          severity: 'ERROR',
          message: `Existe más de una clase con el nombre "${cls?.name || lowerName}". Los nombres deben ser únicos en el paquete.`,
          suggestion: 'Renombra una de las clases duplicadas para evitar colisiones en PostgreSQL y Spring Boot.',
          targetType: 'CLASS',
          targetId: id,
          targetName: cls?.name || lowerName,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 2. REGLAS DE ATRIBUTOS (VAL-ATR)
  // -------------------------------------------------------------
  const allKnownClassNames = new Set(classes.map(c => (c.name || '').trim().toLowerCase()));

  for (const cls of classes) {
    const attrNameCounts = new Map<string, number>();

    for (const attr of cls.attributes || []) {
      const lowerAttrName = (attr.name || '').trim().toLowerCase();
      attrNameCounts.set(lowerAttrName, (attrNameCounts.get(lowerAttrName) || 0) + 1);

      // VAL-ATR-02: Tipo de dato válido
      const isValid = isTypeValid(attr.type || '', allKnownClassNames);

      if (!isValid) {
        diagnostics.push({
          id: `diag-${attr.id}-invalid-type`,
          code: 'VAL-ATR-02',
          severity: 'ERROR',
          message: `El atributo "${attr.name}" en "${cls.name}" tiene un tipo de dato desconocido ("${attr.type}").`,
          suggestion: 'Usa tipos estándar (String, Integer, Long, Boolean, Double, Date) o el nombre de otra clase del diagrama.',
          targetType: 'ATTRIBUTE',
          targetId: attr.id,
          targetName: `${cls.name}.${attr.name}`,
        });
      }

      // VAL-ATR-03: Convención camelCase (Advertencia)
      if (attr.name && /^[A-Z]/.test(attr.name)) {
        diagnostics.push({
          id: `diag-${attr.id}-naming-convention`,
          code: 'VAL-ATR-03',
          severity: 'WARNING',
          message: `El atributo "${attr.name}" en "${cls.name}" empieza con mayúscula. La convención estándar UML/Java es camelCase.`,
          suggestion: `Renombra el atributo a "${attr.name.charAt(0).toLowerCase() + attr.name.slice(1)}".`,
          targetType: 'ATTRIBUTE',
          targetId: attr.id,
          targetName: `${cls.name}.${attr.name}`,
        });
      }
    }

    // VAL-ATR-01: Unicidad de atributos por clase
    for (const [lowerAttrName, count] of attrNameCounts.entries()) {
      if (lowerAttrName && count > 1) {
        diagnostics.push({
          id: `diag-${cls.id}-dup-attr-${lowerAttrName}`,
          code: 'VAL-ATR-01',
          severity: 'ERROR',
          message: `La clase "${cls.name}" tiene ${count} atributos llamados "${lowerAttrName}".`,
          suggestion: 'Renombra o elimina los atributos duplicados dentro de la misma clase.',
          targetType: 'CLASS',
          targetId: cls.id,
          targetName: cls.name,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 3. REGLAS DE RELACIONES (VAL-REL)
  // -------------------------------------------------------------
  for (const rel of relationships) {
    const sourceCls = classMap.get(rel.sourceClassId);
    const targetCls = classMap.get(rel.targetClassId);

    // VAL-REL-01: Integridad de extremos (No huérfanas)
    if (!sourceCls || !targetCls) {
      diagnostics.push({
        id: `diag-${rel.id}-orphan`,
        code: 'VAL-REL-01',
        severity: 'ERROR',
        message: `La relación "${rel.id}" es huérfana: conecta extremos inexistentes en el modelo.`,
        suggestion: 'Elimina la relación o reconéctala a clases válidas existentes.',
        targetType: 'RELATIONSHIP',
        targetId: rel.id,
        targetName: rel.name || `Relación ${rel.type}`,
      });
      continue;
    }

    // VAL-REL-02: Multiplicidades estándar válidas
    if (!isValidMultiplicity(rel.sourceMultiplicity)) {
      diagnostics.push({
        id: `diag-${rel.id}-invalid-source-mult`,
        code: 'VAL-REL-02',
        severity: 'ERROR',
        message: `Multiplicidad de origen inválida ("${rel.sourceMultiplicity}") en relación entre "${sourceCls.name}" y "${targetCls.name}".`,
        suggestion: 'Usa una multiplicidad válida según UML 2.5+ (1, 0..1, 1..*, 0..*, *).',
        targetType: 'RELATIONSHIP',
        targetId: rel.id,
        targetName: `${sourceCls.name} -> ${targetCls.name}`,
      });
    }

    if (!isValidMultiplicity(rel.targetMultiplicity)) {
      diagnostics.push({
        id: `diag-${rel.id}-invalid-target-mult`,
        code: 'VAL-REL-02',
        severity: 'ERROR',
        message: `Multiplicidad de destino inválida ("${rel.targetMultiplicity}") en relación entre "${sourceCls.name}" y "${targetCls.name}".`,
        suggestion: 'Usa una multiplicidad válida según UML 2.5+ (1, 0..1, 1..*, 0..*, *).',
        targetType: 'RELATIONSHIP',
        targetId: rel.id,
        targetName: `${sourceCls.name} -> ${targetCls.name}`,
      });
    }

    // VAL-REL-03: Regla existencial de Composición
    // En UML, el rombo relleno (contenedor/whole) es la clase origen.
    // El extremo contenedor NO puede ser múltiple (*, 1..*, etc.), solo 1 o 0..1.
    if (rel.type === 'COMPOSITION') {
      const srcMult = (rel.sourceMultiplicity || '1').trim();
      if (srcMult === '*' || srcMult.includes('*') || srcMult.startsWith('0..*') || srcMult.startsWith('1..*')) {
        diagnostics.push({
          id: `diag-${rel.id}-composition-multiplicity`,
          code: 'VAL-REL-03',
          severity: 'ERROR',
          message: `En una composición, el contenedor "${sourceCls.name}" tiene multiplicidad múltiple ("${srcMult}"). Un componente no puede pertenecer simultáneamente a varios contenedores.`,
          suggestion: 'Establece la multiplicidad del contenedor en "1" o "0..1", o cambia la relación a agregación/asociación.',
          targetType: 'RELATIONSHIP',
          targetId: rel.id,
          targetName: `Composición ${sourceCls.name} -> ${targetCls.name}`,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 4. REGLAS DE GENERALIZACIÓN Y HERENCIA (VAL-GEN)
  // -------------------------------------------------------------
  // Construir grafo de herencia: subClaseId -> superClaseIds
  const inheritanceGraph = new Map<string, string[]>();
  const concreteSuperClassCount = new Map<string, number>();

  for (const rel of relationships) {
    if (rel.type === 'INHERITANCE' || rel.type === 'REALIZATION') {
      const subId = rel.sourceClassId;
      const superId = rel.targetClassId;

      if (!classMap.has(subId) || !classMap.has(superId)) continue;

      if (!inheritanceGraph.has(subId)) {
        inheritanceGraph.set(subId, []);
      }
      inheritanceGraph.get(subId)!.push(superId);

      const targetCls = classMap.get(superId);
      if (rel.type === 'INHERITANCE' && targetCls && !targetCls.isInterface) {
        concreteSuperClassCount.set(subId, (concreteSuperClassCount.get(subId) || 0) + 1);
      }
    }
  }

  // VAL-GEN-02: Herencia múltiple de clases concretas
  for (const [subId, count] of concreteSuperClassCount.entries()) {
    if (count > 1) {
      const subCls = classMap.get(subId);
      diagnostics.push({
        id: `diag-${subId}-multiple-inheritance`,
        code: 'VAL-GEN-02',
        severity: 'ERROR',
        message: `La clase "${subCls?.name}" hereda directamente de ${count} clases concretas. El destino Java/Spring Boot no soporta herencia múltiple de clases.`,
        suggestion: 'Aplica composición o convierte las superclases secundarias en interfaces.',
        targetType: 'CLASS',
        targetId: subId,
        targetName: subCls?.name || 'Clase',
      });
    }
  }

  // VAL-GEN-01: Ausencia de ciclos de herencia (DFS con 3 colores)
  // 0: WHITE (no visitado), 1: GRAY (en pila actual), 2: BLACK (completado)
  const color = new Map<string, number>();
  const parentTrack = new Map<string, string | null>();
  const detectedCycles = new Set<string>();

  function dfsDetectCycle(u: string, path: string[]) {
    color.set(u, 1); // GRAY
    path.push(u);

    const neighbors = inheritanceGraph.get(u) || [];
    for (const v of neighbors) {
      const vColor = color.get(v) || 0;
      if (vColor === 1) {
        // Arco de retroceso detectado: ciclo!
        const cycleStartIndex = path.indexOf(v);
        const cycleNodes = path.slice(cycleStartIndex);
        const cycleNames = cycleNodes.map(id => classMap.get(id)?.name || id);
        cycleNames.push(classMap.get(v)?.name || v);
        const cycleKey = cycleNodes.sort().join('|');

        if (!detectedCycles.has(cycleKey)) {
          detectedCycles.add(cycleKey);
          diagnostics.push({
            id: `diag-cycle-${cycleKey}`,
            code: 'VAL-GEN-01',
            severity: 'ERROR',
            message: `Ciclo de herencia detectado: ${cycleNames.join(' -> ')}. La generalización debe ser un Grafo Acíclico Dirigido (DAG).`,
            suggestion: 'Elimina la relación de herencia que cierra el ciclo circular.',
            targetType: 'CLASS',
            targetId: u,
            targetName: classMap.get(u)?.name || u,
          });
        }
      } else if (vColor === 0) {
        dfsDetectCycle(v, path);
      }
    }

    path.pop();
    color.set(u, 2); // BLACK
  }

  for (const cls of classes) {
    if ((color.get(cls.id) || 0) === 0) {
      dfsDetectCycle(cls.id, []);
    }
  }

  // VAL-GEN-03: Atributos sobreescritos no duplicados (Advertencia)
  for (const [subId, superIds] of inheritanceGraph.entries()) {
    const subCls = classMap.get(subId);
    if (!subCls) continue;
    const subAttrNames = new Set((subCls.attributes || []).map(a => a.name.toLowerCase()));

    for (const supId of superIds) {
      const supCls = classMap.get(supId);
      if (!supCls) continue;

      for (const supAttr of supCls.attributes || []) {
        if (subAttrNames.has(supAttr.name.toLowerCase())) {
          diagnostics.push({
            id: `diag-${subId}-override-dup-${supAttr.name}`,
            code: 'VAL-GEN-03',
            severity: 'WARNING',
            message: `La subclase "${subCls.name}" declara el atributo "${supAttr.name}", el cual ya es heredado de su ancestro "${supCls.name}".`,
            suggestion: `Elimina la declaración redundante de "${supAttr.name}" en "${subCls.name}" para evitar sombreado de campos.`,
            targetType: 'ATTRIBUTE',
            targetId: subCls.attributes.find(a => a.name.toLowerCase() === supAttr.name.toLowerCase())?.id || subId,
            targetName: `${subCls.name}.${supAttr.name}`,
          });
        }
      }
    }
  }

  const criticalErrorsCount = diagnostics.filter(d => d.severity === 'ERROR').length;
  const warningsCount = diagnostics.filter(d => d.severity === 'WARNING').length;

  return {
    isValid: criticalErrorsCount === 0,
    criticalErrorsCount,
    warningsCount,
    diagnostics,
    validatedAt: new Date().toISOString(),
  };
}
