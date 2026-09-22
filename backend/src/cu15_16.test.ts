import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { UMLDiagramAST } from './models/uml.types';
import { MobileAppService, detectLanAddress, mobileAccessUrl } from './services/mobileAppService';

const diagram: UMLDiagramAST = {
  version: 1,
  nombre: 'Clínica Integral',
  classes: [
    { id: 'p', name: 'Paciente', isAbstract: false, isInterface: false, position: { x: 0, y: 0 }, methods: [],
      attributes: [
        { id: 'p-n', name: 'nombre', type: 'String', visibility: '+', isNullable: false },
        { id: 'p-c', name: 'ci', type: 'String', visibility: '+' },
        { id: 'p-e', name: 'edad', type: 'Integer', visibility: '+' },
      ] },
    { id: 'c', name: 'Consulta', isAbstract: false, isInterface: false, position: { x: 300, y: 0 }, methods: [],
      attributes: [{ id: 'c-f', name: 'fecha', type: 'Date', visibility: '+' }] },
  ],
  relationships: [],
};

const file = (result: Awaited<ReturnType<MobileAppService['generate']>>, path: string) =>
  result.files.find((item) => item.path === path)?.content ?? '';

test('CU-15: deriva entidades y campos CRUD del AST sin duplicar id', async () => {
  const result = await new MobileAppService().generate(diagram);
  assert.deepEqual(result.config.entities.map((item) => item.name), ['Paciente', 'Consulta']);
  assert.deepEqual(result.config.entities[0].fields.map((item) => item.name), ['nombre', 'ci', 'edad']);
  assert.equal(result.config.entities[0].fields[2].inputType, 'number');
  assert.equal(result.config.entities[1].fields[0].inputType, 'date');
});

test('CU-15: produce manifest instalable e iconos locales', async () => {
  const result = await new MobileAppService().generate(diagram);
  const manifest = JSON.parse(file(result, 'manifest.webmanifest')) as any;
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.background_color, '#0b0e14');
  assert.ok(manifest.icons.some((icon: any) => icon.src === './icon.svg'));
  assert.ok(manifest.icons.some((icon: any) => icon.src === './icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon: any) => icon.src === './icon-512.png' && icon.sizes === '512x512'));
  assert.match(file(result, 'icon.svg'), /<svg/);
  const icon = result.files.find((item) => item.path === 'icon-192.png');
  assert.equal(icon?.encoding, 'base64');
  assert.deepEqual([...Buffer.from(icon?.content ?? '', 'base64').subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('CU-15: Service Worker precachea shell y evita cachear la API', async () => {
  const result = await new MobileAppService().generate(diagram);
  const worker = file(result, 'sw.js');
  assert.match(worker, /cache\.addAll/);
  assert.match(worker, /\/api\/v1\//);
  assert.match(worker, /fetch\.respondWith|respondWith/);
});

test('CU-15: HTML y app JS contienen navegación, búsqueda, detalle y formularios táctiles', async () => {
  const result = await new MobileAppService().generate(diagram);
  assert.match(file(result, 'index.html'), /name="viewport"/);
  assert.match(file(result, 'index.html'), /rel="manifest"/);
  assert.match(file(result, 'app.js'), /renderList/);
  assert.match(file(result, 'app.js'), /renderDetail/);
  assert.match(file(result, 'app.js'), /renderForm/);
  assert.match(file(result, 'app.js'), /bottom-nav/);
  assert.match(file(result, 'app.css'), /44px/);
});

test('CU-16: el paquete incluye NLU y outbox locales sin servicios externos', async () => {
  const result = await new MobileAppService().generate(diagram);
  assert.match(file(result, 'nluEngine.js'), /COUNT_RECORDS/);
  assert.match(file(result, 'nluEngine.js'), /CREATE_RECORD/);
  assert.match(file(result, 'syncManager.js'), /localStorage/);
  assert.match(file(result, 'syncManager.js'), /PENDING/);
  assert.match(file(result, 'app.js'), /processLocally/);
  assert.doesNotMatch(result.files.map((item) => item.content).join('\n'), /openai\.com|generativelanguage\.googleapis\.com/);
});

test('CU-16: PWA permite preparar voz local y resolver una cola en conflicto sin exigir síntesis', async () => {
  const result = await new MobileAppService().generate(diagram);
  const source = file(result, 'app.js');
  assert.match(source, /Recognition\.install/);
  assert.match(source, /manager\.error/);
  assert.match(source, /manager\.discard/);
  assert.match(source, /typeof speechSynthesis|window\.speechSynthesis/);
});

test('CU-16: NLU generado interpreta conteo, búsqueda y creación con los campos del dominio', async () => {
  const generated = await new MobileAppService().generate(diagram);
  const source = file(generated, 'nluEngine.js').replace('export function interpret', 'function interpret');
  const interpret = new Function(`${source}\nreturn interpret;`)() as (text: string, entities: any[], records: Record<string, any[]>) => any;
  const entities = generated.config.entities;
  const records = { Paciente: [{ nombre: 'Carlos', ci: '123' }], Consulta: [] };
  assert.equal(interpret('¿Cuántos pacientes hay?', entities, records).intent, 'COUNT_RECORDS');
  assert.equal(interpret('Busca paciente Carlos', entities, records).matches.length, 1);
  const create = interpret('Registra un nuevo paciente con nombre Ana y ci 456 y edad 25', entities, records);
  assert.equal(create.intent, 'CREATE_RECORD');
  assert.equal(create.slots.nombre, 'Ana');
  assert.equal(create.slots.edad, 25);
});

test('CU-16: outbox generado conserva orden y sustituye el ID temporal al sincronizar', async () => {
  const generated = await new MobileAppService().generate(diagram);
  const source = file(generated, 'syncManager.js').replace('export class SyncManager', 'class SyncManager');
  const storage = new Map<string, string>();
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const window = { addEventListener: () => {}, removeEventListener: () => {} };
  const navigator = { onLine: false };
  const calls: Array<{ url: string; method: string }> = [];
  const fakeFetch = async (url: string, options: { method: string }) => {
    calls.push({ url, method: options.method });
    return { ok: true, status: options.method === 'POST' ? 201 : 200, json: async () => ({ id: 42 }) };
  };
  const SyncManager = new Function('localStorage', 'window', 'navigator', 'fetch', `${source}\nreturn SyncManager;`)(localStorage, window, navigator, fakeFetch);
  const manager = new SyncManager('test', 'http://localhost:8080/api/v1', generated.config.entities);
  const record = manager.add('Paciente', { nombre: 'Ana', ci: '456' });
  manager.update('Paciente', record.id, { nombre: 'Ana María' });
  assert.equal(manager.pending().length, 2);
  manager.online = true;
  await manager.sync();
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'PUT']);
  assert.match(calls[1].url, /\/pacientes\/42$/);
  assert.equal(manager.list('Paciente')[0].id, 42);
  assert.equal(manager.pending().length, 0);
});

test('CU-15: ZIP contiene todos los assets autónomos', async () => {
  const result = await new MobileAppService().generate(diagram);
  const zip = await JSZip.loadAsync(result.zipBuffer);
  for (const name of ['index.html', 'app.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'nluEngine.js', 'syncManager.js']) {
    assert.ok(zip.file(name), name);
  }
});

test('CU-15: IP LAN prioriza IPv4 privada y la URL usa el puerto real', () => {
  const address = detectLanAddress({
    Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    WiFi: [{ address: '192.168.1.41', family: 'IPv4', internal: false }],
  });
  assert.equal(address, '192.168.1.41');
  assert.equal(mobileAccessUrl('sesion-1', 4321, address), 'http://192.168.1.41:4321/m/sesion-1');
});

test('CU-15: rechaza un AST vacío o un identificador de ruta inseguro', async () => {
  await assert.rejects(new MobileAppService().generate({ version: 1, classes: [], relationships: [] }), /al menos una entidad/);
  assert.throws(() => mobileAccessUrl('../escape', 4000, '192.168.1.4'), /Identificador/);
});

test('CU-15: generación directa permite abrir la PWA y descargar ZIP', async () => {
  const app = createApp({
    authService: {} as any, adminService: {} as any,
    sessionRepository: { findSessionUserById: async () => null } as any,
    jwtSecret: 'mobile-test', corsOrigin: 'http://localhost:5173',
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const generated = await fetch(`${base}/api/movil/generar-directo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diagrama: diagram }),
    });
    assert.equal(generated.status, 200);
    const body = await generated.json() as any;
    assert.equal(body.data.config.entities.length, 2);
    const appId = body.data.appId;
    const page = await fetch(`${base}/m/${appId}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Clínica Integral/);
    const script = await fetch(`${base}/m/${appId}/app.js`);
    assert.equal(script.status, 200);
    const png = await fetch(`${base}/m/${appId}/icon-192.png`);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await png.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const zip = await fetch(`${base}/api/movil/generar-directo?format=zip`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diagrama: diagram }),
    });
    assert.deepEqual([...new Uint8Array(await zip.arrayBuffer()).slice(0, 2)], [0x50, 0x4b]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('CU-15: endpoints de sesión exigen anfitrión y devuelven QR y ZIP', async () => {
  const secret = 'mobile-session-test';
  const user = { id: 'host-1', email: 'host@test.dev', nombre: 'Host', rol: 'ANFITRION' as const, activo: true };
  let isHost = false;
  const app = createApp({
    authService: {} as any, adminService: {} as any,
    sessionRepository: { findSessionUserById: async () => user } as any,
    jwtSecret: secret, corsOrigin: 'http://localhost:5173',
    diagramService: { get: async () => ({ diagram, isHost, proyectoNombre: 'Clínica Integral', sesionNombre: 'Demo' }) } as any,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/movil/sesiones/10000000-0000-4000-8000-000000000015`;
  const headers = { Authorization: `Bearer ${jwt.sign({ sub: user.id }, secret)}`, 'Content-Type': 'application/json' };
  try {
    const forbidden = await fetch(`${base}/generar`, { method: 'POST', headers, body: '{}' });
    assert.equal(forbidden.status, 403);
    isHost = true;
    assert.equal((await fetch(`${base}/generar`, { method: 'POST', headers, body: '{}' })).status, 200);
    const qr = await fetch(`${base}/qr`, { headers });
    const meta = await qr.json() as any;
    assert.equal(qr.status, 200);
    assert.match(meta.data.url, /\/m\/10000000-0000-4000-8000-000000000015$/);
    const zip = await fetch(`${base}/descargar-zip`, { headers });
    assert.equal(zip.headers.get('content-type'), 'application/zip');
    assert.deepEqual([...new Uint8Array(await zip.arrayBuffer()).slice(0, 2)], [0x50, 0x4b]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
