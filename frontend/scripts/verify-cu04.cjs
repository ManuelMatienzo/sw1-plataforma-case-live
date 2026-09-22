const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Server } = require(path.resolve(__dirname, '../../backend/node_modules/socket.io'));
const jwt = require(path.resolve(__dirname, '../../backend/node_modules/jsonwebtoken'));
const { setupUMLSocket } = require(path.resolve(__dirname, '../../backend/dist/sockets/umlSocket'));
const { createParticipantManagementService } = require(path.resolve(__dirname, '../../backend/dist/services/participantManagementService'));

const playwrightPath = process.env.CASE_PLAYWRIGHT;
if (!playwrightPath) throw new Error('CASE_PLAYWRIGHT es obligatorio');
const { chromium } = require(playwrightPath);

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hostId = '11111111-1111-4111-8111-111111111111';
const collaboratorId = '22222222-2222-4222-8222-222222222222';
const secret = 'cu04-browser-secret-long-enough';
const users = new Map([
  [hostId, { id: hostId, nombre: 'Elena Salvatierra', email: 'elena@example.com', rol: 'ANFITRION', activo: true }],
  [collaboratorId, { id: collaboratorId, nombre: 'Rafael Quispe', email: 'rafael@example.com', rol: 'COLABORADOR', activo: true }],
]);
let permission = 'EDICION_COMPLETA';
let collaboratorPresent = true;
const repository = {
  findHostId: async id => id === sessionId ? hostId : null,
  isSessionMember: async (id, userId) => id === sessionId && (userId === hostId || (userId === collaboratorId && collaboratorPresent)),
  updatePermissionWithAudit: async (id, targetId, nextPermission) => {
    if (id !== sessionId || targetId !== collaboratorId || !collaboratorPresent) return null;
    permission = nextPermission;
    return { userId: targetId, permission };
  },
  removeParticipantWithAudit: async (id, targetId) => {
    if (id !== sessionId || targetId !== collaboratorId || !collaboratorPresent) return false;
    collaboratorPresent = false;
    return true;
  },
};
const participantService = createParticipantManagementService(repository);
const empty = { version: 1, classes: [], relationships: [] };

async function waitForHttp(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Servidor no disponible: ${url}`);
}

function auth(userId) {
  return {
    version: 1,
    token: jwt.sign({}, secret, { subject: userId, expiresIn: '1h' }),
    user: users.get(userId),
  };
}

function participants() {
  const rows = [{ id: 'participant-host', permiso: 'EDICION_COMPLETA', conectado: true, usuario: users.get(hostId) }];
  if (collaboratorPresent) rows.push({ id: 'participant-collaborator', permiso: permission, conectado: true, usuario: users.get(collaboratorId) });
  return rows;
}

async function mockApi(page, canEdit) {
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const participantPath = `/api/sesiones/${sessionId}/participantes/${collaboratorId}`;
    if (url.pathname === `/api/sesiones/${sessionId}/diagrama`) {
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { diagram: empty, canEdit, proyectoNombre: 'Hospital colaborativo', sesionNombre: 'Modelo clínico en vivo' } }) });
      } else {
        const incoming = request.postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { diagram: { ...incoming, version: incoming.version + 1 }, canEdit, proyectoNombre: 'Hospital colaborativo', sesionNombre: 'Modelo clínico en vivo' } }) });
      }
      return;
    }
    if (url.pathname === `/api/sesiones/${sessionId}` && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: sessionId, codigoAcceso: 'CASE04', nombre: 'Modelo clínico en vivo', anfitrionId: hostId, participantes: participants() } }) });
      return;
    }
    if (url.pathname === `/api/sesiones/${sessionId}/mensajes` && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensajes: [] }) });
      return;
    }
    if (url.pathname === participantPath && method === 'PATCH') {
      await participantService.updatePermission(sessionId, hostId, collaboratorId, request.postDataJSON().permiso);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { userId: collaboratorId, permission } }) });
      return;
    }
    if (url.pathname === participantPath && method === 'DELETE') {
      await participantService.removeParticipant(sessionId, hostId, collaboratorId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Colaborador removido' }) });
      return;
    }
    if (url.pathname === '/api/proyectos' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Mock faltante: ${method} ${url.pathname}` }) });
  });
}

(async () => {
  const socketHttp = http.createServer();
  const io = new Server(socketHttp, { cors: { origin: 'http://127.0.0.1:5175', credentials: true } });
  setupUMLSocket(io, {
    jwtSecret: secret,
    authRepository: { findSessionUserById: async id => users.get(id) ?? null },
    collaborationRepository: {
      resolveAccess: async (id, userId) => {
        if (id !== sessionId) return { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' };
        if (userId === hostId) return { canJoin: true, canEdit: true, role: 'ANFITRION', permission: 'EDICION_COMPLETA' };
        if (userId === collaboratorId && collaboratorPresent) return { canJoin: true, canEdit: permission === 'EDICION_COMPLETA', role: 'COLABORADOR', permission };
        return { canJoin: false, canEdit: false, role: 'COLABORADOR', permission: 'SOLO_LECTURA' };
      },
    },
    participantService,
  });
  await new Promise(resolve => socketHttp.listen(4104, '127.0.0.1', resolve));
  const vite = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5175', '--strictPort'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:4104/api' },
  });
  let browser;
  try {
    await waitForHttp('http://127.0.0.1:5175');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const collaboratorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await hostContext.addInitScript(value => localStorage.setItem('case.auth.v1', JSON.stringify(value)), auth(hostId));
    await collaboratorContext.addInitScript(value => localStorage.setItem('case.auth.v1', JSON.stringify(value)), auth(collaboratorId));
    const host = await hostContext.newPage();
    const collaborator = await collaboratorContext.newPage();
    const consoleErrors = [];
    for (const page of [host, collaborator]) {
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', error => consoleErrors.push(error.message));
    }
    await mockApi(host, true);
    await mockApi(collaborator, true);
    await Promise.all([host.goto(`http://127.0.0.1:5175/sesion/${sessionId}`), collaborator.goto(`http://127.0.0.1:5175/sesion/${sessionId}`)]);
    await Promise.all([host.getByText('2 en línea').waitFor(), collaborator.getByText('2 en línea').waitFor()]);
    await host.getByRole('button', { name: 'Administrar colaboradores' }).click();
    await host.getByRole('dialog', { name: 'Colaboradores de la sesión' }).waitFor();
    await host.getByText('CASE04').waitFor();
    if (await host.getByRole('button', { name: 'Remover a Elena Salvatierra' }).count()) throw new Error('El anfitrión se puede remover desde la UI');

    const desktopCapture = path.resolve(__dirname, '../.impeccable/review/cu04-desktop.png');
    await host.screenshot({ path: desktopCapture, fullPage: true });
    const dimensions = {};
    for (const width of [320, 390, 768, 1024, 1440]) {
      await host.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await host.waitForTimeout(60);
      dimensions[width] = await host.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
      if (dimensions[width].viewport !== dimensions[width].scroll) throw new Error(`Desbordamiento en ${width}px: ${JSON.stringify(dimensions[width])}`);
    }
    await host.setViewportSize({ width: 390, height: 844 });
    const mobileCapture = path.resolve(__dirname, '../.impeccable/review/cu04-mobile.png');
    await host.screenshot({ path: mobileCapture, fullPage: true });
    await host.setViewportSize({ width: 1440, height: 900 });

    await host.getByLabel('Permiso de Rafael Quispe').selectOption('SOLO_LECTURA');
    await collaborator.getByText('Ahora tienes permiso de solo lectura.').waitFor();
    if (!(await collaborator.getByRole('button', { name: 'Nueva Clase' }).isDisabled())) throw new Error('El permiso de solo lectura no bloqueó la edición');
    await host.getByLabel('Permiso de Rafael Quispe').selectOption('EDICION_COMPLETA');
    await collaborator.getByText('Ahora puedes editar el diagrama.').waitFor();
    if (!(await collaborator.getByRole('button', { name: 'Nueva Clase' }).isEnabled())) throw new Error('La promoción en vivo no habilitó la edición');
    await host.getByRole('button', { name: 'Remover a Rafael Quispe' }).click();
    await host.getByRole('button', { name: 'Confirmar remoción' }).click();
    await collaborator.getByRole('heading', { name: 'Mis proyectos' }).waitFor();
    await collaborator.getByRole('status').filter({ hasText: 'removido' }).waitFor();
    await host.getByText('1 en línea').waitFor();
    if (consoleErrors.length) throw new Error(`Errores de navegador: ${consoleErrors.join(' | ')}`);
    process.stdout.write(JSON.stringify({ permissionChanged: true, kickedAndRedirected: true, presenceAfterKick: 1, dimensions, consoleErrors, desktopCapture, mobileCapture }, null, 2));
    await hostContext.close();
    await collaboratorContext.close();
  } finally {
    if (browser) await browser.close();
    vite.kill();
    socketHttp.closeAllConnections();
    await new Promise(resolve => io.close(resolve));
    if (socketHttp.listening) await new Promise(resolve => socketHttp.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
