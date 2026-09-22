export type GeneratedFileCategory = 'entity' | 'repository' | 'service' | 'controller' | 'dto' | 'config' | 'test' | 'postman';

export interface GeneratedFile {
  path: string;
  name: string;
  content: string;
  category: GeneratedFileCategory;
}

export interface PostmanRequestItem {
  name: string;
  request: {
    method: string;
    body?: { raw?: string };
    url: { raw: string };
  };
}

export interface PostmanFolder { name: string; item: PostmanRequestItem[] }

export interface PostmanCollection {
  info: { name: string; schema: string; description?: string };
  variable: Array<{ key: string; value: string }>;
  item: PostmanFolder[];
}

export interface SpringProjectResult {
  files: GeneratedFile[];
  postmanCollection: PostmanCollection;
  summary: { entitiesCount: number; endpointsCount: number; filesCount: number };
  generatedAt?: string;
}

export type RunnerStatus = 'IDLE' | 'COMPILING' | 'STARTING' | 'RUNNING' | 'STOPPED' | 'ERROR';

export interface RunnerSnapshot {
  sesionId: string;
  status: RunnerStatus;
  port: number | null;
  baseUrl: string | null;
  pid: number | null;
  startedAt: string | null;
  error: string | null;
  logs: string[];
}
