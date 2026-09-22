import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Sparkles,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Cpu,
  PlusCircle,
  HelpCircle,
  Layers,
  ArrowRight,
  Boxes,
  Tag,
  Link2,
} from 'lucide-react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { aiApi } from '../../services/aiApi';
import { parseVoiceCommandLocal } from '../../services/voiceCommandParser';
import { VoiceCommandAction, InterpretCommandResult } from '../../types/ai';
import './VoiceCommandWidget.css';

export interface VoiceCommandWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteAction: (action: VoiceCommandAction) => { success: boolean; message?: string };
  existingClasses: string[];
  canEdit: boolean;
}

type ExampleCategory = 'CLASES' | 'MIEMBROS' | 'RELACIONES';

interface CategorizedExamples {
  id: ExampleCategory;
  label: string;
  icon: React.ReactNode;
  examples: string[];
}

const CATEGORIZED_EXAMPLES: CategorizedExamples[] = [
  {
    id: 'CLASES',
    label: 'Clases',
    icon: <Boxes size={14} />,
    examples: [
      'Crear clase Paciente con atributos nombre texto, edad entero',
      'Crear interfaz Repositorio',
      'Crear clase abstracta Persona',
    ],
  },
  {
    id: 'MIEMBROS',
    label: 'Atributos y Métodos',
    icon: <Tag size={14} />,
    examples: [
      'Agregar atributo telefono tipo String a Paciente',
      'Agregar metodo calcularTotal a Factura',
      'En Paciente agregar campo email tipo String',
    ],
  },
  {
    id: 'RELACIONES',
    label: 'Relaciones',
    icon: <Link2 size={14} />,
    examples: [
      'Conectar Paciente con Medico como asociacion',
      'Medico hereda de Persona',
      'Conectar Factura con DetalleFactura como composicion',
    ],
  },
];

export const VoiceCommandWidget: React.FC<VoiceCommandWidgetProps> = ({
  isOpen,
  onClose,
  onExecuteAction,
  existingClasses,
  canEdit,
}) => {
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<InterpretCommandResult | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const [continuousMode, setContinuousMode] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ExampleCategory>('CLASES');

  const textInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const handleToggleRecordRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const {
    isRecording,
    duration,
    frequencyBars,
    error: recorderError,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: clearRecorderError,
  } = useAudioRecorder({
    autoStopSilenceMs: 1400, // Detecta silencio de 1.4s y procesa automáticamente
    onSilenceDetected: () => {
      handleToggleRecordRef.current();
    },
  });

  // Limpiar estado al abrir/cerrar
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setActionFeedback(null);
      setErrorMessage(null);
      clearRecorderError();
      setTimeout(() => textInputRef.current?.focus(), 150);
    } else {
      if (isRecording) {
        cancelRecording();
      }
    }
  }, [isOpen, cancelRecording, clearRecorderError, isRecording]);

  // Manejar tecla Escape para cerrar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Formatear segundos en mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Procesar una acción interpretada
  const applyAction = useCallback(
    (actionToApply: VoiceCommandAction) => {
      if (!canEdit) {
        setActionFeedback({
          success: false,
          message: 'Modo solo lectura: no tienes permisos para modificar el diagrama.',
        });
        return;
      }

      if (actionToApply.type === 'UNKNOWN') {
        setActionFeedback({
          success: false,
          message: actionToApply.reason || 'Comando no reconocido. Prueba una de las frases de ejemplo.',
        });
        return;
      }

      const outcome = onExecuteAction(actionToApply);
      if (outcome.success) {
        setActionFeedback({
          success: true,
          message: outcome.message || 'Elemento aplicado al modelo con éxito.',
        });

        if (continuousMode) {
          // En modo continuo: dejamos listo para la siguiente orden sin cerrar la ventana
          setTimeout(() => {
            setResult(null);
            setActionFeedback(null);
            textInputRef.current?.focus();
          }, 1400);
        } else {
          // En modo normal: cerramos con suavidad tras 850ms
          setTimeout(() => {
            onClose();
          }, 850);
        }
      } else {
        setActionFeedback({
          success: false,
          message: outcome.message || 'No se pudo aplicar la acción.',
        });
      }
    },
    [canEdit, onExecuteAction, onClose, continuousMode],
  );

  // Iniciar / detener grabación
  const handleToggleRecord = async () => {
    setErrorMessage(null);
    setActionFeedback(null);
    setResult(null);

    if (isRecording) {
      setIsProcessing(true);
      try {
        const audioBlob = await stopRecording();
        if (!audioBlob || audioBlob.size === 0) {
          setIsProcessing(false);
          setErrorMessage('No se capturó ningún audio válido.');
          return;
        }

        const res = await aiApi.interpretarAudio(audioBlob, existingClasses);
        setResult(res);
        if (autoApply && res.action.type !== 'UNKNOWN') {
          applyAction(res.action);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al procesar la grabación de voz.';
        setErrorMessage(msg);
      } finally {
        setIsProcessing(false);
      }
    } else {
      try {
        await startRecording();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'No se pudo iniciar la grabación.');
      }
    }
  };

  handleToggleRecordRef.current = handleToggleRecord;

  // Enviar texto escrito manualmente
  const handleSubmitText = async (textToSubmit?: string) => {
    const query = (textToSubmit !== undefined ? textToSubmit : textInput).trim();
    if (!query) return;

    setErrorMessage(null);
    setActionFeedback(null);
    setResult(null);
    setIsProcessing(true);

    try {
      let res: InterpretCommandResult;
      try {
        // Fast track en frontend para comandos estándar inmediatos
        const localAction = parseVoiceCommandLocal(query, existingClasses);
        if (localAction.type !== 'UNKNOWN') {
          res = {
            action: localAction,
            transcript: query,
            source: 'gemini',
          };
        } else {
          res = await aiApi.interpretarTexto(query, existingClasses);
        }
      } catch {
        const fallbackAction = parseVoiceCommandLocal(query, existingClasses);
        res = {
          action: fallbackAction,
          transcript: query,
          source: 'local_fallback',
        };
      }

      setResult(res);
      setTextInput('');
      textInputRef.current?.focus();

      if (autoApply && res.action.type !== 'UNKNOWN') {
        applyAction(res.action);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al procesar la instrucción.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const currentCategoryObj = CATEGORIZED_EXAMPLES.find((c) => c.id === activeCategory) || CATEGORIZED_EXAMPLES[0];

  return (
    <div className="voice-widget-backdrop" onClick={onClose} role="presentation">
      <div
        className="voice-widget-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-widget-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con alineación centrada estricta */}
        <header className="voice-widget-header">
          <div className="voice-widget-title-group">
            <div className="voice-widget-icon-wrap" aria-hidden="true">
              <Sparkles size={20} className="voice-sparkle-icon" />
            </div>
            <div className="voice-widget-titles">
              <h2 id="voice-widget-title">Modelado Asistido por Voz</h2>
              <p className="voice-widget-subtitle">
                Dicta o escribe en lenguaje natural. Potenciado por Google Gemini & Motor Determinista.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="voice-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal de comandos por voz (Esc)"
            title="Cerrar (Esc)"
          >
            <X size={22} strokeWidth={2.2} />
          </button>
        </header>

        {/* Notificaciones y avisos de error */}
        {(errorMessage || recorderError) && (
          <div className="voice-alert voice-alert-error" role="alert">
            <AlertCircle size={18} className="voice-alert-icon" />
            <span>{errorMessage || recorderError}</span>
          </div>
        )}

        {actionFeedback && (
          <div
            className={`voice-alert ${actionFeedback.success ? 'voice-alert-success' : 'voice-alert-error'}`}
            role="status"
          >
            {actionFeedback.success ? (
              <CheckCircle2 size={18} className="voice-alert-icon" />
            ) : (
              <AlertCircle size={18} className="voice-alert-icon" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}

        {/* Zona central: Grabación de voz & Ecualizador Dinámico */}
        <div className="voice-record-section">
          {!isSupported ? (
            <div className="voice-unsupported-note">
              <MicOff size={24} />
              <p>Tu navegador no permite captura directa de micrófono. Puedes usar el campo de texto inferior.</p>
            </div>
          ) : (
            <div className="voice-mic-container">
              {/* Ecualizador orgánico de 7 barras */}
              <div className={`voice-eq-bars ${isRecording ? 'is-recording' : ''}`} aria-hidden="true">
                {frequencyBars.map((barVal, idx) => (
                  <span
                    key={idx}
                    className="voice-eq-bar"
                    style={{
                      transform: isRecording ? `scaleY(${Math.max(0.18, barVal * 1.5)})` : 'scaleY(0.2)',
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                className={`voice-mic-button ${isRecording ? 'is-recording' : ''}`}
                onClick={handleToggleRecord}
                disabled={isProcessing || !canEdit}
                aria-label={isRecording ? 'Detener grabación y procesar' : 'Iniciar grabación de voz'}
                title={isRecording ? 'Detener y procesar audio (o haz silencio)' : 'Presiona para hablar'}
              >
                {isRecording ? <Square size={26} /> : <Mic size={26} />}
              </button>
            </div>
          )}

          <div className="voice-record-status">
            {isRecording ? (
              <div className="voice-recording-info">
                <div className="voice-rec-header">
                  <span className="voice-rec-dot" />
                  <span className="voice-recording-text">Escuchando... {formatDuration(duration)}</span>
                </div>
                <p className="voice-recording-tip">
                  Habla claro. El audio se detiene automáticamente al terminar o al presionar el botón rojo.
                </p>
              </div>
            ) : isProcessing ? (
              <div className="voice-processing-info">
                <div className="voice-spinner" aria-hidden="true" />
                <span>Interpretando orden con Inteligencia Artificial...</span>
              </div>
            ) : (
              <div className="voice-idle-info">
                <span className="voice-idle-title">Presiona el micrófono y habla</span>
                <span className="voice-idle-shortcut">Atajo global: Tecla [V] en el lienzo</span>
              </div>
            )}
          </div>
        </div>

        {/* Entrada manual integrada estilo pill */}
        <div className="voice-text-fallback">
          <div className="voice-input-pill">
            <input
              id="voice-text-input"
              ref={textInputRef}
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitText();
                }
              }}
              placeholder="¿Prefieres escribir? ej: Crear clase Factura con id entero, total double"
              disabled={isProcessing || isRecording || !canEdit}
              className="voice-text-input-pill"
            />
            <button
              type="button"
              className="voice-send-btn-pill"
              onClick={() => handleSubmitText()}
              disabled={!textInput.trim() || isProcessing || isRecording || !canEdit}
              aria-label="Enviar instrucción en texto"
              title="Interpretar orden"
            >
              <Send size={15} />
              <span>Enviar</span>
            </button>
          </div>
        </div>

        {/* Vista previa de la acción detectada si no se auto-aplicó */}
        {result && (
          <div className="voice-result-card">
            <div className="voice-result-header">
              <span className="voice-result-badge-source">
                {result.source === 'gemini' ? (
                  <>
                    <Sparkles size={13} className="voice-gemini-icon" /> Google Gemini AI
                  </>
                ) : (
                  <>
                    <Cpu size={13} /> Motor Local
                  </>
                )}
              </span>
              <span className="voice-result-transcript">"{result.transcript}"</span>
            </div>

            <div className="voice-action-summary">
              {result.action.type === 'CREATE_CLASS' && (
                <div className="voice-action-detail">
                  <div className="voice-action-kind">
                    <Layers size={16} />
                    <span>
                      Crear{' '}
                      {result.action.isInterface
                        ? 'Interfaz'
                        : result.action.isAbstract
                        ? 'Clase Abstracta'
                        : 'Clase'}
                      :{' '}
                      <strong className="voice-entity-name">{result.action.name}</strong>
                    </span>
                  </div>
                  {result.action.attributes && result.action.attributes.length > 0 && (
                    <div className="voice-subitems">
                      <span className="voice-subitems-label">Atributos detectados:</span>
                      <ul className="voice-subitems-list">
                        {result.action.attributes.map((att, i) => (
                          <li key={i}>
                            <code>+{att.name}: {att.type}</code>
                            {att.isPrimaryKey && <span className="voice-pk-badge">PK</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {result.action.type === 'ADD_ATTRIBUTE' && (
                <div className="voice-action-detail">
                  <span>
                    Agregar atributo a <strong className="voice-entity-name">{result.action.className}</strong>:
                  </span>
                  <div className="voice-subitems-list">
                    <code>
                      +{result.action.attribute.name}: {result.action.attribute.type}
                    </code>
                  </div>
                </div>
              )}

              {result.action.type === 'ADD_METHOD' && (
                <div className="voice-action-detail">
                  <span>
                    Agregar método a <strong className="voice-entity-name">{result.action.className}</strong>:
                  </span>
                  <div className="voice-subitems-list">
                    <code>
                      +{result.action.method.name}(): {result.action.method.returnType}
                    </code>
                  </div>
                </div>
              )}

              {result.action.type === 'CREATE_RELATION' && (
                <div className="voice-action-detail">
                  <span>Crear relación:</span>
                  <div className="voice-relation-preview">
                    <strong>{result.action.sourceName}</strong>
                    <ArrowRight size={14} />
                    <span className="voice-relation-badge">{result.action.relationshipType}</span>
                    <ArrowRight size={14} />
                    <strong>{result.action.targetName}</strong>
                  </div>
                </div>
              )}

              {result.action.type === 'DELETE_CLASS' && (
                <div className="voice-action-detail voice-action-danger">
                  <span>
                    Eliminar clase: <strong className="voice-entity-name">{result.action.className}</strong>
                  </span>
                </div>
              )}

              {result.action.type === 'UNKNOWN' && (
                <div className="voice-action-unknown">
                  <HelpCircle size={16} />
                  <span>{result.action.reason || 'No se reconoció una instrucción válida.'}</span>
                </div>
              )}
            </div>

            {result.action.type !== 'UNKNOWN' && !actionFeedback?.success && (
              <div className="voice-result-actions">
                <button
                  type="button"
                  className="voice-apply-btn"
                  onClick={() => applyAction(result.action)}
                  disabled={!canEdit}
                >
                  <PlusCircle size={16} />
                  <span>Aplicar al diagrama</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Ejemplos Categorizados con Tabs */}
        <div className="voice-examples-section">
          <div className="voice-examples-toolbar">
            <div className="voice-category-tabs" role="tablist">
              {CATEGORIZED_EXAMPLES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === cat.id}
                  className={`voice-tab-btn ${activeCategory === cat.id ? 'is-active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            <div className="voice-toggles-group">
              <label className="voice-toggle-label" title="Aplica el cambio automáticamente tras procesar">
                <input
                  type="checkbox"
                  checked={autoApply}
                  onChange={(e) => setAutoApply(e.target.checked)}
                />
                <span>Auto-aplicar</span>
              </label>

              <label className="voice-toggle-label" title="Mantiene el modal abierto para continuar dictando sin interrupciones">
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                />
                <span>Modo continuo</span>
              </label>
            </div>
          </div>

          <div className="voice-example-chips" role="tabpanel">
            {currentCategoryObj.examples.map((cmd, idx) => (
              <button
                key={idx}
                type="button"
                className="voice-chip-btn"
                onClick={() => handleSubmitText(cmd)}
                disabled={isProcessing || isRecording || !canEdit}
                title={`Ejecutar: "${cmd}"`}
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceCommandWidget;
