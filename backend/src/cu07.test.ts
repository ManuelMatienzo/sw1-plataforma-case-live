import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommandLocal } from './services/voiceCommandParser';
import { GeminiService } from './services/geminiService';
import { createApp } from './app';
import jwt from 'jsonwebtoken';

const jwtSecret = 'test_secret_cu07';

test('voiceCommandParser: extrae correctamente creación de clases con atributos', () => {
  const result1 = parseVoiceCommandLocal('Crear clase Paciente');
  assert.equal(result1.type, 'CREATE_CLASS');
  if (result1.type === 'CREATE_CLASS') {
    assert.equal(result1.name, 'Paciente');
    assert.equal(result1.isAbstract, false);
    assert.equal(result1.isInterface, false);
  }

  const result2 = parseVoiceCommandLocal('Nueva clase abstracta Persona con atributos id entero, nombre texto y fechaNacimiento fecha');
  assert.equal(result2.type, 'CREATE_CLASS');
  if (result2.type === 'CREATE_CLASS') {
    assert.equal(result2.name, 'Persona');
    assert.equal(result2.isAbstract, true);
    assert.ok(result2.attributes);
    assert.equal(result2.attributes.length, 3);
    assert.equal(result2.attributes[0].name, 'id');
    assert.equal(result2.attributes[0].type, 'Integer');
    assert.equal(result2.attributes[1].name, 'nombre');
    assert.equal(result2.attributes[1].type, 'String');
    assert.equal(result2.attributes[2].name, 'fechaNacimiento');
    assert.equal(result2.attributes[2].type, 'Date');
  }
});

test('voiceCommandParser: extrae agregar atributos y métodos a una clase', () => {
  const attrRes = parseVoiceCommandLocal('Agregar atributo correo de tipo String a la clase Paciente');
  assert.equal(attrRes.type, 'ADD_ATTRIBUTE');
  if (attrRes.type === 'ADD_ATTRIBUTE') {
    assert.equal(attrRes.className, 'Paciente');
    assert.equal(attrRes.attribute.name, 'correo');
    assert.equal(attrRes.attribute.type, 'String');
  }

  const methodRes = parseVoiceCommandLocal('Agregar metodo registrarConsulta con retorno void a Paciente');
  assert.equal(methodRes.type, 'ADD_METHOD');
  if (methodRes.type === 'ADD_METHOD') {
    assert.equal(methodRes.className, 'Paciente');
    assert.equal(methodRes.method.name, 'registrarConsulta');
    assert.equal(methodRes.method.returnType, 'void');
  }
});

test('voiceCommandParser: extrae relaciones de asociación y herencia', () => {
  const relRes = parseVoiceCommandLocal('Conectar Paciente con Medico como asociacion');
  assert.equal(relRes.type, 'CREATE_RELATION');
  if (relRes.type === 'CREATE_RELATION') {
    assert.equal(relRes.sourceName, 'Paciente');
    assert.equal(relRes.targetName, 'Medico');
    assert.equal(relRes.relationshipType, 'ASSOCIATION');
  }

  const inhRes = parseVoiceCommandLocal('Paciente hereda de Persona');
  assert.equal(inhRes.type, 'CREATE_RELATION');
  if (inhRes.type === 'CREATE_RELATION') {
    assert.equal(inhRes.sourceName, 'Paciente');
    assert.equal(inhRes.targetName, 'Persona');
    assert.equal(inhRes.relationshipType, 'INHERITANCE');
  }
});

test('GeminiService: conmuta a fallback local cuando no hay API key', async () => {
  const service = new GeminiService('');
  const result = await service.interpretCommand({
    text: 'Crear clase Doctor con atributos especialidad texto',
  });

  assert.equal(result.source, 'local_fallback');
  assert.equal(result.action.type, 'CREATE_CLASS');
  if (result.action.type === 'CREATE_CLASS') {
    assert.equal(result.action.name, 'Doctor');
    assert.ok(result.action.attributes);
    assert.equal(result.action.attributes[0].name, 'especialidad');
    assert.equal(result.action.attributes[0].type, 'String');
  }
});

test('Ruta /api/ia/comando-voz exige autenticación y procesa comandos', async () => {
  const mockUser = { id: 'u-1', nombre: 'Admin', email: 'admin@sw1.edu', rol: 'ADMINISTRADOR' as const, activo: true };
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

  // 1. Sin token -> 401
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const unauthRes = await fetch(`${baseUrl}/api/ia/comando-voz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: 'Crear clase Paciente' }),
    });
    assert.equal(unauthRes.status, 401);

    // 2. Con token -> 200 y respuesta estructurada
    const token = jwt.sign({ sub: mockUser.id }, jwtSecret);
    const authRes = await fetch(`${baseUrl}/api/ia/comando-voz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        texto: 'Crear clase CitaMedica con atributos fecha Date',
        clases: ['Paciente'],
      }),
    });

    assert.equal(authRes.status, 200);
    const json = (await authRes.json()) as any;
    assert.ok(json.data);
    assert.equal(json.data.action.type, 'CREATE_CLASS');
    assert.equal(json.data.action.name, 'CitaMedica');
  } finally {
    server.close();
  }
});
