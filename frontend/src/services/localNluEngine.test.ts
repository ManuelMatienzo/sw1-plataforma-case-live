import { describe, expect, it } from 'vitest';
import { interpretLocalCommand, prepareLocalVoice } from './localNluEngine';

const entities = [
  { name: 'Paciente', route: 'pacientes', fields: [
    { name: 'nombre', label: 'Nombre', umlType: 'String', inputType: 'text', required: true },
    { name: 'ci', label: 'CI', umlType: 'String', inputType: 'text', required: false },
    { name: 'edad', label: 'Edad', umlType: 'Integer', inputType: 'number', required: false },
  ] },
  { name: 'Consulta', route: 'consultas', fields: [] },
] as const;
const records = { Paciente: [{ id: '1', nombre: 'Carlos Pérez', ci: '123' }], Consulta: [] };

describe('NLU local de CU-16', () => {
  it('cuenta registros de una entidad sin llamadas de red', () => {
    const result = interpretLocalCommand('¿Cuántos pacientes hay?', entities, records);
    expect(result.intent).toBe('COUNT_RECORDS');
    expect(result.reply).toContain('1');
  });
  it('busca de forma tolerante a acentos', () => {
    const result = interpretLocalCommand('Busca paciente Perez', entities, records);
    expect(result.intent).toBe('SEARCH_RECORDS');
    expect(result.matches).toHaveLength(1);
  });
  it('extrae slots tipados para registrar un paciente', () => {
    const result = interpretLocalCommand('Registra un nuevo paciente con nombre Ana y ci 456 y edad 25', entities, records);
    expect(result.intent).toBe('CREATE_RECORD');
    expect(result.slots).toEqual({ nombre: 'Ana', ci: '456', edad: 25 });
  });
  it('pide el dato obligatorio que falta', () => {
    const result = interpretLocalCommand('Crear paciente ci 456', entities, records);
    expect(result.intent).toBe('CLARIFY');
    expect(result.reply).toContain('Nombre');
  });
  it('abre el formulario de la entidad solicitada', () => {
    const result = interpretLocalCommand('Abre el formulario de consultas', entities, records);
    expect(result).toMatchObject({ intent: 'NAVIGATE_SCREEN', entity: 'Consulta', screen: 'form' });
  });
  it('orienta ante entidades desconocidas y ofrece ayuda contextual', () => {
    expect(interpretLocalCommand('Busca pedidos', entities, records).intent).toBe('UNKNOWN');
    expect(interpretLocalCommand('¿Qué puedo hacer?', entities, records).intent).toBe('HELP');
  });
});

describe('preparación de voz sin servicio remoto', () => {
  it('instala el paquete local antes de entrar en Modo Avión', async () => {
    let installed = false;
    class Recognition {
      static available = async () => installed ? 'available' : 'downloadable';
      static install = async () => { installed = true; return true; };
    }
    const browser = { SpeechRecognition: Recognition } as unknown as Window;
    expect(await prepareLocalVoice(browser)).toBe(true);
    expect(installed).toBe(true);
  });
  it('rechaza navegadores que no certifican procesamiento local', async () => {
    expect(await prepareLocalVoice({} as Window)).toBe(false);
  });
});
