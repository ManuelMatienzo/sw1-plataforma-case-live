import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Cloud, CloudOff, Mic, Plus, Search, Send, WifiOff } from 'lucide-react';
import { interpretLocalCommand, prepareLocalVoice, speakLocally, startLocalVoice } from '../../services/localNluEngine';
import { OutboxSyncManager } from '../../services/outboxSyncManager';
import type { MobileAppResult, MobileEntity, MobileScreen } from '../../types/mobile';

interface Props { project: MobileAppResult }

export default function MobileSimulator({ project }: Props) {
  const [revision, setRevision] = useState(0);
  const manager = useMemo(() => new OutboxSyncManager({
    namespace: 'sim-' + project.appId,
    entities: project.config.entities,
    backendBaseUrl: project.config.backendBaseUrl,
    onChange: () => setRevision((current) => current + 1),
  }), [project.appId]);
  const [entity, setEntity] = useState<MobileEntity>(project.config.entities[0]);
  const [screen, setScreen] = useState<MobileScreen>('list');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [reply, setReply] = useState('Puedo ayudarte con tus registros, incluso sin conexión.');
  const [voiceNote, setVoiceNote] = useState('La voz solo se activa si el navegador confirma procesamiento local.');
  const [airplane, setAirplane] = useState(false);
  void revision;

  useEffect(() => manager.attachConnectivity(), [manager]);
  useEffect(() => { manager.setBackendBaseUrl(project.config.backendBaseUrl); }, [manager, project.config.backendBaseUrl]);
  const pending = manager.pending();
  const selected = manager.list(entity.name).find((item) => String(item.id) === String(selectedId));
  const records = manager.list(entity.name).filter((item) => Object.values(item).some((value) => String(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const offline = airplane || !manager.isOnline;

  const navigate = (next: MobileEntity) => { setEntity(next); setScreen('list'); setSelectedId(null); setQuery(''); };
  const submitRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of entity.fields) {
      const raw = data.get(field.name);
      payload[field.name] = field.inputType === 'checkbox' ? raw === 'on'
        : field.inputType === 'number' ? (raw === '' ? null : Number(raw)) : raw;
    }
    if (selectedId !== null) manager.update(entity.name, selectedId, payload);
    else manager.create(entity.name, payload);
    setScreen('list'); setSelectedId(null); setQuery('');
  };
  const executeCommand = (value: string) => {
    const result = interpretLocalCommand(value, project.config.entities, manager.records);
    if (result.intent === 'CREATE_RECORD' && result.entity && result.slots) manager.create(result.entity, result.slots);
    if ((result.intent === 'NAVIGATE_SCREEN' || result.intent === 'SEARCH_RECORDS') && result.entity) {
      const next = project.config.entities.find((item) => item.name === result.entity);
      if (next) setEntity(next);
      setScreen(result.screen ?? 'list');
      setQuery(result.query ?? '');
      setSelectedId(null);
    }
    setReply(result.reply);
    setCommand('');
    speakLocally(result.reply);
  };
  const submitCommand = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); executeCommand(command); };
  const toggleAirplane = () => {
    const next = !airplane;
    setAirplane(next);
    manager.setOnline(!next && navigator.onLine);
  };
  const startVoice = async () => {
    const started = await startLocalVoice(executeCommand, setVoiceNote);
    if (started) setVoiceNote('Escuchando en este dispositivo…');
  };
  const prepareVoice = async () => {
    setVoiceNote(await prepareLocalVoice() ? 'Voz local lista para Modo Avión.' : 'No se pudo instalar voz local. Usa el asistente por texto.');
  };

  return <div className="mobile-sim-app" data-online={!offline}>
    <div className="mobile-sim-top">
      <div><small>CASE IA · MÓVIL</small><h3>{project.config.name}</h3></div>
      <button type="button" className="mobile-network-toggle" onClick={toggleAirplane} aria-pressed={airplane} aria-label={airplane ? 'Desactivar Modo Avión' : 'Activar Modo Avión'}>
        <WifiOff size={15} />{airplane ? 'Modo Avión' : 'Online'}
      </button>
    </div>
    <div className={'mobile-sync ' + (offline ? 'is-offline' : pending.length ? 'is-pending' : 'is-synced')} role="status">
      {offline ? <CloudOff size={15} /> : <Cloud size={15} />}
      <span>{offline ? 'Sin conexión · ' : ''}{pending.length ? `${pending.length} cambio${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'}` : offline ? 'cambios locales' : 'Sincronizado'}</span>
    </div>
    {manager.error ? <div className="mobile-sim-error" role="alert"><span>{manager.error}</span><button onClick={() => void manager.sync()}>Reintentar</button>{pending[0] ? <button onClick={() => manager.discardPending(pending[0].id)}>Descartar cambio</button> : null}</div> : null}
    {!project.config.backendBaseUrl ? <p className="mobile-sim-hint">Backend sin ejecutar: los cambios quedan en este dispositivo.</p> : null}
    <main className="mobile-sim-main">
      <div className="mobile-sim-section"><h4>{entity.name}</h4><span>{screen === 'list' ? 'Listado' : screen === 'detail' ? 'Detalle' : 'Formulario'}</span></div>
      {screen === 'list' ? <>
        <label className="mobile-sim-search"><Search size={15} /><span className="sr-only">Buscar {entity.name}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar registros" /></label>
        <div className="mobile-sim-count">{records.length} {records.length === 1 ? 'registro' : 'registros'}</div>
        {records.length ? records.map((record) => <button key={String(record.id)} className="mobile-sim-row" onClick={() => { setSelectedId(record.id); setScreen('detail'); }}>
          <strong>{String(entity.fields.map((field) => record[field.name]).find((value) => typeof value === 'string' && value) ?? entity.name)}</strong>
          <small>{record.syncStatus === 'PENDING' ? 'Pendiente' : 'Disponible'}</small>
        </button>) : <p className="mobile-sim-empty">Aún no hay registros. Crea uno aquí o pídeselo al asistente.</p>}
        <button className="mobile-sim-primary mobile-sim-add" onClick={() => { setSelectedId(null); setScreen('form'); }}><Plus size={17} />Nuevo {entity.name}</button>
      </> : null}
      {screen === 'detail' ? selected ? <>
        <dl className="mobile-sim-detail">{entity.fields.map((field) => <div key={field.name}><dt>{field.label}</dt><dd>{String(selected[field.name] ?? '—')}</dd></div>)}</dl>
        <div className="mobile-sim-actions"><button onClick={() => setScreen('form')}>Editar</button><button className="is-danger" onClick={() => { if (selectedId !== null && window.confirm('¿Eliminar este registro?')) { manager.remove(entity.name, selectedId); setSelectedId(null); setScreen('list'); } }}>Eliminar</button></div>
        <button className="mobile-sim-back" onClick={() => setScreen('list')}>Volver al listado</button>
      </> : <p className="mobile-sim-empty">Este registro ya no está disponible.</p> : null}
      {screen === 'form' ? <form className="mobile-sim-form" onSubmit={submitRecord}>
        {entity.fields.map((field) => <label key={field.name}>{field.label}<input name={field.name} type={field.inputType} required={field.required} defaultValue={field.inputType === 'checkbox' ? undefined : String(selected?.[field.name] ?? '')} defaultChecked={field.inputType === 'checkbox' ? Boolean(selected?.[field.name]) : undefined} /></label>)}
        <div className="mobile-sim-actions"><button type="button" onClick={() => setScreen(selected ? 'detail' : 'list')}>Cancelar</button><button className="mobile-sim-primary" type="submit">Guardar</button></div>
      </form> : null}
    </main>
    <button className="mobile-sim-assistant-fab" aria-label="Abrir asistente local" onClick={() => setAssistantOpen(true)}><Mic size={18} /></button>
    <nav className="mobile-sim-nav" aria-label="Entidades de la app">{project.config.entities.map((item) => <button key={item.name} aria-current={entity.name === item.name ? 'page' : undefined} onClick={() => navigate(item)}>{item.name}</button>)}</nav>
    {assistantOpen ? <section className="mobile-sim-assistant" aria-label="Asistente local"><div><strong>Asistente local</strong><button aria-label="Cerrar asistente" onClick={() => setAssistantOpen(false)}>×</button></div><p aria-live="polite">{reply}</p>
      <form onSubmit={submitCommand}><label>Escribe una orden<input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="¿Cuántos pacientes hay?" /></label><button type="submit" aria-label="Enviar orden"><Send size={17} /></button></form>
      <button className="mobile-sim-voice" onClick={() => void startVoice()}><Mic size={15} />Usar voz local</button><button className="mobile-sim-voice" onClick={() => void prepareVoice()} disabled={offline}>Preparar voz local</button><small>{voiceNote}</small></section> : null}
  </div>;
}
