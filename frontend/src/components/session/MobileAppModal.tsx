import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard, Code2, Download, ExternalLink, QrCode, Smartphone, X } from 'lucide-react';
import * as QRCode from 'qrcode';
import { mobileAppApi } from '../../services/mobileAppApi';
import type { MobileAccess, MobileAppResult, MobileGeneratedFile } from '../../types/mobile';
import type { UMLDiagramAST } from '../../types/uml';
import MobileSimulator from './MobileSimulator';
import './MobileAppModal.css';

interface Props { isOpen: boolean; onClose(): void; ast: UMLDiagramAST; sessionId?: string }
type Tab = 'simulator' | 'qr' | 'code';

export default function MobileAppModal({ isOpen, onClose, ast, sessionId }: Props) {
  const [tab, setTab] = useState<Tab>('simulator');
  const [project, setProject] = useState<MobileAppResult | null>(null);
  const [access, setAccess] = useState<MobileAccess | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<MobileGeneratedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !modalRef.current) return;
      const elements = [...modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])')];
      if (!elements.length) return;
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true); setError('');
    const generate = sessionId ? mobileAppApi.generateSession(sessionId) : mobileAppApi.generateDirect(ast);
    generate.then(async (result) => {
      if (!active) return;
      setProject(result);
      setSelectedFile(result.files[0] ?? null);
      setAccess(result.access);
      if (sessionId) {
        try { const latest = await mobileAppApi.getQr(sessionId); if (active) setAccess(latest); }
        catch { /* La URL de la respuesta de generación sigue disponible. */ }
      }
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo generar la app móvil.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (!access?.url) return;
    let active = true;
    QRCode.toDataURL(access.url, { width: 640, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#0b0e14', light: '#ffffff' } })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(''); });
    return () => { active = false; };
  }, [access?.url]);

  const download = async () => {
    if (!project) return;
    try { if (sessionId) await mobileAppApi.downloadZip(sessionId); else await mobileAppApi.downloadZipDirect(ast); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo descargar el ZIP.'); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('No se pudo copiar. Selecciona y copia la URL manualmente.'); }
  };

  if (!isOpen) return null;
  return createPortal(<div className="mobile-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="mobile-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="mobile-modal-title">
      <header className="mobile-modal-header">
        <div className="mobile-modal-heading"><span className="mobile-modal-mark" aria-hidden="true"><Smartphone size={20} /></span><div><h2 id="mobile-modal-title">App móvil PWA + asistente local</h2><p>Simula, instala y descarga la aplicación derivada del diagrama UML.</p></div></div>
        <div className="mobile-modal-header-actions"><button className="mobile-modal-primary" onClick={() => void download()} disabled={!project || loading}><Download size={16} />Descargar App Móvil (.ZIP)</button><button className="mobile-modal-icon" onClick={onClose} aria-label="Cerrar modal" autoFocus><X size={19} /></button></div>
      </header>
      <div className="mobile-modal-tabs" role="tablist" aria-label="Contenido de la app móvil">
        <button role="tab" aria-selected={tab === 'simulator'} onClick={() => setTab('simulator')}><Smartphone size={16} />Simulador móvil</button>
        <button role="tab" aria-selected={tab === 'qr'} onClick={() => setTab('qr')}><QrCode size={16} />Código QR</button>
        <button role="tab" aria-selected={tab === 'code'} onClick={() => setTab('code')}><Code2 size={16} />Código fuente</button>
      </div>
      {error ? <div className="mobile-modal-error" role="alert">{error}</div> : null}
      {loading ? <div className="mobile-modal-loading" role="status">Generando vistas, asistente local y paquete PWA…</div> : null}
      {!loading && project && tab === 'simulator' ? <div className="mobile-modal-simulator" role="tabpanel">
        <div className="mobile-phone-caption"><strong>Vista interactiva</strong><p>Los cambios del simulador permanecen en el almacenamiento local de este navegador.</p></div>
        <div className="mobile-phone" aria-label="Simulador móvil"><div className="mobile-phone-status"><span>9:41</span><i aria-hidden="true" /><span>●●● ▰</span></div><MobileSimulator project={project} /></div>
      </div> : null}
      {!loading && project && tab === 'qr' ? <div className="mobile-modal-qr" role="tabpanel">
        <div className="mobile-modal-qr-main"><div className="mobile-modal-qr-frame">{qrDataUrl ? <img src={qrDataUrl} alt="Código QR para abrir la app móvil" /> : <span>Preparando código QR…</span>}</div><div><h3>Abre la app en tu teléfono</h3><p>Conecta el teléfono y esta computadora a la misma red. El enlace apunta a la IP local del servidor CASE.</p><div className="mobile-modal-url"><code>{access?.url}</code><button onClick={() => access && void copy(access.url)} aria-label="Copiar URL móvil">{copied ? <Check size={17} /> : <Clipboard size={17} />}</button></div><a href={access?.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Abrir enlace</a></div></div>
        <ol><li>Escanea el QR y abre la app.</li><li>{access?.secureContext ? 'Agrégala a la pantalla de inicio.' : 'Para instalarla y guardarla offline, habilita HTTPS confiable en el servidor.'}</li><li>Después de cargarla e instalar el paquete de voz local compatible, activa Modo Avión y prueba texto o voz local.</li></ol>
        {!access?.secureContext ? <p className="mobile-modal-secure-note" role="note">{access?.note}</p> : null}
      </div> : null}
      {!loading && project && tab === 'code' ? <div className="mobile-modal-code" role="tabpanel"><aside aria-label="Archivos de la app móvil"><p><strong>{project.summary.filesCount}</strong> archivos generados</p>{project.files.map((item) => <button key={item.path} className={selectedFile?.path === item.path ? 'is-active' : ''} onClick={() => setSelectedFile(item)}>{item.path}</button>)}</aside><section aria-label="Visor de código móvil"><div><code>{selectedFile?.path}</code><button onClick={() => selectedFile && void copy(selectedFile.content)} disabled={!selectedFile || selectedFile.encoding === 'base64'}><Clipboard size={15} />Copiar archivo</button></div><pre><code>{selectedFile?.encoding === 'base64' ? 'Archivo PNG binario. Disponible en la descarga ZIP.' : selectedFile?.content}</code></pre></section></div> : null}
    </section>
  </div>, document.body);
}
