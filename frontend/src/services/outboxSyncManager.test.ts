import { describe, expect, it, vi } from 'vitest';
import { OutboxSyncManager } from './outboxSyncManager';

const entities = [{ name: 'Paciente', route: 'pacientes', fields: [] }] as const;
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
const setup = (online = false, fetcher = vi.fn()) => new OutboxSyncManager({
  namespace: 'test', entities, storage: storage(), backendBaseUrl: 'http://localhost:8080/api/v1',
  online, fetcher: fetcher as typeof fetch,
});

describe('Outbox local de CU-16', () => {
  it('crea registros offline y persiste cambios pendientes', () => {
    const manager = setup();
    manager.create('Paciente', { nombre: 'Ana' });
    expect(manager.list('Paciente')).toHaveLength(1);
    expect(manager.pending()).toMatchObject([{ action: 'CREATE', status: 'PENDING' }]);
  });
  it('sincroniza CREATE y UPDATE en orden y remapea el ID temporal', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 42 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 42 }) });
    const manager = setup(false, fetcher);
    const record = manager.create('Paciente', { nombre: 'Ana' });
    manager.update('Paciente', record.id, { nombre: 'Ana María' });
    manager.setOnline(true);
    await manager.sync();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toMatch(/\/pacientes\/42$/);
    expect(manager.list('Paciente')[0].id).toBe(42);
    expect(manager.pending()).toHaveLength(0);
  });
  it('conserva la cola si hay conflicto HTTP 409', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    const manager = setup(false, fetcher);
    manager.create('Paciente', { nombre: 'Ana' });
    manager.setOnline(true);
    await manager.sync();
    expect(manager.pending()).toHaveLength(1);
    expect(manager.error).toMatch(/conflicto/i);
  });
  it('envía DELETE al endpoint del registro', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 42 }) })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
    const manager = setup(false, fetcher);
    const record = manager.create('Paciente', { nombre: 'Ana' });
    manager.setOnline(true);
    await manager.sync();
    expect(record.id).toBeDefined();
    manager.setOnline(false);
    manager.remove('Paciente', 42);
    manager.setOnline(true);
    await manager.sync();
    expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('/pacientes/42'), expect.objectContaining({ method: 'DELETE' }));
  });
  it('recupera el outbox de localStorage tras recrear el gestor', () => {
    const store = storage();
    const options = { namespace: 'persistencia', entities, storage: store, backendBaseUrl: '', online: false, fetcher: vi.fn() as typeof fetch };
    new OutboxSyncManager(options).create('Paciente', { nombre: 'Ana' });
    expect(new OutboxSyncManager(options).pending()).toHaveLength(1);
  });
});
