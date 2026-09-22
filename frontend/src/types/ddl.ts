import { InheritanceStrategy } from './dataModel';

export interface PostgresDdlOptions {
  inheritanceStrategy?: InheritanceStrategy;
  pluralize?: boolean;
  includeDropTable?: boolean;
  ifNotExists?: boolean;
  includeComments?: boolean;
  schema?: string;
}

export interface PostgresDdlResult {
  sql: string;
  tablesCount: number;
  relationshipsCount: number;
  indicesCount: number;
  generatedAt: string;
  options: PostgresDdlOptions;
  filename: string;
}
