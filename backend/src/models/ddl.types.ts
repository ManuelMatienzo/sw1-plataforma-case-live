import { InheritanceStrategy } from './dataModel.types';

export interface PostgresDdlOptions {
  includeDropTable?: boolean;
  ifNotExists?: boolean;
  includeComments?: boolean;
  includeIndices?: boolean;
  pluralize?: boolean;
  inheritanceStrategy?: InheritanceStrategy;
  schemaName?: string;
}

export interface PostgresDdlResult {
  sql: string;
  tablesCount: number;
  foreignKeysCount: number;
  indicesCount: number;
  options: PostgresDdlOptions;
  generatedAt: string;
  filename: string;
}
