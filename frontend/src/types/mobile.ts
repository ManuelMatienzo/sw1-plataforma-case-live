export type MobileInputType = 'text' | 'number' | 'date' | 'datetime-local' | 'checkbox';
export interface MobileField { name: string; label: string; umlType: string; inputType: MobileInputType; required: boolean }
export interface MobileEntity { name: string; route: string; fields: readonly MobileField[] }
export interface MobileConfig {
  name: string; shortName: string; backgroundColor: string; themeColor: string;
  version: string; backendBaseUrl: string; entities: readonly MobileEntity[];
}
export interface MobileGeneratedFile { path: string; content: string; mimeType: string; encoding?: 'base64' }
export interface MobileAccess { url: string; appId: string; secureContext: boolean; note: string }
export interface MobileAppResult {
  appId: string; config: MobileConfig; files: MobileGeneratedFile[];
  summary: { entitiesCount: number; filesCount: number }; access: MobileAccess;
}
export type MobileRecord = Record<string, unknown> & { id: string | number; syncStatus?: 'PENDING' | 'SYNCED' };
export interface OutboxItem {
  id: string; action: 'CREATE' | 'UPDATE' | 'DELETE'; entity: string;
  payload: MobileRecord; timestamp: string; status: 'PENDING' | 'SYNCED';
}
export type MobileScreen = 'list' | 'detail' | 'form';
export interface NluResult {
  intent: 'COUNT_RECORDS' | 'SEARCH_RECORDS' | 'CREATE_RECORD' | 'NAVIGATE_SCREEN' | 'HELP' | 'CLARIFY' | 'UNKNOWN';
  reply: string; entity?: string; slots?: Record<string, unknown>; matches?: MobileRecord[];
  query?: string; screen?: MobileScreen;
}
