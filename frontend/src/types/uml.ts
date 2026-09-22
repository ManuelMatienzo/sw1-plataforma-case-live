export type UMLVisibility = '+' | '-' | '#' | '~';
export interface UMLParameter { name: string; type: string }
export interface UMLAttribute {
  id: string; name: string; type: string; visibility: UMLVisibility;
  isPrimaryKey?: boolean; isNullable?: boolean; isUnique?: boolean; defaultValue?: string;
}
export interface UMLMethod {
  id: string; name: string; returnType: string; visibility: UMLVisibility;
  parameters: UMLParameter[]; isAbstract?: boolean; isStatic?: boolean;
}
export interface UMLClass {
  id: string; name: string; isAbstract: boolean; isInterface: boolean;
  attributes: UMLAttribute[]; methods: UMLMethod[]; position: { x: number; y: number };
  width?: number; height?: number; comment?: string;
}
export type UMLRelationshipType = 'ASSOCIATION' | 'AGGREGATION' | 'COMPOSITION' | 'INHERITANCE' | 'REALIZATION' | 'DEPENDENCY';
export type UMLMultiplicity = '1' | '0..1' | '1..*' | '0..*' | '*';
export interface UMLRelationship {
  id: string; sourceClassId: string; targetClassId: string; type: UMLRelationshipType;
  sourceMultiplicity?: UMLMultiplicity; targetMultiplicity?: UMLMultiplicity;
  sourceRole?: string; targetRole?: string; name?: string; isOrthogonal?: boolean;
}
export interface UMLDiagramAST { id?: string; nombre?: string; version: number; classes: UMLClass[]; relationships: UMLRelationship[] }
export interface DiagramResponse { diagram: UMLDiagramAST; canEdit: boolean; proyectoNombre: string; sesionNombre: string }
export const relationshipLabels: Record<UMLRelationshipType, string> = {
  ASSOCIATION: 'Asociación', AGGREGATION: 'Agregación', COMPOSITION: 'Composición',
  INHERITANCE: 'Herencia', REALIZATION: 'Realización', DEPENDENCY: 'Dependencia',
};
export const umlTypes = [
  'String',
  'Integer',
  'Long',
  'Boolean',
  'Double',
  'Float',
  'Date',
  'DateTime',
  'LocalDate',
  'LocalDateTime',
  'BigDecimal',
  'UUID',
  'byte[]',
  'void',
];
