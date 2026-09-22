import type { MobileEntity, MobileRecord, NluResult } from '../types/mobile';

const normalize = (value: string) => value.toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();

const recognizeEntity = (phrase: string, entities: readonly MobileEntity[]) => entities.find((entity) => {
  const name = normalize(entity.name);
  return phrase.includes(name) || phrase.includes(`${name}s`) || phrase.includes(`${name}es`);
});

export function interpretLocalCommand(
  input: string, entities: readonly MobileEntity[], records: Record<string, MobileRecord[]>,
): NluResult {
  const phrase = normalize(input);
  const original = input.replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(ayuda|que puedo hacer|comandos)/.test(phrase)) {
    return { intent: 'HELP', reply: 'Puedes contar, buscar, registrar o abrir una entidad de este modelo.' };
  }
  const entity = recognizeEntity(phrase, entities);
  if (!entity) return { intent: 'UNKNOWN', reply: `No reconocí la entidad. Prueba con ${entities.map((item) => item.name).join(', ')}.` };
  const list = records[entity.name] ?? [];
  if (/^(cuantos|cuantas|contar)/.test(phrase)) {
    return { intent: 'COUNT_RECORDS', entity: entity.name, reply: `Hay ${list.length} ${list.length === 1 ? 'registro' : 'registros'} de ${entity.name}.` };
  }
  if (/^(ir|abre|abrir|muestra|mostrar).*(pantalla|formulario|registros)/.test(phrase)) {
    return { intent: 'NAVIGATE_SCREEN', entity: entity.name, screen: phrase.includes('formulario') ? 'form' : 'list',
      reply: `Abriendo ${entity.name}.` };
  }
  if (/^(registra|registrar|crea|crear|agrega|agregar)/.test(phrase)) {
    const slots: Record<string, unknown> = {};
    for (const field of entity.fields) {
      const name = normalize(field.name);
      const at = phrase.indexOf(`${name} `);
      if (at < 0) continue;
      const rest = original.slice(at + name.length + 1);
      const normalizedRest = normalize(rest);
      const next = entity.fields.filter((other) => other.name !== field.name)
        .map((other) => normalizedRest.indexOf(` y ${normalize(other.name)} `)).filter((position) => position >= 0);
      const raw = rest.slice(0, next.length ? Math.min(...next) : undefined).trim();
      if (!raw) continue;
      if (field.inputType === 'number') {
        const value = Number(raw);
        if (Number.isFinite(value)) slots[field.name] = value;
      } else if (field.inputType === 'checkbox') {
        slots[field.name] = /^(si|true|1)$/.test(raw);
      } else slots[field.name] = raw;
    }
    const missing = entity.fields.filter((field) => field.required && (slots[field.name] === undefined || slots[field.name] === '')).map((field) => field.label);
    if (missing.length) return { intent: 'CLARIFY', entity: entity.name, slots, reply: `Faltan estos datos: ${missing.join(', ')}.` };
    return { intent: 'CREATE_RECORD', entity: entity.name, slots, reply: `Registro de ${entity.name} guardado en este dispositivo.` };
  }
  if (/^(busca|buscar|encuentra|mostrar|muestra)/.test(phrase)) {
    const query = phrase.split(normalize(entity.name)).pop()?.replace(/^(s|es|al|a|el|la)\s*/, '').trim() ?? '';
    const matches = list.filter((record) => Object.values(record).some((value) => normalize(String(value)).includes(query)));
    return { intent: 'SEARCH_RECORDS', entity: entity.name, query, matches, reply: `${matches.length} resultados de ${entity.name}.` };
  }
  return { intent: 'UNKNOWN', reply: `Prueba: cuántos ${entity.name} hay, busca ${entity.name} o registra ${entity.name}.` };
}

interface LocalRecognition {
  processLocally?: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start(): void;
}
interface LocalRecognitionConstructor {
  new(): LocalRecognition;
  available?: (options: { langs: string[]; processLocally: true }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: true }) => Promise<boolean>;
}

export async function prepareLocalVoice(browser: Window = window): Promise<boolean> {
  const scope = browser as Window & { SpeechRecognition?: LocalRecognitionConstructor; webkitSpeechRecognition?: LocalRecognitionConstructor };
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognition?.available) return false;
  try {
    const availability = await Recognition.available({ langs: ['es-ES'], processLocally: true });
    if (availability === 'available') return true;
    if (availability !== 'downloadable' || !Recognition.install) return false;
    const installed = await Recognition.install({ langs: ['es-ES'], processLocally: true });
    return installed && await Recognition.available({ langs: ['es-ES'], processLocally: true }) === 'available';
  } catch { return false; }
}

export async function startLocalVoice(
  onTranscript: (text: string) => void,
  onError: (message: string) => void,
  browser: Window = window,
): Promise<boolean> {
  const scope = browser as Window & { SpeechRecognition?: LocalRecognitionConstructor; webkitSpeechRecognition?: LocalRecognitionConstructor };
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognition?.available) { onError('Este navegador no garantiza voz local. Usa el campo de texto.'); return false; }
  try {
    const availability = await Recognition.available({ langs: ['es-ES'], processLocally: true });
    if (availability !== 'available') {
      onError('El paquete de voz local en español no está instalado. Usa texto o instálalo antes de activar Modo Avión.');
      return false;
    }
    const recognition = new Recognition();
    if (!('processLocally' in recognition)) { onError('Reconocimiento local no disponible. Usa texto.'); return false; }
    recognition.processLocally = true;
    recognition.lang = 'es-ES';
    recognition.onresult = (event) => onTranscript(event.results[0][0].transcript);
    recognition.onerror = () => onError('No se reconoció la voz. Prueba escribiendo.');
    recognition.start();
    return true;
  } catch { onError('No se pudo activar el micrófono local. Usa texto.'); return false; }
}

export function speakLocally(text: string, browser: Window = window): boolean {
  const synth = browser.speechSynthesis;
  if (!synth) return false;
  const voice = synth.getVoices().find((candidate) => candidate.localService && candidate.lang.startsWith('es'));
  if (!voice) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
