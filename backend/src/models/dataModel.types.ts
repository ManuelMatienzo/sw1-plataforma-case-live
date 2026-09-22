export type InheritanceStrategy = 'TPS' | 'TPH' | 'TPC';

export interface RelationalForeignKeyTarget {
  tableName: string;
  columnName: string;
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface RelationalColumn {
  id: string;
  name: string;
  sqlType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  foreignKeyTarget?: RelationalForeignKeyTarget;
  sourceAttributeName?: string;
  description?: string;
}

import { UMLRelationshipType } from './uml.types';

export interface RelationalForeignKey {
  name: string;
  columnName: string;
  targetTable: string;
  targetColumn: string;
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  relationshipType: UMLRelationshipType | string;
}

export interface RelationalIndex {
  name: string;
  tableName: string;
  columns: string[];
  isUnique: boolean;
  reason: string;
}

export interface RelationalTable {
  id: string;
  name: string; // snake_case
  displayName: string;
  sourceClassId?: string;
  sourceClassName?: string;
  isJunctionTable: boolean;
  columns: RelationalColumn[];
  foreignKeys: RelationalForeignKey[];
  indices: RelationalIndex[];
  description?: string;
}

export interface NormalizationViolation {
  level: '1FN' | '2FN' | '3FN';
  tableName: string;
  description: string;
  suggestion: string;
}

export interface NormalizationReport {
  is1FN: boolean;
  is2FN: boolean;
  is3FN: boolean;
  enForma3FN: boolean;
  violations: NormalizationViolation[];
  strengths: string[];
}

export interface VirtualDataEngineerRecommendation {
  type: 'INDEX' | 'CONSTRAINT' | 'STORAGE' | 'CARDINALITY';
  tableName: string;
  message: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DataModelResult {
  tables: RelationalTable[];
  inheritanceStrategy: InheritanceStrategy;
  summary: {
    totalTables: number;
    totalColumns: number;
    totalForeignKeys: number;
    totalIndices: number;
    junctionTablesCount: number;
  };
  mermaidErDiagram: string;
  normalizationReport: NormalizationReport;
  recommendations: VirtualDataEngineerRecommendation[];
}
