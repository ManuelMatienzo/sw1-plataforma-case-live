import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard, Code2, Download, ExternalLink, FileJson, Play, RotateCcw, Server, Snowflake, Square, Trash2, X } from 'lucide-react';
import { springApi } from '../../services/springApi';
import type { GeneratedFile, GeneratedFileCategory, PostmanRequestItem, RunnerSnapshot, SpringProjectResult } from '../../types/spring';
import type { UMLDiagramAST } from '../../types/uml';
import './SpringProjectModal.css';

export interface SpringProjectModalProps {
  isOpen: boolean;
  onClose(): void;
  ast: UMLDiagramAST;
  sessionId?: string;
}

type Tab = 'code' | 'postman' | 'runner';
const EMPTY_RUNNER: RunnerSnapshot = { sesionId: '', status: 'IDLE', port: null, baseUrl: null, pid: null, startedAt: null, error: null, logs: [] };
const CATEGORY_LABELS: Record<GeneratedFileCategory, string> = {
  entity: 'Entity', repository: 'Repository', service: 'Service', controller: 'Controller',
  dto: 'DTO', config: 'Configuración', test: 'Pruebas', postman: 'Postman',
};
const STATUS_LABELS: Record<RunnerSnapshot['status'], string> = {
  IDLE: 'DETENIDO', STOPPED: 'DETENIDO', COMPILING: 'COMPILANDO', STARTING: 'INICIANDO', RUNNING: 'EJECUTANDO', ERROR: 'ERROR',
};

const saveLocal = (content: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
};

export default function SpringProjectModal({ isOpen, onClose, ast, sessionId }: SpringProjectModalProps) {
  const [tab, setTab] = useState<Tab>('code');
  const [project, setProject] = useState<SpringProjectResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PostmanRequestItem | null>(null);
  const [runner, setRunner] = useState<RunnerSnapshot>({ ...EMPTY_RUNNER, sesionId: sessionId ?? 'demo' });
  const [loading, setLoading] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [freezeScroll, setFreezeScroll] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true); setError('');
    const load = sessionId ? springApi.generarDesdeSesion(sessionId) : springApi.generarDesdeAst(ast);
    load.then((generated) => {
      if (!active) return;
      setProject(generated);
      setSelectedFile(generated.files.find((item) => item.category === 'entity') ?? generated.files[0] ?? null);
      setSelectedRequest(generated.postmanCollection.item[0]?.item[0] ?? null);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'No se pudo generar el proyecto.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    let active = true;
    springApi.obtenerEstado(sessionId).then((state) => active && setRunner(state)).catch(() => undefined);
    const disconnect = springApi.conectarLogs(sessionId, {
      onLog: (line) => setRunner((current) => ({ ...current, logs: [...current.logs, line].slice(-1000) })),
      onStatus: (status) => setRunner((current) => ({ ...status, logs: status.logs?.length ? status.logs : current.logs })),
    });
    return () => { active = false; disconnect(); };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (!freezeScroll && terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [runner.logs, freezeScroll]);

  const filesByCategory = useMemo(() => {
    const groups = new Map<GeneratedFileCategory, GeneratedFile[]>();
    for (const generated of project?.files ?? []) {
      if (generated.category === 'postman') continue;
      groups.set(generated.category, [...(groups.get(generated.category) ?? []), generated]);
    }
    return [...groups.entries()];
  }, [project]);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1600);
  };

  const downloadZip = async () => {
    if (sessionId) await springApi.descargarZip(sessionId);
    else if (project) saveLocal(JSON.stringify(project.files, null, 2), 'proyecto-spring-archivos.json', 'application/json');
  };

  const downloadPostman = async () => {
    if (sessionId) await springApi.descargarPostman(sessionId);
    else if (project) saveLocal(JSON.stringify(project.postmanCollection, null, 2), 'coleccion-postman.json', 'application/json');
  };

  const start = async () => {
    if (!sessionId) return;
    setRunnerBusy(true); setError('');
    try { setRunner(await springApi.iniciarRunner(sessionId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar el servidor.'); }
    finally { setRunnerBusy(false); }
  };

  const stop = async () => {
    if (!sessionId) return;
    setRunnerBusy(true);
    try { setRunner(await springApi.detenerRunner(sessionId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo detener el servidor.'); }
    finally { setRunnerBusy(false); }
  };

  if (!isOpen) return null;
  const active = ['COMPILING', 'STARTING', 'RUNNING'].includes(runner.status);

  return createPortal(
    <div className="spring-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={modalRef} className="spring-modal" role="dialog" aria-modal="true" aria-labelledby="spring-modal-title">
        <header className="spring-modal-header">
          <div className="spring-heading">
            <span className="spring-mark" aria-hidden="true"><Server size={21} /></span>
            <div><div className="spring-title-line"><h2 id="spring-modal-title">Backend Spring Boot 3 + Postman + Runner</h2><span>v3.2.4</span></div><p>Proyecto Java en cuatro capas, listo para inspeccionar, descargar y ejecutar.</p></div>
          </div>
          <div className="spring-header-actions">
            <button className="spring-primary" onClick={() => void downloadZip()} disabled={!project || loading} aria-label="Descargar Proyecto (.ZIP)"><Download size={16} />Descargar Proyecto (.ZIP)</button>
            <button className="spring-icon-button" onClick={onClose} aria-label="Cerrar modal" autoFocus><X size={20} /></button>
          </div>
        </header>

        <div className="spring-tabs" role="tablist" aria-label="Contenido del proyecto Spring">
          <button role="tab" aria-selected={tab === 'code'} onClick={() => setTab('code')}><Code2 size={16} />Código Java <small>4 capas</small></button>
          <button role="tab" aria-selected={tab === 'postman'} onClick={() => setTab('postman')}><FileJson size={16} />Colección Postman <small>v2.1</small></button>
          <button role="tab" aria-selected={tab === 'runner'} onClick={() => setTab('runner')}><Play size={16} />Runner en vivo <small>CU-14</small></button>
        </div>

        {error ? <div className="spring-error" role="alert"><strong>No se completó la acción.</strong><span>{error}</span></div> : null}
        {loading ? <div className="spring-loading"><RotateCcw className="spring-spin" /><p>Generando capas, pruebas y colección…</p></div> : null}

        {!loading && project && tab === 'code' ? (
          <div className="spring-code-layout" role="tabpanel">
            <aside className="spring-file-tree" aria-label="Archivos generados">
              <div className="spring-tree-summary"><strong>{project.summary.filesCount}</strong><span>archivos</span></div>
              {filesByCategory.map(([category, files]) => <div className="spring-file-group" key={category}><h3>{CATEGORY_LABELS[category]}</h3>{files.map((generated) => <button key={generated.path} className={selectedFile?.path === generated.path ? 'is-active' : ''} onClick={() => setSelectedFile(generated)} title={generated.path}>{generated.name}</button>)}</div>)}
            </aside>
            <section className="spring-code-panel" aria-label="Visor de código">
              <div className="spring-panel-toolbar"><code>{selectedFile?.path}</code><button onClick={() => selectedFile && void copy(selectedFile.content, 'file')} disabled={!selectedFile}>{copied === 'file' ? <Check size={15} /> : <Clipboard size={15} />}{copied === 'file' ? 'Copiado' : 'Copiar archivo'}</button></div>
              <pre className="spring-code"><code>{selectedFile?.content.split('\n').map((line, index) => <span className="spring-code-line" key={`${index}-${line}`}><span aria-hidden="true">{index + 1}</span>{line || ' '}</span>)}</code></pre>
            </section>
          </div>
        ) : null}

        {!loading && project && tab === 'postman' ? (
          <div className="spring-postman-layout" role="tabpanel">
            <aside className="spring-requests"><div className="spring-postman-download"><p><strong>{project.summary.endpointsCount}</strong> peticiones CRUD</p><button onClick={() => void downloadPostman()} aria-label="Descargar Colección Postman (.json)"><Download size={15} />Descargar Colección Postman (.json)</button></div>{project.postmanCollection.item.map((folder) => <div className="spring-request-folder" key={folder.name}><h3>{folder.name}</h3>{folder.item.map((item) => <button className={selectedRequest?.name === item.name ? 'is-active' : ''} key={item.name} onClick={() => setSelectedRequest(item)}><span className={`spring-http-${item.request.method.toLowerCase()}`}>{item.request.method}</span><span>{item.name}</span></button>)}</div>)}</aside>
            <section className="spring-request-detail"><div><span className={`spring-http-${selectedRequest?.request.method.toLowerCase()}`}>{selectedRequest?.request.method}</span><code>{selectedRequest?.request.url.raw}</code></div><h3>Payload de ejemplo</h3><pre><code>{selectedRequest?.request.body?.raw ?? '// Esta petición no requiere body.'}</code></pre><p>Incluye una prueba automática de código de estado compatible con Postman v2.1.</p></section>
          </div>
        ) : null}

        {!loading && project && tab === 'runner' ? (
          <div className="spring-runner" role="tabpanel">
            {!sessionId ? <div className="spring-runner-notice"><Snowflake size={18} /><div><strong>Runner disponible en sesiones colaborativas</strong><p>Guarda o abre el diagrama dentro de una sesión para compilar y ejecutar el backend en vivo.</p></div></div> : null}
            <div className="spring-runner-controls">
              <div className="spring-runner-status"><span className={`spring-status spring-status-${runner.status.toLowerCase()}`}>{STATUS_LABELS[runner.status]}</span><p>{runner.status === 'RUNNING' ? 'El proceso Maven está activo.' : runner.status === 'ERROR' ? runner.error : 'El runner usa el primer puerto libre desde 8080.'}</p></div>
              <div>{active ? <button className="spring-danger" onClick={() => void stop()} disabled={runnerBusy}><Square size={15} />Detener servidor</button> : <button className="spring-primary" onClick={() => void start()} disabled={!sessionId || runnerBusy}><Play size={15} />{runner.status === 'STOPPED' || runner.status === 'ERROR' ? 'Reiniciar' : 'Iniciar servidor'}</button>}</div>
            </div>
            <div className="spring-url-box"><div><span>URL activa</span><strong>{runner.baseUrl ?? 'Se asignará al iniciar'}</strong></div><button aria-label="Copiar URL activa" disabled={!runner.baseUrl} onClick={() => runner.baseUrl && void copy(runner.baseUrl, 'url')}>{copied === 'url' ? <Check size={16} /> : <Clipboard size={16} />}</button><button aria-label="Abrir URL activa en navegador" disabled={!runner.baseUrl} onClick={() => runner.baseUrl && window.open(runner.baseUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={16} /></button></div>
            <section className="spring-terminal"><header><div><i /><span>Consola Maven / Spring Boot</span></div><div><button onClick={() => setFreezeScroll((value) => !value)}>{freezeScroll ? 'Reanudar scroll' : 'Congelar scroll'}</button><button onClick={() => setRunner((current) => ({ ...current, logs: [] }))}><Trash2 size={14} />Limpiar</button></div></header><div className="spring-terminal-output" ref={terminalRef} role="log" aria-live="polite">{runner.logs.length ? runner.logs.map((line, index) => <div key={`${index}-${line}`}><span>{String(index + 1).padStart(3, '0')}</span>{line}</div>) : <p>$ Esperando el inicio del servidor…</p>}</div></section>
          </div>
        ) : null}
      </section>
    </div>, document.body,
  );
}
