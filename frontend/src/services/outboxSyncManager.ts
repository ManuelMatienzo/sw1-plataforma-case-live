import type { MobileEntity, MobileRecord, OutboxItem } from '../types/mobile';
import { createClientId } from '../utils/uuid';

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface ManagerState { records: Record<string, MobileRecord[]>; outbox: OutboxItem[] }
interface ManagerOptions {
  namespace: string;
  entities: readonly MobileEntity[];
  storage?: StorageLike;
  backendBaseUrl: string;
  online?: boolean;
  fetcher?: typeof fetch;
  onChange?: () => void;
}

export class OutboxSyncManager {
  private readonly key: string;
  private readonly entities: readonly MobileEntity[];
  private readonly storage: StorageLike;
  private readonly fetcher: typeof fetch;
  private readonly onChange: () => void;
  private state: ManagerState;
  private online: boolean;
  private backendBaseUrl: string;
  private syncing: Promise<void> | null = null;
  error = '';

  constructor(options: ManagerOptions) {
    this.key = 'case-mobile-v1:' + options.namespace;
    this.entities = options.entities;
    this.storage = options.storage ?? localStorage;
    this.fetcher = options.fetcher ?? fetch;
    this.onChange = options.onChange ?? (() => undefined);
    this.online = options.online ?? navigator.onLine;
    this.backendBaseUrl = options.backendBaseUrl.replace(/\/$/, '');
    try {
      const raw = this.storage.getItem(this.key);
      this.state = raw ? JSON.parse(raw) as ManagerState : { records: {}, outbox: [] };
    } catch { this.state = { records: {}, outbox: [] }; }
    if (!this.state.records || !Array.isArray(this.state.outbox)) this.state = { records: {}, outbox: [] };
    for (const entity of this.entities) this.state.records[entity.name] ??= [];
  }

  get isOnline(): boolean { return this.online; }
  get records(): Record<string, MobileRecord[]> { return this.state.records; }
  list(entity: string): MobileRecord[] { return this.state.records[entity] ?? []; }
  pending(): OutboxItem[] { return this.state.outbox.filter((item) => item.status === 'PENDING'); }

  private persist() {
    this.storage.setItem(this.key, JSON.stringify(this.state));
    this.onChange();
  }

  private enqueue(action: OutboxItem['action'], entity: string, payload: MobileRecord) {
    this.state.outbox.push({ id: createClientId(), action, entity, payload: { ...payload }, timestamp: new Date().toISOString(), status: 'PENDING' });
    this.persist();
    if (this.online) void this.sync();
  }

  create(entity: string, payload: Record<string, unknown>): MobileRecord {
    if (!this.state.records[entity]) throw new Error('Entidad no disponible');
    const record: MobileRecord = { ...payload, id: createClientId(), syncStatus: 'PENDING' };
    this.state.records[entity].push(record);
    this.enqueue('CREATE', entity, record);
    return record;
  }

  update(entity: string, id: string | number, payload: Record<string, unknown>): MobileRecord {
    const list = this.list(entity);
    const index = list.findIndex((item) => String(item.id) === String(id));
    if (index < 0) throw new Error('Registro no encontrado');
    const record: MobileRecord = { ...list[index], ...payload, syncStatus: 'PENDING' };
    list[index] = record;
    this.enqueue('UPDATE', entity, record);
    return record;
  }

  remove(entity: string, id: string | number): void {
    const list = this.list(entity);
    const index = list.findIndex((item) => String(item.id) === String(id));
    if (index < 0) throw new Error('Registro no encontrado');
    const [record] = list.splice(index, 1);
    this.enqueue('DELETE', entity, record);
  }

  discardPending(id: string): void {
    const index = this.state.outbox.findIndex((item) => item.id === id && item.status === 'PENDING');
    if (index < 0) return;
    const [item] = this.state.outbox.splice(index, 1);
    if (item.action === 'CREATE') {
      this.state.records[item.entity] = this.list(item.entity).filter((record) => String(record.id) !== String(item.payload.id));
    }
    this.error = '';
    this.persist();
  }

  setOnline(value: boolean) {
    this.online = value;
    this.onChange();
    if (value) void this.sync();
  }

  setBackendBaseUrl(url: string) {
    this.backendBaseUrl = url.replace(/\/$/, '');
    if (this.online) void this.sync();
  }

  attachConnectivity(browser: Window = window): () => void {
    const onOnline = () => this.setOnline(true);
    const onOffline = () => this.setOnline(false);
    browser.addEventListener('online', onOnline);
    browser.addEventListener('offline', onOffline);
    return () => { browser.removeEventListener('online', onOnline); browser.removeEventListener('offline', onOffline); };
  }

  sync(): Promise<void> {
    if (this.syncing) return this.syncing;
    if (!this.online || !this.backendBaseUrl) return Promise.resolve();
    this.syncing = this.flush().finally(() => { this.syncing = null; this.onChange(); });
    return this.syncing;
  }

  private async flush(): Promise<void> {
    for (const item of this.pending()) {
      const descriptor = this.entities.find((entity) => entity.name === item.entity);
      if (!descriptor) { this.error = 'Entidad desconocida en la cola'; break; }
      const oldId = item.payload.id;
      const url = this.backendBaseUrl + '/' + descriptor.route + (item.action === 'CREATE' ? '' : '/' + encodeURIComponent(String(oldId)));
      const body: Record<string, unknown> = { ...item.payload };
      delete body.id; delete body.syncStatus;
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: item.action === 'CREATE' ? 'POST' : item.action === 'UPDATE' ? 'PUT' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: item.action === 'DELETE' ? undefined : JSON.stringify(body),
        });
      } catch { this.error = 'Backend no disponible. Los cambios siguen pendientes.'; break; }
      if (!response.ok) {
        this.error = response.status === 409 ? 'Conflicto de sincronización. Revisa los cambios pendientes.' : 'Error HTTP ' + response.status;
        break;
      }
      if (item.action === 'CREATE') {
        const remote = await response.json() as { id?: string | number };
        if (remote.id !== undefined) {
          const record = this.list(item.entity).find((entry) => String(entry.id) === String(oldId));
          if (record) record.id = remote.id;
          for (const later of this.pending()) {
            if (later.entity === item.entity && String(later.payload.id) === String(oldId)) later.payload.id = remote.id;
          }
        }
      }
      item.status = 'SYNCED';
      const record = this.list(item.entity).find((entry) => String(entry.id) === String(item.payload.id));
      if (record && !this.pending().some((later) => later.entity === item.entity && String(later.payload.id) === String(record.id))) record.syncStatus = 'SYNCED';
      this.error = '';
      this.persist();
    }
  }
}
