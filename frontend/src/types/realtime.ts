import type { UMLAttribute, UMLClass, UMLMethod, UMLRelationship } from './uml';

export type ParticipantPermission = 'SOLO_LECTURA' | 'EDICION_COMPLETA';
export interface PermissionUpdatedEvent { userId: string; permission: ParticipantPermission; canEdit: boolean }
export interface SessionKickedEvent { message: string }

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

export type AppliedDiagramOperation = DiagramOperation & {
  actor: { userId: string; name: string; color: string };
  serverSequence: number;
  timestamp: string;
};
export interface PresenceUser {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  role: 'ANFITRION' | 'COLABORADOR';
  permission: 'SOLO_LECTURA' | 'EDICION_PARCIAL' | 'EDICION_COMPLETA';
  canEdit: boolean;
  cursor?: { x: number; y: number };
}
export interface RemoteCursor {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
}
export interface DiagramConflict {
  target: string;
  previous: { userId: string; name: string };
  winner: { userId: string; name: string };
  timestamp: string;
}
