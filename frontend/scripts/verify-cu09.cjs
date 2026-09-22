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
const hostId = '11111111-1111-4111-8111-111111111111';
const secret = 'cu09-browser-secret-long-enough';
const host = { id: hostId, nombre: 'Elena Salvatierra', email: 'elena@example.com', rol: 'ANFITRION', activo: true };
const initialDiagram = {
  version: 7,
  classes: [{ id: 'patient', name: 'Paciente', isAbstract: false, isInterface: false, position: { x: 110, y: 90 }, attributes: [{ id: 'patient-id', name: 'id', type: 'Long', visibility: '-' }], methods: [] }],
  relationships: [],
};
const importedDiagram = {
  version: 8,
  classes: [
    ...initialDiagram.classes,
    { id: 'appointment', name: 'Cita', isAbstract: false, isInterface: false, position: { x: 430, y: 90 }, attributes: [{ id: 'date', name: 'fecha', type: 'LocalDateTime', visibility: '-' }], methods: [] },
  ],
  relationships: [{ id: 'patient-appointment', sourceClassId: 'patient', targetClassId: 'appointment', type: 'ASSOCIATION', sourceMultiplicity: '1', targetMultiplicity: '0..*' }],
};
const xmi = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
  <uml:Model xmi:id="model" name="Agenda clínica">
    <packagedElement xmi:type="uml:Class" xmi:id="appointment" name="Cita">
      <ownedAttribute xmi:type="uml:Property" xmi:id="date" name="fecha" />
    </packagedElement>
  </uml:Model>
</xmi:XMI>`;

async function waitForHttp(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Servidor no disponible: ${url}`);
}

async function mockApi(page) {
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === `/api/sesiones/${sessionId}/diagrama` && method === 'GET') {
      await route.fulfill({ json: { data: { diagram: initialDiagram, canEdit: true, proyectoNombre: 'Hospital colaborativo', sesionNombre: 'Modelo clínico en vivo' } } }); return;
    }
    if (url.pathname === `/api/sesiones/${sessionId}/mensajes` && method === 'GET') {
      await route.fulfill({ json: { mensajes: [] } }); return;
    }
    if (url.pathname === `/api/sesiones/${sessionId}/xmi/importar` && method === 'POST') {
      const input = request.postDataJSON();
      if (input.strategy !== 'merge' || input.expectedVersion !== 7) throw new Error(`Importación inesperada: ${JSON.stringify(input)}`);
      await route.fulfill({ json: { data: {
        diagram: importedDiagram,
        summary: { classes: 1, interfaces: 0, attributes: 1, methods: 0, relationships: 0 },
        warnings: [],
        validationReport: { isValid: true, criticalErrorsCount: 0, warningsCount: 1, diagnostics: [], validatedAt: new Date().toISOString() },
      } } }); return;
    }
    if (url.pathname === `/api/sesiones/${sessionId}/xmi/exportar` && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/xml', headers: { 'Content-Disposition': 'attachment; filename="hospital-colaborativo.xmi"', 'Access-Control-Expose-Headers': 'Content-Disposition' }, body: xmi }); return;
    }
    await route.fulfill({ status: 404, json: { error: `Mock faltante: ${method} ${url.pathname}` } });
  });
}

(async () => {
  const socketHttp = http.createServer();
  const io = new Server(socketHttp, { cors: { origin: 'http://127.0.0.1:5179', credentials: true } });
  setupUMLSocket(io, {
    jwtSecret: secret,
    authRepository: { findSessionUserById: async id => id === hostId ? host : null },
    collaborationRepository: { resolveAccess: async () => ({ canJoin: true, canEdit: true, role: 'ANFITRION', permission: 'EDICION_COMPLETA' }) },
  });
  await new Promise(resolve => socketHttp.listen(4109, '127.0.0.1', resolve));
  const vite = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5179', '--strictPort'], {
    cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:4109/api' },
  });
  let browser;
  try {
    await waitForHttp('http://127.0.0.1:5179');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.addInitScript(value => localStorage.setItem('case.auth.v1', JSON.stringify(value)), {
      version: 1, token: jwt.sign({}, secret, { subject: hostId, expiresIn: '1h' }), user: host,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mockApi(page);
    await page.goto(`http://127.0.0.1:5179/sesion/${sessionId}`);
    await page.getByRole('button', { name: 'Importar modelo XMI' }).waitFor();
    await page.getByRole('button', { name: 'Importar modelo XMI' }).click();
    await page.getByLabel('Seleccionar archivo XMI').setInputFiles({ name: 'agenda-clinica.xmi', mimeType: 'application/xml', buffer: Buffer.from(xmi) });
    await page.getByText('1 clase', { exact: true }).waitFor();
    if (!(await page.getByRole('radio', { name: /Fusionar/ }).isChecked())) throw new Error('Fusionar no es la estrategia segura predeterminada');

    const dimensions = {};
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await page.waitForTimeout(60);
      dimensions[width] = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
      if (dimensions[width].viewport !== dimensions[width].scroll) throw new Error(`Desbordamiento en ${width}px: ${JSON.stringify(dimensions[width])}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopCapture = path.resolve(__dirname, '../.impeccable/review/cu09-desktop.png');
    await page.screenshot({ path: desktopCapture, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileCapture = path.resolve(__dirname, '../.impeccable/review/cu09-mobile.png');
    await page.screenshot({ path: mobileCapture, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole('button', { name: 'Importar modelo', exact: true }).click();
    await page.getByRole('button', { name: 'Seleccionar Cita' }).waitFor();
    await page.getByText(/Modelo XMI importado/).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar modelo XMI' }).click();
    const download = await downloadPromise;
    if (download.suggestedFilename() !== 'hospital-colaborativo.xmi') throw new Error(`Nombre de descarga inesperado: ${download.suggestedFilename()}`);
    if (errors.length) throw new Error(`Errores de navegador: ${errors.join(' | ')}`);
    process.stdout.write(JSON.stringify({ imported: true, exported: true, filename: download.suggestedFilename(), dimensions, errors, desktopCapture, mobileCapture }, null, 2));
    await context.close();
  } finally {
    if (browser) await browser.close();
    vite.kill();
    socketHttp.closeAllConnections();
    await new Promise(resolve => io.close(resolve));
    if (socketHttp.listening) await new Promise(resolve => socketHttp.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
