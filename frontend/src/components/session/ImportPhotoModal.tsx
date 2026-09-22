import React, { DragEvent, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanLine,
} from 'lucide-react';
import { aiApi } from '../../services/aiApi';
import { PhotoImportResult } from '../../types/ai';
import './ImportPhotoModal.css';

export interface ImportPhotoModalProps {
  hasExistingDiagram: boolean;
  onImported(result: PhotoImportResult, strategy: 'replace' | 'merge'): void;
  onClose(): void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ImportPhotoModal: React.FC<ImportPhotoModalProps> = ({
  hasExistingDiagram,
  onImported,
  onClose,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [digitizing, setDigitizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState<PhotoImportResult | null>(null);
  const [strategy, setStrategy] = useState<'replace' | 'merge'>(hasExistingDiagram ? 'merge' : 'replace');
  const [error, setError] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Selector y validación de archivo
  const selectFile = useCallback((selectedFile: File) => {
    setError('');
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(selectedFile.type.toLowerCase())) {
      setError('Formato no soportado. Por favor selecciona una imagen JPG, PNG o WebP.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('La imagen no puede exceder 10 MB.');
      return;
    }

    setFile(selectedFile);
    setResult(null);

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });
  }, []);

  // Limpieza de ObjectURL al desmontar
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Manejo de pegado desde el portapapeles (Ctrl+V)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || digitizing) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const pastedFile = items[i].getAsFile();
        if (pastedFile) {
          selectFile(pastedFile);
          break;
        }
      }
    }
  }, [digitizing, selectFile]);

  // Manejo de teclado (Escape y foco)
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !digitizing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [digitizing, onClose, handlePaste]);

  // Drag & drop
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!digitizing) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (digitizing) return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      selectFile(droppedFile);
    }
  };

  // Proceso de Digitalización con IA
  const handleScan = async () => {
    if (!file || digitizing) return;
    setDigitizing(true);
    setError('');
    setStatusMessage('Enviando imagen al motor de visión por computadora...');

    const stepTimers: NodeJS.Timeout[] = [];
    stepTimers.push(setTimeout(() => setStatusMessage('Detectando clases, estereotipos y límites rectangulares...'), 1200));
    stepTimers.push(setTimeout(() => setStatusMessage('Extrayendo atributos, métodos y visibilidad UML...'), 2400));
    stepTimers.push(setTimeout(() => setStatusMessage('Reconociendo conectores de relación y multiplicidades...'), 3600));
    stepTimers.push(setTimeout(() => setStatusMessage('Calculando distribución espacial y validando sintaxis OMG...'), 4800));

    try {
      const scanResult = await aiApi.importarDiagramaFoto(file);
      setResult(scanResult);
    } catch (err: any) {
      setError(err?.message || 'Error al digitalizar el diagrama. Intenta nuevamente.');
    } finally {
      stepTimers.forEach(clearTimeout);
      setDigitizing(false);
      setStatusMessage('');
    }
  };

  // Confirmación final
  const handleConfirmImport = () => {
    if (!result) return;
    onImported(result, strategy);
  };

  return createPortal(
    <div className="photo-backdrop" role="presentation">
      <div
        className="photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-modal-title"
        ref={dialogRef}
      >
        {/* Header */}
        <div className="photo-header">
          <div className="photo-title-mark" aria-hidden="true">
            <Camera size={22} />
          </div>
          <div>
            <h2 id="photo-modal-title">Importar Diagrama Desde Foto (IA)</h2>
            <p>Digitaliza pizarras, bocetos a lápiz o diagramas en papel usando visión por computadora</p>
          </div>
          <button
            type="button"
            className="photo-close"
            onClick={onClose}
            disabled={digitizing}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Zona de Selección o Vista Previa */}
        {!previewUrl ? (
          <div
            className={`photo-dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                if (e.target.files?.[0]) selectFile(e.target.files[0]);
              }}
            />
            <div className="photo-dropzone-icon">
              <Upload size={24} />
            </div>
            <div className="photo-dropzone-text">
              <strong>Haz clic o arrastra tu fotografía aquí</strong>
              <span>Formatos soportados: JPG, PNG, WebP (Máx. 10 MB)</span>
            </div>
            <div className="photo-dropzone-hint">
              <span>Sugerencia: Puedes pegar directamente capturas con <strong>Ctrl+V</strong></span>
            </div>
          </div>
        ) : (
          <div className="photo-preview-box">
            <div className="photo-preview-img-container">
              <img src={previewUrl} alt="Vista previa del diagrama" className="photo-preview-img" />
              {digitizing && <div className="photo-scan-bar" />}
            </div>

            <div className="photo-preview-info">
              <div className="photo-preview-meta">
                <strong>{file?.name}</strong>
                <span>{file ? formatBytes(file.size) : ''}</span>
              </div>

              <div className="photo-preview-actions">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={digitizing}
                >
                  Cambiar foto
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) selectFile(e.target.files[0]);
                  }}
                />

                {!result && (
                  <button
                    type="button"
                    className="photo-btn-scan"
                    onClick={handleScan}
                    disabled={digitizing}
                  >
                    {digitizing ? (
                      <>
                        <Loader2 size={16} className="photo-spinner" />
                        Analizando…
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Digitalizar con IA
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Estado animado durante el análisis */}
        {digitizing && (
          <div className="photo-scanning-status" role="status">
            <ScanLine size={18} className="photo-spinner" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Mensaje de error si falla */}
        {error && (
          <div className="photo-error-alert" role="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Resultados del Modelo Detectado */}
        {result && (
          <div className="photo-results-panel">
            <h3 className="photo-summary-title">Estructura UML Reconocida</h3>

            <div className="photo-badge-grid">
              <div className="photo-badge">
                <span>Clases:</span>
                <span className="photo-badge-val">{result.summary.classes}</span>
              </div>
              {result.summary.interfaces > 0 && (
                <div className="photo-badge">
                  <span>Interfaces:</span>
                  <span className="photo-badge-val">{result.summary.interfaces}</span>
                </div>
              )}
              <div className="photo-badge">
                <span>Atributos:</span>
                <span className="photo-badge-val">{result.summary.attributes}</span>
              </div>
              <div className="photo-badge">
                <span>Métodos:</span>
                <span className="photo-badge-val">{result.summary.methods}</span>
              </div>
              <div className="photo-badge">
                <span>Relaciones:</span>
                <span className="photo-badge-val">{result.summary.relationships}</span>
              </div>
            </div>

            {/* Tarjeta de Validación Sintáctica */}
            <div
              className={`photo-validation-card ${
                result.validationReport.isValid ? 'is-valid' : 'has-warnings'
              }`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                {result.validationReport.isValid ? (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Modelo conforme con la especificación UML 2.5 OMG</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} />
                    <span>Se detectaron inconsistencias menores a revisar en el lienzo</span>
                  </>
                )}
              </div>

              {result.warnings && result.warnings.length > 0 && (
                <ul className="photo-warnings-list">
                  {result.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Estrategia de Importación (si ya hay clases en el lienzo) */}
            {hasExistingDiagram && (
              <div>
                <h3 className="photo-summary-title" style={{ marginTop: '0.5rem' }}>
                  Estrategia de Integración
                </h3>
                <div className="photo-strategy-group">
                  <label
                    className={`photo-strategy-card ${strategy === 'merge' ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="photo-strategy"
                      value="merge"
                      checked={strategy === 'merge'}
                      onChange={() => setStrategy('merge')}
                    />
                    <div className="photo-strategy-meta">
                      <strong>Fusionar con el diagrama actual</strong>
                      <span>Conserva tus clases existentes y agrega las nuevas reconocidas.</span>
                    </div>
                  </label>

                  <label
                    className={`photo-strategy-card ${strategy === 'replace' ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="photo-strategy"
                      value="replace"
                      checked={strategy === 'replace'}
                      onChange={() => setStrategy('replace')}
                    />
                    <div className="photo-strategy-meta">
                      <strong>Reemplazar diagrama actual</strong>
                      <span>Sustituye por completo el lienzo con el modelo de la foto.</span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Acciones Finales */}
        <div className="photo-actions">
          <button type="button" onClick={onClose} disabled={digitizing}>
            Cancelar
          </button>
          {result && (
            <button
              type="button"
              className="photo-primary-btn"
              onClick={handleConfirmImport}
              disabled={digitizing}
            >
              Aplicar al Lienzo
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImportPhotoModal;
