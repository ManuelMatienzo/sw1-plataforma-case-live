export type UMLVisibility = '+' | '-' | '#' | '~';

export interface UMLParameter {
  name: string;
  type: string;
}

export interface UMLAttribute {
  id: string;
  name: string;
  type: string; // 'String' | 'Integer' | 'Long' | 'Boolean' | 'Double' | 'LocalDate' | 'LocalDateTime' | etc.
  visibility: UMLVisibility;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
}

export interface UMLMethod {
  id: string;
  name: string;
  returnType: string;
  visibility: UMLVisibility;
  parameters: UMLParameter[];
  isAbstract?: boolean;
  isStatic?: boolean;
}

export interface UMLClass {
  id: string;
  name: string;
  isAbstract: boolean;
  isInterface: boolean;
  attributes: UMLAttribute[];
  methods: UMLMethod[];
  position: {
    x: number;
    y: number;
  };
  width?: number;
  height?: number;
  comment?: string;
}

export type UMLRelationshipType = 
  | 'ASSOCIATION'       // Asociación simple
  | 'AGGREGATION'       // Agregación (rombo blanco)
  | 'COMPOSITION'       // Composición (rombo relleno)
  | 'INHERITANCE'       // Herencia / Generalización (triángulo blanco)
  | 'REALIZATION'       // Realización / Implementación de interfaz (línea punteada + triángulo)
  | 'DEPENDENCY';       // Dependencia (línea punteada con flecha)

export type UMLMultiplicity = '1' | '0..1' | '1..*' | '0..*' | '*';

export interface UMLRelationship {
  id: string;
  sourceClassId: string;
  targetClassId: string;
  type: UMLRelationshipType;
  sourceMultiplicity?: UMLMultiplicity;
  targetMultiplicity?: UMLMultiplicity;
  sourceRole?: string;
  targetRole?: string;
  name?: string;
  isOrthogonal?: boolean;
}

export interface UMLDiagramAST {
  id?: string;
  nombre?: string;
  version: number;
  classes: UMLClass[];
  relationships: UMLRelationship[];
}
