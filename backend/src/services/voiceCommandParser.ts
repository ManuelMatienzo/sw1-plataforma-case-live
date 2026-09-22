export type UMLRelationshipType =
  | 'ASSOCIATION'
  | 'AGGREGATION'
  | 'COMPOSITION'
  | 'INHERITANCE'
  | 'REALIZATION'
  | 'DEPENDENCY';

export type UMLMultiplicity = '1' | '0..1' | '1..*' | '0..*' | '*';

export type VoiceCommandAction =
  | {
      type: 'CREATE_CLASS';
      name: string;
      isAbstract?: boolean;
      isInterface?: boolean;
      attributes?: Array<{ name: string; type: string; isPrimaryKey?: boolean; visibility?: string }>;
      methods?: Array<{ name: string; returnType: string; visibility?: string }>;
    }
  | {
      type: 'ADD_ATTRIBUTE';
      className: string;
      attribute: { name: string; type: string; visibility?: string; isPrimaryKey?: boolean };
    }
  | {
      type: 'ADD_METHOD';
      className: string;
      method: { name: string; returnType: string; visibility?: string };
    }
  | {
      type: 'CREATE_RELATION';
      sourceName: string;
      targetName: string;
      relationshipType: UMLRelationshipType;
      sourceMultiplicity?: UMLMultiplicity;
      targetMultiplicity?: UMLMultiplicity;
      name?: string;
    }
  | {
      type: 'DELETE_CLASS';
      className: string;
    }
  | {
      type: 'UNKNOWN';
      rawText: string;
      reason?: string;
    };

/**
 * Normaliza texto eliminando acentos diacríticos preservando comas y estructura básica.
 */
export const normalizeText = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Convierte un nombre en PascalCase válido preservando camelCase si ya existe.
 * Ej: "historia clinica" -> "HistoriaClinica", "CitaMedica" -> "CitaMedica".
 */
export const toPascalCase = (raw: string): string => {
  const clean = raw.replace(/[^a-zA-Z0-9_\s]/g, '').trim();
  if (!clean) return 'ClaseNueva';
  if (!/\s/.test(clean)) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + (word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1)))
    .join('');
};

/**
 * Convierte un nombre a camelCase válido preservando mayúsculas internas.
 * Ej: "registrarConsulta" -> "registrarConsulta", "fecha de nacimiento" -> "fechaDeNacimiento".
 */
export const toCamelCase = (raw: string): string => {
  const clean = raw.replace(/[^a-zA-Z0-9_\s]/g, '').trim();
  if (!clean) return 'campo';
  if (!/\s/.test(clean)) {
    return clean.charAt(0).toLowerCase() + clean.slice(1);
  }
  const pascal = toPascalCase(clean);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

/**
 * Mapea términos cotidianos en español al tipo de datos estándar de UML.
 */
export const mapUmlType = (rawType: string): string => {
  const t = rawType.trim().toLowerCase();
  if (/^(int|entero|numerico|numero|entera)$/i.test(t)) return 'Integer';
  if (/^(long|entero largo|grande)$/i.test(t)) return 'Long';
  if (/^(string|str|texto|cadena|caracteres|nombre|descripcion)$/i.test(t)) return 'String';
  if (/^(bool|boolean|booleano|logico)$/i.test(t)) return 'Boolean';
  if (/^(double|float|decimal|flotante|real|precio|monto)$/i.test(t)) return 'Double';
  if (/^(date|fecha)$/i.test(t)) return 'Date';
  if (/^(datetime|timestamp|fecha y hora|fechahora)$/i.test(t)) return 'DateTime';
  if (/^(void|vacio|sin retorno|nada)$/i.test(t)) return 'void';
  return toPascalCase(rawType) || 'String';
};

/**
 * Parser determinista para procesar comandos en lenguaje natural en español cuando
 * la IA externa no está disponible o para validación local rápida.
 */
export function parseVoiceCommandLocal(
  rawText: string,
  _existingClasses: string[] = [],
): VoiceCommandAction {
  const norm = normalizeText(rawText);
  if (!norm) {
    return { type: 'UNKNOWN', rawText, reason: 'Comando vacío' };
  }

  // 1. ELIMINAR CLASE: "eliminar clase Paciente", "borrar la clase Medico"
  const deleteMatch = norm.match(/^(?:eliminar|borrar|quitar)(?:\s+la)?\s+clase\s+([a-zA-Z0-9_\s]+)$/i);
  if (deleteMatch) {
    const className = toPascalCase(deleteMatch[1]);
    return { type: 'DELETE_CLASS', className };
  }

  // 2. HERENCIA DIRECTA: "Paciente hereda de Persona"
  const inheritsMatch = norm.match(/^([a-zA-Z0-9_\s]+)\s+hereda\s+de\s+([a-zA-Z0-9_\s]+)$/i);
  if (inheritsMatch) {
    const source = toPascalCase(inheritsMatch[1]);
    const target = toPascalCase(inheritsMatch[2]);
    return {
      type: 'CREATE_RELATION',
      sourceName: source,
      targetName: target,
      relationshipType: 'INHERITANCE',
    };
  }

  // 3. CONECTAR / RELACIONAR CLASES: "conectar Paciente con Medico [como tipo]"
  const connectMatch = norm.match(
    /^(?:conectar|relacionar|asociar|unir)\s+(?:la\s+clase\s+)?([a-zA-Z0-9_]+)\s+con\s+(?:la\s+clase\s+)?([a-zA-Z0-9_]+)(?:\s+(?:como|por|tipo|de\s+tipo)\s+([a-zA-Z0-9_\s]+))?$/i,
  );
  if (connectMatch) {
    const source = toPascalCase(connectMatch[1]);
    const target = toPascalCase(connectMatch[2]);
    const rawRelType = connectMatch[3] ? connectMatch[3].toLowerCase() : 'asociacion';

    let relationshipType: UMLRelationshipType = 'ASSOCIATION';
    if (rawRelType.includes('herencia') || rawRelType.includes('generalizacion')) {
      relationshipType = 'INHERITANCE';
    } else if (rawRelType.includes('composicion')) {
      relationshipType = 'COMPOSITION';
    } else if (rawRelType.includes('agregacion')) {
      relationshipType = 'AGGREGATION';
    } else if (rawRelType.includes('dependencia')) {
      relationshipType = 'DEPENDENCY';
    } else if (rawRelType.includes('realizacion') || rawRelType.includes('implementacion')) {
      relationshipType = 'REALIZATION';
    }

    return {
      type: 'CREATE_RELATION',
      sourceName: source,
      targetName: target,
      relationshipType,
      sourceMultiplicity: relationshipType === 'ASSOCIATION' ? '1' : undefined,
      targetMultiplicity: relationshipType === 'ASSOCIATION' ? '1..*' : undefined,
    };
  }

  // 4. AGREGAR ATRIBUTO: "agregar atributo nombre de tipo String a [la clase] Paciente"
  //    o "en Paciente agregar atributo/campo nombre tipo String"
  const addAttrMatch1 = norm.match(
    /^(?:agregar|crear|anadir)\s+(?:el\s+)?(?:atributo|campo|propiedad)\s+([a-zA-Z0-9_]+)(?:\s+(?:de\s+tipo|tipo)\s+([a-zA-Z0-9_]+))?\s+a\s+(?:la\s+clase\s+)?([a-zA-Z0-9_]+)$/i,
  );
  if (addAttrMatch1) {
    const attrName = toCamelCase(addAttrMatch1[1]);
    const attrType = mapUmlType(addAttrMatch1[2] || 'String');
    const className = toPascalCase(addAttrMatch1[3]);
    return {
      type: 'ADD_ATTRIBUTE',
      className,
      attribute: { name: attrName, type: attrType, visibility: '+' },
    };
  }

  const addAttrMatch2 = norm.match(
    /^en\s+(?:la\s+clase\s+)?([a-zA-Z0-9_]+)\s+(?:agregar|crear|anadir)\s+(?:el\s+)?(?:atributo|campo|propiedad)\s+([a-zA-Z0-9_]+)(?:\s+(?:de\s+tipo|tipo)\s+([a-zA-Z0-9_]+))?$/i,
  );
  if (addAttrMatch2) {
    const className = toPascalCase(addAttrMatch2[1]);
    const attrName = toCamelCase(addAttrMatch2[2]);
    const attrType = mapUmlType(addAttrMatch2[3] || 'String');
    return {
      type: 'ADD_ATTRIBUTE',
      className,
      attribute: { name: attrName, type: attrType, visibility: '+' },
    };
  }

  // 5. AGREGAR MÉTODO: "agregar metodo registrar de tipo void a Paciente"
  const addMethodMatch = norm.match(
    /^(?:agregar|crear|anadir)\s+(?:el\s+)?(?:metodo|funcion|operacion)\s+([a-zA-Z0-9_]+)(?:\s+(?:con\s+retorno|de\s+tipo|retorno)\s+([a-zA-Z0-9_]+))?\s+a\s+(?:la\s+clase\s+)?([a-zA-Z0-9_]+)$/i,
  );
  if (addMethodMatch) {
    const methodName = toCamelCase(addMethodMatch[1]);
    const returnType = mapUmlType(addMethodMatch[2] || 'void');
    const className = toPascalCase(addMethodMatch[3]);
    return {
      type: 'ADD_METHOD',
      className,
      method: { name: methodName, returnType, visibility: '+' },
    };
  }

  // 6. CREAR CLASE: "crear clase Paciente [con atributos...]" o "nueva clase abstracta Persona"
  const createClassMatch = norm.match(
    /^(?:crear|nueva|agregar|definir)\s+(?:una\s+)?(?:(clase\s+abstracta|interfaz|clase))\s+([a-zA-Z0-9_]+)(?:\s+con\s+(?:atributos|campos)\s+(.+))?$/i,
  );
  if (createClassMatch) {
    const kind = createClassMatch[1].toLowerCase();
    const name = toPascalCase(createClassMatch[2]);
    const isAbstract = kind.includes('abstracta');
    const isInterface = kind.includes('interfaz');
    const rawAttrs = createClassMatch[3];

    const attributes: Array<{ name: string; type: string; isPrimaryKey?: boolean }> = [];
    if (rawAttrs) {
      // Divide por comas o por la palabra "y" (rodeada de espacios)
      const parts = rawAttrs.split(/,|\s+\by\b\s+/);
      for (const part of parts) {
        const p = part.trim();
        if (!p) continue;
        // ej: "id entero" o "nombre de tipo string" o "fecha date"
        const fieldMatch = p.match(/^([a-zA-Z0-9_]+)(?:\s+(?:de\s+tipo|tipo)?\s*([a-zA-Z0-9_]+))?$/i);
        if (fieldMatch) {
          const fName = toCamelCase(fieldMatch[1]);
          const fType = mapUmlType(fieldMatch[2] || 'String');
          const isPk = fName.toLowerCase() === 'id' || fName.toLowerCase().endsWith('id');
          attributes.push({ name: fName, type: fType, isPrimaryKey: isPk });
        }
      }
    }

    return {
      type: 'CREATE_CLASS',
      name,
      isAbstract,
      isInterface,
      attributes: attributes.length > 0 ? attributes : undefined,
    };
  }

  // 7. Frase corta: "clase Consulta"
  const shortClassMatch = norm.match(/^clase\s+([a-zA-Z0-9_]+)$/i);
  if (shortClassMatch) {
    return {
      type: 'CREATE_CLASS',
      name: toPascalCase(shortClassMatch[1]),
    };
  }

  return {
    type: 'UNKNOWN',
    rawText,
    reason: 'No se reconoció un comando UML válido en la instrucción.',
  };
}
