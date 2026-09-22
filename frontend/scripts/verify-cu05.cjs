// Local synthetic API boundary; browser renders the real React/Konva editor.
const { chromium } = require(process.env.CASE_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let diagram = { version: 1, classes: [], relationships: [] };
  const response = () => ({ data: { diagram, canEdit: true, proyectoNombre: 'Hospital · Prueba local CU-05', sesionNombre: 'Modelo clínico' } });
  await page.addInitScript(() => localStorage.setItem('case.auth.v1', JSON.stringify({ version: 1, token: 'synthetic-local-only', user: { id: 'qa', nombre: 'QA local', email: 'qa@example.test', rol: 'ANFITRION' } })));
  await page.route('**/api/sesiones/*/diagrama', async route => {
    if (route.request().method() === 'PUT') { const input = route.request().postDataJSON(); diagram = { ...input, version: diagram.version + 1 }; }
    await route.fulfill({ json: response() });
  });
  await page.route('**/api/proyectos', route => route.fulfill({ json: { data: [{ id: 'project', nombre: 'Prueba local', descripcion: '', estado: 'ACTIVO', _count: { sesiones: 1 } }] } }));
  await page.route('**/api/proyectos/project/sesiones', route => route.fulfill({ json: { data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', codigoAcceso: 'LOCAL1', nombre: 'Prueba local', proyecto: { nombre: 'Prueba local' } } } }));
  try {
    await page.goto('http://127.0.0.1:5173/dashboard');
    await page.getByRole('button', { name: 'Nueva sesión', exact: true }).click();
    await page.getByRole('button', { name: 'Entrar al canvas' }).click();
    await page.getByRole('button', { name: 'Nueva clase', exact: true }).click();
    await page.getByLabel('Nombre de clase', { exact: true }).fill('Paciente');
    await page.getByLabel('Posición X', { exact: true }).fill('80');
    await page.getByLabel('Posición Y', { exact: true }).fill('120');
    await page.getByRole('button', { name: 'Añadir atributo', exact: true }).click();
    await page.getByLabel('Nombre de atributo 1').fill('id');
    await page.getByLabel('Tipo', { exact: true }).fill('Long');
    await page.getByLabel('PK', { exact: true }).check();
    await page.getByRole('button', { name: 'Añadir método', exact: true }).click();
    await page.getByLabel('Nombre de método 1').fill('registrar');
    await page.getByRole('button', { name: 'Nueva clase', exact: true }).click();
    await page.getByLabel('Nombre de clase', { exact: true }).fill('HistoriaClinica');
    await page.getByLabel('Posición X', { exact: true }).fill('580');
    await page.getByLabel('Posición Y', { exact: true }).fill('220');
    await page.getByLabel('Tipo de nueva relación').selectOption('COMPOSITION');
    await page.getByRole('button', { name: 'Conectar', exact: true }).click();
    await page.getByRole('button', { name: 'Seleccionar Paciente', exact: true }).click();
    await page.getByRole('button', { name: 'Seleccionar HistoriaClinica', exact: true }).click();
    await page.getByLabel('Nombre de relación', { exact: true }).fill('historia');
    await page.getByRole('button', { name: 'Guardar diagrama', exact: true }).click();
    await page.getByText('Guardado · v2', { exact: true }).waitFor();
    assert.equal(diagram.classes.length, 2); assert.equal(diagram.relationships[0].type, 'COMPOSITION');
    assert.equal(diagram.classes[0].attributes[0].isPrimaryKey, true);
    await page.reload();
    await page.getByRole('button', { name: 'Seleccionar Paciente', exact: true }).waitFor();
    await page.locator('canvas').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('canvas').count(), 2);
    // Exercise actual canvas dragging, then browser Back/Forward draft recovery.
    const canvas = await page.locator('.uml-canvas').boundingBox();
    await page.mouse.move(canvas.x + 170, canvas.y + 140);
    await page.mouse.down(); await page.mouse.move(canvas.x + 210, canvas.y + 170, { steps: 10 }); await page.mouse.up();
    assert.equal(await page.getByLabel('Posición X', { exact: true }).inputValue(), '120');
    await page.goBack(); await page.getByRole('heading', { name: 'Mis proyectos' }).waitFor();
    await page.goForward();
    await page.getByRole('button', { name: 'Restaurar borrador' }).click();
    await page.getByRole('button', { name: 'Seleccionar Paciente', exact: true }).click();
    assert.equal(await page.getByLabel('Posición X', { exact: true }).inputValue(), '120');
    await page.getByLabel('Posición X', { exact: true }).fill('600');
    await page.getByLabel('Posición Y', { exact: true }).fill('120');
    await page.getByRole('button', { name: 'Seleccionar HistoriaClinica', exact: true }).click();
    await page.getByLabel('Posición X', { exact: true }).fill('80');
    await page.getByLabel('Posición Y', { exact: true }).fill('220');
    await page.getByRole('button', { name: 'Nueva interfaz', exact: true }).click();
    await page.getByLabel('Nombre de clase', { exact: true }).fill('IRegistrable');
    await page.getByLabel('Posición X', { exact: true }).fill('600');
    await page.getByLabel('Posición Y', { exact: true }).fill('450');
    await page.getByLabel('Tipo de nueva relación').selectOption('REALIZATION');
    await page.getByRole('button', { name: 'Conectar', exact: true }).click();
    await page.getByRole('button', { name: 'Seleccionar Paciente', exact: true }).click();
    await page.getByRole('button', { name: 'Seleccionar IRegistrable', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar diagrama', exact: true }).click();
    await page.getByText('Guardado · v3', { exact: true }).waitFor();
    await page.reload(); await page.locator('canvas').first().waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    const output = path.resolve('.impeccable/review'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'cu05-desktop.png'), fullPage: true });
    const dimensions = [];
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      const metric = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
      dimensions.push(metric); assert.ok(metric.scroll <= metric.viewport, JSON.stringify(metric));
      if (width === 390) await page.screenshot({ path: path.join(output, 'cu05-mobile.png'), fullPage: true });
    }
    // The review's diagonal case: labels must leave the bottom/top edges.
    await page.getByRole('button', { name: 'Seleccionar HistoriaClinica', exact: true }).click();
    await page.getByLabel('Posición X', { exact: true }).fill('100');
    await page.getByLabel('Posición Y', { exact: true }).fill('40');
    await page.getByRole('button', { name: 'Seleccionar Paciente', exact: true }).click();
    await page.getByLabel('Posición X', { exact: true }).fill('500');
    await page.getByLabel('Posición Y', { exact: true }).fill('360');
    await page.getByRole('button', { name: 'Guardar diagrama', exact: true }).click();
    await page.getByText('Guardado · v4', { exact: true }).waitFor();
    await page.reload(); await page.locator('canvas').first().waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'cu05-diagonal.png'), fullPage: true });
    await page.getByRole('button', { name: 'Seleccionar Paciente', exact: true }).click();
    await page.getByLabel('Nombre de clase', { exact: true }).press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('type'), 'checkbox');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', savedVersion: diagram.version, classes: diagram.classes.length, relationships: diagram.relationships.length, dimensions, consoleErrors: errors, screenshots: output }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
