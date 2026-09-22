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
