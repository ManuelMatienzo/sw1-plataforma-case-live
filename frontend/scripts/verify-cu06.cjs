const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Server } = require(path.resolve(__dirname, '../../backend/node_modules/socket.io'));
const jwt = require(path.resolve(__dirname, '../../backend/node_modules/jsonwebtoken'));
const { setupUMLSocket } = require(path.resolve(__dirname, '../../backend/dist/sockets/umlSocket'));

const playwrightPath = process.env.CASE_PLAYWRIGHT;
if (!playwrightPath) throw new Error('CASE_PLAYWRIGHT es obligatorio');
const { chromium } = require(playwrightPath);
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret = 'cu06-browser-secret';
const users = new Map([
  ['editor', { id: 'editor', nombre: 'Elena', email: 'elena@example.com', rol: 'ANFITRION', activo: true }],
  ['reader', { id: 'reader', nombre: 'Rafael', email: 'rafael@example.com', rol: 'COLABORADOR', activo: true }],
]);
const access = new Map([
  ['editor', { canJoin: true, canEdit: true, role: 'ANFITRION', permission: 'EDICION_COMPLETA' }],
  ['reader', { canJoin: true, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' }],
]);
const empty = { version: 1, classes: [], relationships: [] };

async function waitForHttp(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Servidor no disponible: ${url}`);
}
function auth(userId) {
  const user = users.get(userId);
  return { version: 1, token: jwt.sign({}, secret, { subject: userId, expiresIn: '1h' }), user };
}
async function mockApi(page, canEdit) {
  await page.route(`**/api/sesiones/${sessionId}/diagrama`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { diagram: empty, canEdit, proyectoNombre: 'Hospital colaborativo', sesionNombre: 'Modelo clínico en vivo' } }) });
      return;
    }
    const incoming = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { diagram: { ...incoming, version: incoming.version + 1 }, canEdit, proyectoNombre: 'Hospital colaborativo', sesionNombre: 'Modelo clínico en vivo' } }) });
  });
}

(async () => {
  const socketHttp = http.createServer();
  const io = new Server(socketHttp, { cors: { origin: 'http://127.0.0.1:5174', credentials: true } });
  setupUMLSocket(io, {
    jwtSecret: secret,
    authRepository: { findSessionUserById: async id => users.get(id) ?? null },
    collaborationRepository: { resolveAccess: async (id, userId) => id === sessionId ? access.get(userId) ?? { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' } : { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' } },
  });
  await new Promise(resolve => socketHttp.listen(4106, '127.0.0.1', resolve));
  const vite = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
    cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:4106/api' },
  });
  let browser;
  try {
    await waitForHttp('http://127.0.0.1:5174');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const editorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const readerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await editorContext.addInitScript(value => localStorage.setItem('case.auth.v1', JSON.stringify(value)), auth('editor'));
    await readerContext.addInitScript(value => localStorage.setItem('case.auth.v1', JSON.stringify(value)), auth('reader'));
    const editor = await editorContext.newPage();
    const reader = await readerContext.newPage();
    const consoleErrors = [];
    for (const page of [editor, reader]) {
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', error => consoleErrors.push(error.message));
    }
    await mockApi(editor, true); await mockApi(reader, false);
    await Promise.all([
      editor.goto(`http://127.0.0.1:5174/sesion/${sessionId}`),
      reader.goto(`http://127.0.0.1:5174/sesion/${sessionId}`),
    ]);
    await Promise.all([
      editor.getByRole('heading', { name: 'Hospital colaborativo' }).waitFor(),
      reader.getByRole('heading', { name: 'Hospital colaborativo' }).waitFor(),
    ]);
    await Promise.all([editor.getByText('2 en línea').waitFor(), reader.getByText('2 en línea').waitFor()]);
    if (!(await reader.getByRole('button', { name: 'Nueva Clase' }).isDisabled())) throw new Error('El lector puede crear clases');
    await editor.getByRole('button', { name: 'Nueva Clase' }).click();
    await reader.getByRole('button', { name: 'Seleccionar Clase1' }).waitFor();
    const canvas = editor.locator('.uml-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Lienzo no visible');
    await editor.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.42);
    await reader.waitForTimeout(120);
    const capture = path.resolve(__dirname, '../.impeccable/review/cu06-collaboration.png');
    await reader.screenshot({ path: capture, fullPage: true });
    const dimensions = {};
    for (const width of [320, 390, 768, 1024, 1440]) {
      await reader.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await reader.waitForTimeout(60);
      dimensions[width] = await reader.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
      if (dimensions[width].viewport !== dimensions[width].scroll) throw new Error(`Desbordamiento en ${width}px: ${JSON.stringify(dimensions[width])}`);
      if (!(await reader.getByText('Solo lectura', { exact: true }).isVisible())) throw new Error(`El permiso no es visible en ${width}px`);
    }
    await reader.setViewportSize({ width: 390, height: 844 });
    const mobileCapture = path.resolve(__dirname, '../.impeccable/review/cu06-mobile.png');
    await reader.screenshot({ path: mobileCapture, fullPage: true });
    if (consoleErrors.length) throw new Error(`Errores de navegador: ${consoleErrors.join(' | ')}`);
    process.stdout.write(JSON.stringify({ presence: 2, synchronizedClass: 'Clase1', readerCanEdit: false, dimensions, consoleErrors, capture, mobileCapture }, null, 2));
    await editorContext.close(); await readerContext.close();
  } finally {
    if (browser) await browser.close();
    vite.kill();
    socketHttp.closeAllConnections();
    await new Promise(resolve => io.close(resolve));
    if (socketHttp.listening) await new Promise(resolve => socketHttp.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
