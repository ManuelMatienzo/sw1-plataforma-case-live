import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  GeminiService,
  generateDeterministicPhotoDiagram,
  layoutRecognizedClasses,
  normalizeMultiplicity,
  normalizeRelType,
  normalizeUmlType,
  normalizeVisibility,
} from './services/geminiService';
import { createAiController } from './controllers/aiController';
import { createApp } from './app';
import { UMLClass } from './models/uml.types';

const jwtSecret = 'test_secret_cu10';

test('CU-10: normalizadores de tipo, visibilidad y multiplicidad UML', () => {
  assert.equal(normalizeUmlType('texto'), 'String');
  assert.equal(normalizeUmlType('cadena'), 'String');
  assert.equal(normalizeUmlType('entero'), 'Integer');
  assert.equal(normalizeUmlType('int'), 'Integer');
  assert.equal(normalizeUmlType('fecha'), 'Date');
  assert.equal(normalizeUmlType('booleano'), 'Boolean');
  assert.equal(normalizeUmlType('vacio'), 'void');
  assert.equal(normalizeUmlType('HistorialClinico'), 'HistorialClinico');

  assert.equal(normalizeVisibility('+'), '+');
  assert.equal(normalizeVisibility('public'), '+');
  assert.equal(normalizeVisibility('-'), '-');
  assert.equal(normalizeVisibility('private'), '-');
  assert.equal(normalizeVisibility('#'), '#');
  assert.equal(normalizeVisibility('~'), '~');

  assert.equal(normalizeRelType('asociacion'), 'ASSOCIATION');
  assert.equal(normalizeRelType('herencia'), 'INHERITANCE');
  assert.equal(normalizeRelType('composicion'), 'COMPOSITION');
  assert.equal(normalizeRelType('agregacion'), 'AGGREGATION');

  assert.equal(normalizeMultiplicity('1'), '1');
  assert.equal(normalizeMultiplicity('0..1'), '0..1');
  assert.equal(normalizeMultiplicity('1..*'), '1..*');
  assert.equal(normalizeMultiplicity('0..n'), '0..*');
  assert.equal(normalizeMultiplicity('1..n'), '1..*');
});

test('CU-10: layoutRecognizedClasses organiza las clases en cuadrícula sin encimarse', () => {
  const rawClasses: UMLClass[] = [
    { id: '1', name: 'A', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
    { id: '2', name: 'B', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
    { id: '3', name: 'C', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
    { id: '4', name: 'D', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 0, y: 0 } },
  ];

  const positioned = layoutRecognizedClasses(rawClasses);
  assert.equal(positioned.length, 4);

  // Asegurar que no comparten la misma posición (x, y)
  const positions = new Set(positioned.map(c => `${c.position.x},${c.position.y}`));
  assert.equal(positions.size, 4);
});

test('CU-10: generador determinista produce diagrama UML 2.5+ válido sin errores críticos', () => {
  const result = generateDeterministicPhotoDiagram();
  assert.ok(result.diagram);
  assert.equal(result.diagram.classes.length, 3);
  assert.equal(result.diagram.relationships.length, 2);
  assert.equal(result.summary.classes, 3);
  assert.equal(result.summary.relationships, 2);
  assert.equal(result.validationReport.isValid, true);
  assert.equal(result.validationReport.criticalErrorsCount, 0);
  assert.equal(result.source, 'deterministic_fallback');
});

test('CU-10: GeminiService.extractDiagramFromImage conmuta a fallback cuando no hay API key', async () => {
  const service = new GeminiService('');
  const dummyBuffer = Buffer.from('fake-image-bytes-png');
  const result = await service.extractDiagramFromImage({
    imageBuffer: dummyBuffer,
    mimeType: 'image/png',
  });

  assert.ok(result.diagram);
  assert.equal(result.source, 'deterministic_fallback');
  assert.ok(result.summary.classes > 0);
  assert.equal(result.validationReport.isValid, true);
});

test('CU-10: GeminiService.extractDiagramFromImage rechaza buffer vacío', async () => {
  const service = new GeminiService('');
  await assert.rejects(
    async () => {
      await service.extractDiagramFromImage({ imageBuffer: Buffer.alloc(0) });
    },
    /buffer de imagen/,
  );
});

test('CU-10: aiController valida presencia y tipo de archivo de imagen', async () => {
  const service = new GeminiService('');
  const controller = createAiController(service);

  // Sin archivo
  await assert.rejects(
    async () => {
      await controller.importarDiagramaFoto({} as any, {} as any);
    },
    (err: any) => err.code === 'MISSING_IMAGE',
  );

  // Formato inválido
  await assert.rejects(
    async () => {
      await controller.importarDiagramaFoto(
        {
          file: {
            buffer: Buffer.from('abc'),
            mimetype: 'application/pdf',
            size: 3,
          },
        } as any,
        {} as any,
      );
    },
    (err: any) => err.code === 'INVALID_IMAGE_FORMAT',
  );
});

test('CU-10: Endpoint POST /api/ia/importar-foto autenticado procesa imagen multipart', async () => {
  const mockUser = { id: 'u-foto-1', nombre: 'Profesor UML', email: 'prof@sw1.edu', rol: 'ANFITRION' as const, activo: true };
  const sessionRepo = {
    findSessionUserById: async (id: string) => (id === mockUser.id ? mockUser : null),
  };
  const app = createApp({
    authService: {} as any,
    adminService: {} as any,
    sessionRepository: sessionRepo,
    jwtSecret,
    corsOrigin: 'http://localhost:5173',
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Sin autenticación -> 401
    const unauthRes = await fetch(`${baseUrl}/api/ia/importar-foto`, {
      method: 'POST',
    });
    assert.equal(unauthRes.status, 401);

    // 2. Con autenticación pero sin archivo -> 400
    const token = jwt.sign({ sub: mockUser.id }, jwtSecret);
    const noFileRes = await fetch(`${baseUrl}/api/ia/importar-foto`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(noFileRes.status, 400);

    // 3. Con autenticación y archivo multipart -> 200
    const formData = new FormData();
    const blob = new Blob(['simulated-photo-bytes'], { type: 'image/png' });
    formData.append('imagen', blob, 'pizarra.png');

    const successRes = await fetch(`${baseUrl}/api/ia/importar-foto`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    assert.equal(successRes.status, 200);
    const json = (await successRes.json()) as any;
    assert.ok(json.data);
    assert.ok(json.data.diagram);
    assert.ok(json.data.summary);
    assert.equal(json.data.summary.classes, 3);
    assert.equal(json.data.validationReport.isValid, true);
  } finally {
    server.close();
  }
});
