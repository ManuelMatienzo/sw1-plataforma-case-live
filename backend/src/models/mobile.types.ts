export type MobileInputType = 'text' | 'number' | 'date' | 'datetime-local' | 'checkbox';

export interface MobileEntityField {
  name: string;
  label: string;
  umlType: string;
  inputType: MobileInputType;
  required: boolean;
}

export interface MobileEntity {
  name: string;
  route: string;
  fields: MobileEntityField[];
}

export interface MobileAppConfig {
  name: string;
  shortName: string;
  backgroundColor: '#0b0e14';
  themeColor: '#3b82f6';
  version: string;
  backendBaseUrl: string;
  entities: MobileEntity[];
}

export interface MobileGeneratedFile {
  path: string;
  content: string;
  mimeType: string;
  encoding?: 'base64';
}

export interface MobileAppResult {
  appId: string;
  config: MobileAppConfig;
  files: MobileGeneratedFile[];
  zipBuffer: Buffer;
  summary: { entitiesCount: number; filesCount: number };
}

export interface OutboxItem {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  payload: Record<string, unknown>;
  timestamp: string;
  status: 'PENDING' | 'SYNCED';
}
