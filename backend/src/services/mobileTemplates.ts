import { MobileAppConfig, MobileGeneratedFile } from '../models/mobile.types';
import { mobileIconPng } from './mobileIcon';

const file = (path: string, content: string, mimeType: string, encoding?: 'base64'): MobileGeneratedFile => ({ path, content, mimeType, encoding });
const htmlEscape = (value: string): string => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

const nluEngine = String.raw`
const normal = (text) => text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
const entityFor = (text, entities) => entities.find((entity) => {
  const name = normal(entity.name);
  return text.includes(name) || text.includes(name + 's') || text.includes(name + 'es');
});
export function interpret(text, entities, records) {
  const phrase = normal(text);
  const original = text.replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(ayuda|que puedo hacer|comandos)/.test(phrase)) return { intent: 'HELP', reply: 'Puedes buscar, contar, registrar o abrir una entidad.' };
  const entity = entityFor(phrase, entities);
  if (!entity) return { intent: 'UNKNOWN', reply: 'No reconocí la entidad. Prueba con: ' + entities.map((item) => item.name).join(', ') + '.' };
  const list = records[entity.name] || [];
  if (/^(cuantos|cuantas|contar)/.test(phrase)) return { intent: 'COUNT_RECORDS', entity: entity.name, reply: 'Hay ' + list.length + ' ' + (list.length === 1 ? 'registro' : 'registros') + ' de ' + entity.name + '.' };
  if (/^(ir|abre|abrir|muestra|mostrar).*(pantalla|formulario|registros)/.test(phrase)) {
    return { intent: 'NAVIGATE_SCREEN', entity: entity.name, screen: /formulario/.test(phrase) ? 'form' : 'list', reply: 'Abriendo ' + entity.name + '.' };
  }
  if (/^(registra|registrar|crea|crear|agrega|agregar)/.test(phrase)) {
    const slots = {};
    for (let i = 0; i < entity.fields.length; i++) {
      const field = entity.fields[i];
      const label = normal(field.name);
      const at = phrase.indexOf(label + ' ');
      if (at < 0) continue;
      const rest = original.slice(at + label.length + 1);
      const normalizedRest = normal(rest);
      const next = entity.fields.filter((other) => other.name !== field.name)
        .map((other) => normalizedRest.indexOf(' y ' + normal(other.name) + ' '))
        .filter((position) => position >= 0);
      const value = rest.slice(0, next.length ? Math.min(...next) : undefined).trim();
      if (value) slots[field.name] = field.inputType === 'number' ? Number(value) : field.inputType === 'checkbox' ? /^(si|true|1)$/.test(value) : value;
    }
    const missing = entity.fields.filter((field) => field.required && (slots[field.name] === undefined || slots[field.name] === '')).map((field) => field.label);
    if (missing.length) return { intent: 'CLARIFY', entity: entity.name, slots, reply: 'Faltan estos datos: ' + missing.join(', ') + '.' };
    return { intent: 'CREATE_RECORD', entity: entity.name, slots, reply: 'Registro de ' + entity.name + ' guardado en este dispositivo.' };
  }
  if (/^(busca|buscar|encuentra|mostrar|muestra)/.test(phrase)) {
    const query = phrase.split(normal(entity.name)).pop().replace(/^(s|es|al|a|el|la)\s*/, '').trim();
    const matches = list.filter((record) => Object.values(record).some((value) => normal(String(value)).includes(query)));
    return { intent: 'SEARCH_RECORDS', entity: entity.name, query, matches, reply: matches.length + ' resultados de ' + entity.name + '.' };
  }
  return { intent: 'UNKNOWN', reply: 'Prueba: cuántos ' + entity.name + ' hay, busca ' + entity.name + ' o registra ' + entity.name + '.' };
}
`.trimStart();

const syncManager = String.raw`
const newId = () => globalThis.crypto?.randomUUID?.() || 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
export class SyncManager {
  constructor(key, apiBase, entities, onChange = () => {}) {
    this.key = 'case-mobile-v1:' + key;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.entities = entities;
    this.onChange = onChange;
    try { this.state = JSON.parse(localStorage.getItem(this.key) || 'null') || { records: {}, outbox: [] }; }
    catch { this.state = { records: {}, outbox: [] }; }
    for (const entity of entities) this.state.records[entity.name] ||= [];
    this.online = navigator.onLine;
    this.onOnline = () => { this.online = true; this.sync(); this.onChange(); };
    this.onOffline = () => { this.online = false; this.onChange(); };
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }
  dispose() { window.removeEventListener('online', this.onOnline); window.removeEventListener('offline', this.onOffline); }
  save() { localStorage.setItem(this.key, JSON.stringify(this.state)); this.onChange(); }
  pending() { return this.state.outbox.filter((item) => item.status === 'PENDING'); }
  async discard(id) {
    const item = this.pending().find((entry) => entry.id === id);
    if (!item) return;
    this.state.outbox = this.state.outbox.filter((entry) => entry.id !== id);
    if (item.action === 'CREATE') this.state.records[item.entity] = this.list(item.entity).filter((record) => String(record.id) !== String(item.payload.id));
    this.error = ''; this.save();
    if (this.online) await this.refresh();
  }
  list(entity) { return this.state.records[entity] || []; }
  add(entity, payload) {
    const record = { ...payload, id: newId(), syncStatus: 'PENDING' };
    this.state.records[entity].push(record);
    this.queue('CREATE', entity, record);
    return record;
  }
  update(entity, id, payload) {
    const records = this.state.records[entity];
    const index = records.findIndex((item) => String(item.id) === String(id));
    if (index < 0) throw new Error('Registro no encontrado');
    const record = { ...records[index], ...payload, syncStatus: 'PENDING' };
    records[index] = record;
    this.queue('UPDATE', entity, record);
    return record;
  }
  remove(entity, id) {
    const records = this.state.records[entity];
    const index = records.findIndex((item) => String(item.id) === String(id));
    if (index < 0) throw new Error('Registro no encontrado');
    const [record] = records.splice(index, 1);
    this.queue('DELETE', entity, record);
  }
  queue(action, entity, payload) {
    this.state.outbox.push({ id: newId(), action, entity, payload, timestamp: new Date().toISOString(), status: 'PENDING' });
    this.save();
    if (this.online) void this.sync();
  }
  async sync() {
    if (!this.online || this.syncing || !this.apiBase) return;
    this.syncing = true;
    try {
      for (const item of this.pending()) {
        const descriptor = this.entities.find((entity) => entity.name === item.entity);
        if (!descriptor) continue;
        const id = item.payload.id;
        const endpoint = this.apiBase + '/' + descriptor.route + (item.action === 'CREATE' ? '' : '/' + encodeURIComponent(String(id)));
        const body = { ...item.payload };
        delete body.id; delete body.syncStatus;
        let response;
        try { response = await fetch(endpoint, {
          method: item.action === 'CREATE' ? 'POST' : item.action === 'UPDATE' ? 'PUT' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: item.action === 'DELETE' ? undefined : JSON.stringify(body),
        }); } catch { this.error = 'Backend no disponible. Los cambios siguen pendientes.'; break; }
        if (!response.ok) { this.error = response.status === 409 ? 'Conflicto: revisa los cambios pendientes.' : 'Error HTTP ' + response.status; break; }
        if (item.action === 'CREATE') {
          const remote = await response.json();
          const remoteId = remote.id;
          if (remoteId !== undefined) {
            const record = this.state.records[item.entity].find((entry) => String(entry.id) === String(id));
            if (record) record.id = remoteId;
            for (const later of this.pending()) if (later.entity === item.entity && String(later.payload.id) === String(id)) later.payload.id = remoteId;
          }
        }
        item.status = 'SYNCED';
        const record = this.state.records[item.entity].find((entry) => String(entry.id) === String(item.payload.id));
        if (record && !this.pending().some((later) => later.entity === item.entity && String(later.payload.id) === String(record.id))) record.syncStatus = 'SYNCED';
        this.error = '';
        this.save();
      }
    } finally { this.syncing = false; this.onChange(); }
  }
  async refresh() {
    if (!navigator.onLine || !this.apiBase) return;
    for (const entity of this.entities) {
      try {
        const response = await fetch(this.apiBase + '/' + entity.route);
        if (!response.ok) continue;
        const remote = await response.json();
        if (!Array.isArray(remote)) continue;
        const pendingIds = new Set(this.pending().filter((item) => item.entity === entity.name).map((item) => String(item.payload.id)));
        const local = this.list(entity.name).filter((item) => pendingIds.has(String(item.id)));
        this.state.records[entity.name] = [...remote.filter((item) => !pendingIds.has(String(item.id))).map((item) => ({ ...item, syncStatus: 'SYNCED' })), ...local];
      } catch { return; }
    }
    this.save();
  }
}
`.trimStart();

const app = String.raw`
import { interpret } from './nluEngine.js';
import { SyncManager } from './syncManager.js';

const config = await fetch('./config.json').then((response) => response.json());
const root = document.getElementById('app');
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const manager = new SyncManager(location.pathname, localStorage.getItem('case-mobile-api:' + location.pathname) || config.backendBaseUrl, config.entities, render);
let selected = config.entities[0];
let screen = 'list';
let selectedId = null;
let query = '';
let assistantOpen = false;
let assistantText = '';
let assistantReply = 'Hola. Puedo ayudarte con tus registros, incluso sin conexión.';
let micMessage = '';
const findRecord = () => manager.list(selected.name).find((item) => String(item.id) === String(selectedId));
const status = () => !manager.online ? 'Sin conexión · ' + manager.pending().length + ' pendientes'
  : manager.pending().length ? manager.pending().length + (manager.pending().length === 1 ? ' cambio pendiente' : ' cambios pendientes') : manager.apiBase ? 'Sincronizado' : 'Sin backend';
function renderList() {
  const records = manager.list(selected.name).filter((item) => Object.values(item).some((value) => String(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  return '<label class="search-label">Buscar en ' + safe(selected.name) + '<input id="search" type="search" value="' + safe(query) + '" placeholder="Nombre, código o atributo"></label>' +
    '<div class="list-count">' + records.length + (records.length === 1 ? ' registro' : ' registros') + '</div>' +
    (records.length ? records.map((record) => '<button class="record-row" data-detail="' + safe(record.id) + '"><strong>' + safe(Object.values(record).find((value) => typeof value === 'string' && value !== record.id) || selected.name) + '</strong><small>' + safe(record.syncStatus === 'PENDING' ? 'Pendiente' : 'Disponible') + '</small></button>').join('')
      : '<p class="empty">Aún no hay registros. Usa “Nuevo” o pide al asistente que registre uno.</p>') +
    '<button class="primary add-button" data-screen="form">Nuevo ' + safe(selected.name) + '</button>';
}
function renderDetail() {
  const record = findRecord();
  if (!record) return '<p class="empty">Este registro ya no está disponible.</p>';
  return '<div class="detail">' + selected.fields.map((field) => '<div><span>' + safe(field.label) + '</span><strong>' + safe(record[field.name] ?? '—') + '</strong></div>').join('') + '</div>' +
    '<div class="detail-actions"><button data-screen="form">Editar</button><button class="danger" data-delete="' + safe(record.id) + '">Eliminar</button></div>';
}
function renderForm() {
  const record = findRecord();
  return '<form id="entity-form"><h2>' + (record ? 'Editar ' : 'Nuevo ') + safe(selected.name) + '</h2>' +
    selected.fields.map((field) => '<label>' + safe(field.label) +
      '<input name="' + safe(field.name) + '" type="' + safe(field.inputType) + '" ' +
      (field.inputType === 'checkbox' ? (record?.[field.name] ? 'checked' : '') : 'value="' + safe(record?.[field.name] ?? '') + '"') +
      (field.required ? ' required' : '') + '></label>').join('') +
    '<div class="form-actions"><button type="button" data-screen="' + (record ? 'detail' : 'list') + '">Cancelar</button><button class="primary" type="submit">Guardar</button></div></form>';
}
function render() {
  root.innerHTML = '<header class="app-header"><div><small>CASE IA · MÓVIL</small><h1>' + safe(config.name) + '</h1></div><span class="sync-status" aria-live="polite">' + safe(status()) + '</span></header>' +
    '<main id="main"><div class="section-head"><h2>' + safe(selected.name) + '</h2><span>' + (screen === 'list' ? 'Listado' : screen === 'detail' ? 'Detalle' : 'Formulario') + '</span></div>' +
    (manager.error ? '<div class="sync-error" role="alert">' + safe(manager.error) + '<button data-sync="retry">Reintentar</button><button data-sync="discard">Descartar primer cambio</button></div>' : '') +
    '<details class="backend-settings"><summary>Conexión al backend</summary><form id="backend-form"><label>URL API Spring Boot<input name="apiBase" type="url" placeholder="http://192.168.1.2:8080/api/v1" value="' + safe(manager.apiBase) + '"></label><button type="submit">Guardar conexión</button></form></details>' +
    (screen === 'list' ? renderList() : screen === 'detail' ? renderDetail() : renderForm()) + '</main>' +
    '<button class="assistant-fab" aria-label="Abrir asistente local" data-assistant="toggle">Asistente</button>' +
    '<nav class="bottom-nav" aria-label="Entidades">' + config.entities.map((entity) => '<button data-entity="' + safe(entity.name) + '" ' + (entity.name === selected.name ? 'aria-current="page"' : '') + '>' + safe(entity.name) + '</button>').join('') + '</nav>' +
    (assistantOpen ? '<section class="assistant" aria-label="Asistente local"><div class="assistant-head"><strong>Asistente local</strong><button data-assistant="toggle" aria-label="Cerrar asistente">×</button></div><p class="assistant-reply" aria-live="polite">' + safe(assistantReply) + '</p><form id="assistant-form"><label>Escribe una orden<input name="command" value="' + safe(assistantText) + '" placeholder="¿Cuántos pacientes hay?"></label><button class="primary" type="submit">Enviar</button></form><button data-assistant="mic">Usar voz local</button><button data-assistant="prepare">Preparar voz local</button><small>' + safe(micMessage || 'La voz solo se activa si el navegador confirma reconocimiento en el dispositivo.') + '</small></section>' : '');
}
function runCommand(value) {
  const result = interpret(value, config.entities, manager.state.records);
  assistantReply = result.reply;
  if (result.intent === 'CREATE_RECORD') manager.add(result.entity, result.slots);
  if (result.intent === 'NAVIGATE_SCREEN') {
    selected = config.entities.find((entity) => entity.name === result.entity) || selected;
    selectedId = null; screen = result.screen;
  }
  if (result.intent === 'SEARCH_RECORDS') {
    selected = config.entities.find((entity) => entity.name === result.entity) || selected;
    screen = 'list'; query = result.query;
  }
  assistantText = '';
  render();
  const synth = window.speechSynthesis;
  if (!synth) return;
  const voices = synth.getVoices();
  const localVoice = voices.find((voice) => voice.localService && voice.lang.startsWith('es'));
  if (localVoice) { const utterance = new SpeechSynthesisUtterance(result.reply); utterance.voice = localVoice; synth.speak(utterance); }
}
async function prepareVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition?.available || !Recognition.install) { micMessage = 'Este navegador no permite instalar voz local. Usa texto.'; render(); return; }
  try {
    const availability = await Recognition.available({ langs: ['es-ES'], processLocally: true });
    if (availability === 'available') { micMessage = 'Voz local lista para Modo Avión.'; render(); return; }
    if (availability !== 'downloadable' || !navigator.onLine) { micMessage = 'Conecta el dispositivo para preparar la voz local.'; render(); return; }
    const installed = await Recognition.install({ langs: ['es-ES'], processLocally: true });
    micMessage = installed ? 'Voz local lista para Modo Avión.' : 'No se pudo instalar voz local. Usa texto.';
  } catch { micMessage = 'No se pudo preparar voz local. Usa texto.'; }
  render();
}
async function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || typeof Recognition.available !== 'function') { micMessage = 'Voz local no disponible. Usa el campo de texto.'; render(); return; }
  try {
    const availability = await Recognition.available({ langs: ['es-ES'], processLocally: true });
    if (availability !== 'available') { micMessage = 'Falta el paquete de voz español en este dispositivo. Instálalo con conexión y vuelve a probar.'; render(); return; }
    const recognition = new Recognition();
    if (!('processLocally' in recognition)) { micMessage = 'Este navegador no garantiza voz local. Usa texto.'; render(); return; }
    recognition.processLocally = true; recognition.lang = 'es-ES';
    recognition.onresult = (event) => runCommand(event.results[0][0].transcript);
    recognition.onerror = () => { micMessage = 'No se reconoció la voz. Prueba con texto.'; render(); };
    recognition.start(); micMessage = 'Escuchando en el dispositivo…'; render();
  } catch { micMessage = 'No se pudo activar la voz local. Usa texto.'; render(); }
}
root.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.entity) { selected = config.entities.find((entity) => entity.name === button.dataset.entity) || selected; screen = 'list'; selectedId = null; query = ''; render(); }
  else if (button.dataset.detail) { selectedId = button.dataset.detail; screen = 'detail'; render(); }
  else if (button.dataset.screen) { screen = button.dataset.screen; render(); }
  else if (button.dataset.delete) { if (confirm('¿Eliminar este registro?')) { manager.remove(selected.name, button.dataset.delete); screen = 'list'; render(); } }
  else if (button.dataset.assistant === 'toggle') { assistantOpen = !assistantOpen; render(); }
  else if (button.dataset.assistant === 'mic') void startVoice();
  else if (button.dataset.assistant === 'prepare') void prepareVoice();
  else if (button.dataset.sync === 'retry') void manager.sync();
  else if (button.dataset.sync === 'discard') { const first = manager.pending()[0]; if (first && confirm('¿Descartar este cambio pendiente?')) void manager.discard(first.id); }
});
root.addEventListener('input', (event) => {
  if (event.target.id === 'search') { query = event.target.value; const focus = event.target.selectionStart; render(); const input = document.getElementById('search'); input?.focus(); input?.setSelectionRange(focus, focus); }
});
root.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'assistant-form') { runCommand(new FormData(form).get('command')?.toString() || ''); return; }
  if (form.id === 'backend-form') { const url = String(new FormData(form).get('apiBase') || '').trim().replace(/\/$/, ''); if (url && !/^https?:\/\/[^/\s]+\/api\/v1$/.test(url)) { alert('Usa una URL que termine en /api/v1'); return; } manager.apiBase = url; localStorage.setItem('case-mobile-api:' + location.pathname, url); render(); void manager.sync().then(() => manager.refresh()); return; }
  if (form.id !== 'entity-form') return;
  const data = new FormData(form);
  const payload = {};
  for (const field of selected.fields) {
    const value = data.get(field.name);
    payload[field.name] = field.inputType === 'checkbox' ? value === 'on' : field.inputType === 'number' ? (value === '' ? null : Number(value)) : value;
  }
  if (selectedId) manager.update(selected.name, selectedId, payload); else manager.add(selected.name, payload);
  screen = 'list'; selectedId = null; render();
});
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {});
render();
void manager.sync().then(() => manager.refresh());
`.trimStart();

const css = String.raw`
:root{font-family:system-ui,-apple-system,sans-serif;color:#f4f7ff;background:#0b0e14;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;min-width:280px}button,input{font:inherit}button{cursor:pointer;min-height:44px}button:focus-visible,input:focus-visible{outline:3px solid #9db0ff;outline-offset:2px}
.app-header{padding:env(safe-area-inset-top) 20px 18px;background:#111827;border-bottom:1px solid #2b3a52;display:flex;justify-content:space-between;gap:12px;align-items:end}
.app-header small{font-size:11px;letter-spacing:.12em;color:#a5b4cc}.app-header h1{font-size:18px;margin:6px 0 0}.sync-status{font-size:11px;color:#22d3a0;text-align:right}
main{padding:22px 20px calc(130px + env(safe-area-inset-bottom));max-width:680px;margin:auto}.section-head{display:flex;align-items:baseline;justify-content:space-between}.section-head h2{font-size:22px;margin:0 0 20px}.section-head span,.list-count{color:#a5b4cc;font-size:12px}
.search-label,form label{display:grid;gap:8px;font-size:13px;color:#a5b4cc;margin-bottom:14px}input{width:100%;min-height:44px;border:1px solid #2b3a52;border-radius:10px;background:#111827;color:#f4f7ff;padding:10px 12px}
input[type=checkbox]{width:22px;min-height:22px}.list-count{margin:18px 0 8px}.record-row{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;padding:14px 4px;background:none;color:#f4f7ff;border:0;border-bottom:1px solid #2b3a52}
.record-row small{color:#f4c76b}.empty{color:#a5b4cc;line-height:1.5;padding:30px 0}.primary{background:#405bd6;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700}.primary:hover{background:#4a66e0}.add-button{width:100%;margin-top:24px}
.detail>div{display:grid;gap:5px;padding:14px 0;border-bottom:1px solid #2b3a52}.detail span{color:#a5b4cc;font-size:12px}.detail-actions,.form-actions{display:flex;gap:10px;margin-top:24px}.detail-actions button,.form-actions button{flex:1;border:1px solid #2b3a52;background:#111827;color:#f4f7ff;border-radius:10px}.detail-actions .danger{color:#ff8a99}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;display:flex;overflow-x:auto;background:#111827;border-top:1px solid #2b3a52;padding:8px 10px calc(8px + env(safe-area-inset-bottom));gap:5px;z-index:3}
.bottom-nav button{flex:1;min-width:88px;color:#a5b4cc;background:none;border:0;border-radius:8px;font-size:12px}.bottom-nav button[aria-current=page]{color:#fff;background:#3045a3}
.assistant-fab{position:fixed;right:18px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:4;border:0;border-radius:24px;background:#405bd6;color:#fff;padding:0 18px;box-shadow:0 8px 24px #0006}
.assistant{position:fixed;z-index:5;bottom:calc(125px + env(safe-area-inset-bottom));left:12px;right:12px;max-width:480px;margin:auto;background:#172235;border:1px solid #2b3a52;border-radius:14px;padding:18px;box-shadow:0 16px 40px #0008}
.assistant-head{display:flex;justify-content:space-between;align-items:center}.assistant-head button{background:none;border:0;color:#f4f7ff;font-size:24px}.assistant-reply{line-height:1.5}.assistant form{display:flex;align-items:end;gap:8px}.assistant form label{flex:1;margin:0}.assistant small{display:block;color:#a5b4cc;line-height:1.4;margin-top:8px}
.backend-settings{margin:0 0 18px;border:1px solid #2b3a52;border-radius:10px;padding:12px;color:#a5b4cc}.backend-settings summary{cursor:pointer}.backend-settings form{margin-top:14px}.backend-settings button,.sync-error button{border:1px solid #8298ee;background:#223769;color:#fff;border-radius:8px;padding:8px 12px;margin:4px}.sync-error{border:1px solid #b85968;background:#3b1d2b;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px}
::selection{background:#405bd6;color:#fff}@media(max-width:360px){.app-header{padding-left:14px;padding-right:14px}main{padding-left:14px;padding-right:14px}}
`.trimStart();

const sw = String.raw`
const CACHE = 'case-mobile-v1';
const SHELL = ['./', './index.html', './app.css', './app.js', './nluEngine.js', './syncManager.js', './config.json', './manifest.json', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/v1/')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || caches.match('./index.html')));
});
`.trimStart();

export const mobileFiles = (config: MobileAppConfig): MobileGeneratedFile[] => {
  const manifest = {
    name: config.name, short_name: config.shortName, start_url: './', scope: './', display: 'standalone',
    background_color: config.backgroundColor, theme_color: config.themeColor,
    icons: [
      { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="#0b0e14"/><path d="M36 96h120M96 36v120" stroke="#3b82f6" stroke-width="18" stroke-linecap="round"/><circle cx="96" cy="96" r="36" fill="none" stroke="#f4f7ff" stroke-width="8"/></svg>';
  const html = '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#3b82f6"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="manifest" href="./manifest.json"><link rel="icon" href="./icon.svg" type="image/svg+xml"><link rel="stylesheet" href="./app.css"><title>' + htmlEscape(config.name) + '</title></head><body><div id="app"></div><script type="module" src="./app.js"></script></body></html>';
  return [
    file('index.html', html, 'text/html; charset=utf-8'),
    file('manifest.json', JSON.stringify(manifest, null, 2), 'application/manifest+json'),
    file('manifest.webmanifest', JSON.stringify(manifest, null, 2), 'application/manifest+json'),
    file('config.json', JSON.stringify(config, null, 2), 'application/json'),
    file('icon.svg', icon, 'image/svg+xml'),
    file('icon-192.png', mobileIconPng(192).toString('base64'), 'image/png', 'base64'),
    file('icon-512.png', mobileIconPng(512).toString('base64'), 'image/png', 'base64'),
    file('sw.js', sw, 'text/javascript; charset=utf-8'),
    file('app.js', app, 'text/javascript; charset=utf-8'),
    file('app.css', css, 'text/css; charset=utf-8'),
    file('nluEngine.js', nluEngine, 'text/javascript; charset=utf-8'),
    file('syncManager.js', syncManager, 'text/javascript; charset=utf-8'),
  ];
};
