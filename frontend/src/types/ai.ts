import { UMLDiagramAST, UMLMultiplicity, UMLRelationshipType } from './uml';
import { UmlValidationReport } from './validation';

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

export interface PhotoImportSummary {
  classes: number;
  interfaces: number;
  attributes: number;
  methods: number;
  relationships: number;
}

export interface PhotoImportResult {
  diagram: UMLDiagramAST;
  summary: PhotoImportSummary;
  warnings: string[];
  validationReport: UmlValidationReport;
  source?: 'gemini_vision' | 'deterministic_fallback';
}
