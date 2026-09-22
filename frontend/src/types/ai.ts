import { UMLMultiplicity, UMLRelationshipType } from './uml';

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

export interface InterpretCommandResult {
  action: VoiceCommandAction;
  transcript: string;
  source: 'gemini' | 'local_fallback';
}
