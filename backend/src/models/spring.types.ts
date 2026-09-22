export interface SpringProjectOptions {
  packageName: string;
  groupId: string;
  artifactId: string;
  port: number;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}

export type GeneratedFileCategory =
  | 'entity'
  | 'repository'
  | 'service'
  | 'controller'
  | 'dto'
  | 'config'
  | 'test'
  | 'postman';

export interface GeneratedFile {
  path: string;
  name: string;
  content: string;
  category: GeneratedFileCategory;
}

export interface SpringProjectResult {
  files: GeneratedFile[];
  zipBuffer: Buffer;
  postmanCollection: object;
  summary: {
    entitiesCount: number;
    endpointsCount: number;
    filesCount: number;
  };
}

export type RunnerStatus = 'IDLE' | 'COMPILING' | 'STARTING' | 'RUNNING' | 'STOPPED' | 'ERROR';

export interface RunnerInfo {
  sesionId: string;
  status: RunnerStatus;
  port: number | null;
  baseUrl: string | null;
  pid: number | null;
  startedAt: string | null;
  error: string | null;
}
