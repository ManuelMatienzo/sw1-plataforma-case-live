import { DragEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileCode2, GitMerge, RefreshCw, Upload, X } from 'lucide-react';
import { getApiErrorMessage } from '../../services/api';
import { inspectXmiFile, XmiImportResult, XmiImportStrategy, XmiPreview, xmiApi } from '../../services/xmiService';
import './ImportXmiModal.css';

interface Props {
  sessionId: string;
  expectedVersion: number;
  hasExistingDiagram: boolean;
  onImported(result: XmiImportResult): void;
  onClose(): void;
}

const focusableSelector = 'button:not([disabled]), input:not([disabled])';
const humanSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
const countLabel = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export default function ImportXmiModal({ sessionId, expectedVersion, hasExistingDiagram, onImported, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<XmiPreview | null>(null);
  const [strategy, setStrategy] = useState<XmiImportStrategy>(hasExistingDiagram ? 'merge' : 'replace');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousActive = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActive instanceof HTMLElement && previousActive.isConnected) previousActive.focus();
    };
  }, []);

  const readFile = async (file?: File) => {
    if (!file || busy) return;
    setError('');
    try { setPreview(await inspectXmiFile(file)); }
    catch (fileError) { setPreview(null); setError(fileError instanceof Error ? fileError.message : 'No se pudo leer el archivo XMI.'); }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) { onClose(); return; }
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!elements.length) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const importModel = async () => {
    if (!preview || busy) return;
    setBusy(true); setError('');
    try {
      const result = await xmiApi.importar(sessionId, { content: preview.content, strategy, expectedVersion });
      onImported(result);
    } catch (importError) {
      setError(getApiErrorMessage(importError, 'No se pudo importar el modelo. Comprueba el archivo y vuelve a intentarlo.'));
    } finally { setBusy(false); }
  };

  const counts = preview ? [
    countLabel(preview.summary.classes, 'clase', 'clases'), countLabel(preview.summary.interfaces, 'interfaz', 'interfaces'),
    countLabel(preview.summary.attributes, 'atributo', 'atributos'), countLabel(preview.summary.methods, 'método', 'métodos'),
    countLabel(preview.summary.relationships, 'relación', 'relaciones'),
  ] : [];

  return createPortal(
    <div className="xmi-backdrop" role="presentation">
      <div className="xmi-dialog" role="dialog" aria-modal="true" aria-labelledby="xmi-title" ref={dialogRef} onKeyDown={handleKeyDown}>
        <header className="xmi-header">
          <div className="xmi-title-mark" aria-hidden="true"><FileCode2 size={21} /></div>
          <div><h2 id="xmi-title">Importar modelo XMI</h2><p>Compatible con XMI 2.1 y 2.5.1.</p></div>
          <button ref={closeRef} type="button" className="xmi-close" aria-label="Cerrar importación XMI" onClick={onClose} disabled={busy}><X size={18} /></button>
        </header>

        <div
          className={`xmi-dropzone${dragging ? ' is-dragging' : ''}${preview ? ' has-file' : ''}`}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} id="xmi-file" type="file" accept=".xmi,.xml,application/xml,text/xml" aria-label="Seleccionar archivo XMI" onChange={event => void readFile(event.target.files?.[0])} disabled={busy} />
          {preview ? <>
            <FileCode2 size={24} aria-hidden="true" />
            <div className="xmi-file-meta"><strong>{preview.fileName}</strong><span>{humanSize(preview.size)} · XML leído correctamente</span></div>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>Cambiar</button>
          </> : <>
            <span className="xmi-upload-icon" aria-hidden="true"><Upload size={22} /></span>
            <div><strong>Arrastra tu archivo XMI aquí</strong><span>o selecciónalo desde tu equipo · máximo 5 MB</span></div>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>Elegir archivo</button>
          </>}
        </div>

        {error ? <div className="xmi-alert" role="alert"><AlertTriangle size={17} aria-hidden="true" /><span>{error}</span></div> : null}

        {preview ? <>
          <section className="xmi-preview" aria-labelledby="xmi-preview-title">
            <h3 id="xmi-preview-title">Vista previa</h3>
            <div className="xmi-counts">{counts.map(count => <span key={count}>{count}</span>)}</div>
          </section>
          {hasExistingDiagram ? <fieldset className="xmi-strategy">
            <legend>¿Cómo quieres incorporarlo?</legend>
            <label className={strategy === 'merge' ? 'is-selected' : ''}>
              <input type="radio" name="xmi-strategy" value="merge" checked={strategy === 'merge'} onChange={() => setStrategy('merge')} />
              <GitMerge size={18} aria-hidden="true" /><span><strong>Fusionar con el modelo actual</strong><small>Conserva las clases existentes y añade elementos que no estén duplicados.</small></span>
            </label>
            <label className={strategy === 'replace' ? 'is-selected is-destructive' : ''}>
              <input type="radio" name="xmi-strategy" value="replace" checked={strategy === 'replace'} onChange={() => setStrategy('replace')} />
              <RefreshCw size={18} aria-hidden="true" /><span><strong>Reemplazar el modelo actual</strong><small>Sustituirá las clases y relaciones actuales por el contenido del archivo.</small></span>
            </label>
          </fieldset> : null}
          {strategy === 'replace' && hasExistingDiagram ? <p className="xmi-replace-warning"><AlertTriangle size={16} aria-hidden="true" /> Esta acción sustituirá las clases y relaciones actuales de la sesión.</p> : null}
        </> : null}

        <footer className="xmi-actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="xmi-primary" onClick={() => void importModel()} disabled={!preview || busy}>{busy ? 'Importando…' : 'Importar modelo'}</button>
        </footer>
      </div>
    </div>, document.body,
  );
}
