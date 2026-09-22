import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, ArrowRight, X } from 'lucide-react';
import { sesionesApi, SesionCreada, getApiErrorMessage } from '../../services/api';

interface CreateSessionModalProps {
  proyectoId: string;
  proyectoNombre: string;
  onClose: () => void;
}

const CreateSessionModal = ({ proyectoId, proyectoNombre, onClose }: CreateSessionModalProps) => {
  const navigate = useNavigate();
  const [sesion, setSesion] = useState<SesionCreada | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Create session immediately on mount
  useEffect(() => {
    let cancelled = false;

    sesionesApi
      .crear(proyectoId)
      .then((s) => {
        if (!cancelled) setSesion(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'No se pudo crear la sesión. Inténtalo de nuevo.'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [proyectoId]);

  const handleCopy = async () => {
    if (!sesion) return;
    try {
      await navigator.clipboard.writeText(sesion.codigoAcceso);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEnterCanvas = () => {
    if (!sesion) return;
    navigate(`/sesion/${sesion.id}`);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-session-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="user-dialog session-dialog">
        <div className="dialog-header">
          <div>
            <h2 id="create-session-title">Nueva sesión</h2>
            <p>{proyectoNombre}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div className="form-alert" role="alert" style={{ marginTop: 'var(--space-6)' }}>
            {error}
          </div>
        ) : sesion === null ? (
          <div className="session-code-loading" aria-live="polite">
            <p className="session-code-label">Generando código de acceso…</p>
            <div className="session-code-placeholder" aria-hidden="true" />
          </div>
        ) : (
          <div className="session-code-body">
            <p className="session-code-label">Comparte este código con tus colaboradores</p>

            <div className="session-code-display" aria-label={`Código de sesión: ${sesion.codigoAcceso}`}>
              {sesion.codigoAcceso}
            </div>

            <div className="dialog-actions" style={{ marginTop: 'var(--space-6)' }}>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={handleCopy}
                aria-live="polite"
              >
                {copied ? (
                  <>
                    <Check size={16} aria-hidden="true" />
                    ¡Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={16} aria-hidden="true" />
                    Copiar código
                  </>
                )}
              </button>

              <button type="button" className="ui-button" onClick={handleEnterCanvas}>
                Entrar al canvas
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateSessionModal;
