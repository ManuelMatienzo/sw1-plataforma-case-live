import { UMLClass, UMLRelationshipType } from '../types/uml';
import { VoiceCommandAction } from '../types/ai';

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
 * Convierte un nombre en PascalCase válido.
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
 * Convierte un nombre a camelCase válido.
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
 * Parser determinista local para comandos de modelado por voz o texto en español.
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
      const parts = rawAttrs.split(/,|\s+\by\b\s+/);
      for (const part of parts) {
        const p = part.trim();
        if (!p) continue;
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

/**
 * Calcula una posición inteligente sin solapamientos para una nueva clase en el lienzo.
 */
export function calculateNextClassPosition(
  existingClasses: UMLClass[],
  viewport?: { x: number; y: number; scale: number },
  containerWidth = 800,
  containerHeight = 600,
): { x: number; y: number } {
  const scale = viewport?.scale || 1;
  const vx = viewport?.x || 0;
  const vy = viewport?.y || 0;

  // Centro visible en coordenadas del lienzo
  const centerX = Math.round((containerWidth / 2 - vx) / scale);
  const centerY = Math.round((containerHeight / 2 - vy) / scale);

  const cardWidth = 220;
  const cardHeight = 160;
  const gapX = 40;
  const gapY = 40;
  const stepX = cardWidth + gapX;
  const stepY = cardHeight + gapY;

  // Si no hay clases, poner cerca del centro visible
  if (existingClasses.length === 0) {
    return {
      x: Math.max(40, centerX - cardWidth / 2),
      y: Math.max(40, centerY - cardHeight / 2),
    };
  }

  // Buscar el primer punto en una rejilla alrededor del centro que no colisione
  const maxAttempts = 50;
  const columns = 3;

  for (let i = 0; i < maxAttempts; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    const candidateX = centerX - (columns * stepX) / 2 + col * stepX;
    const candidateY = Math.max(40, centerY - stepY + row * stepY);

    // Verificar si colisiona con alguna clase existente
    const collides = existingClasses.some(c => {
      const dx = Math.abs(c.position.x - candidateX);
      const dy = Math.abs(c.position.y - candidateY);
      return dx < cardWidth && dy < cardHeight;
    });

    if (!collides) {
      return {
        x: Math.round(candidateX),
        y: Math.round(candidateY),
      };
    }
  }

  // Fallback si la rejilla está muy poblada: colocar con desplazamiento de la última
  const last = existingClasses[existingClasses.length - 1];
  return {
    x: last.position.x + 60,
    y: last.position.y + 60,
  };
}
