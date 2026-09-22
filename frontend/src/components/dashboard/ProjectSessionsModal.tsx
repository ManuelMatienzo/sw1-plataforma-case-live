import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Copy, Plus, Users, X, Clock, Trash2, Lock } from 'lucide-react';
import { proyectosApi, sesionesApi, SesionResumen, getApiErrorMessage } from '../../services/api';

interface ProjectSessionsModalProps {
  proyectoId: string;
  proyectoNombre: string;
  onClose: () => void;
  onNuevaSesion: () => void;
}

const ProjectSessionsModal = ({
  proyectoId,
  proyectoNombre,
  onClose,
  onNuevaSesion,
}: ProjectSessionsModalProps) => {
  const navigate = useNavigate();
  const [sesiones, setSesiones] = useState<SesionResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    proyectosApi
      .obtener(proyectoId)
      .then((detalle) => {
        if (!cancelled) {
          setSesiones(detalle.sesiones || []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'No se pudieron cargar las sesiones.'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [proyectoId]);

  const handleCopy = async (sesion: SesionResumen) => {
    try {
      await navigator.clipboard.writeText(sesion.codigoAcceso);
      setCopiedId(sesion.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(sesion.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleEnterCanvas = (sesionId: string) => {
    onClose();
    navigate(`/sesion/${sesionId}`);
  };

  const handleCerrarSesion = async (sesionId: string) => {
    try {
      const updated = await sesionesApi.cerrar(sesionId);
      setSesiones((prev) => prev.map((s) => (s.id === sesionId ? { ...s, ...updated } : s)));
    } catch (err) {
      alert(getApiErrorMessage(err, 'No se pudo cerrar la sesión.'));
    }
  };

  const handleEliminarSesion = async (sesionId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta sesión?')) return;
    try {
      await sesionesApi.eliminar(sesionId);
      setSesiones((prev) => prev.filter((s) => s.id !== sesionId));
    } catch (err) {
      alert(getApiErrorMessage(err, 'No se pudo eliminar la sesión.'));
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-sessions-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="user-dialog project-sessions-dialog">
        <div className="dialog-header">
          <div>
            <h2 id="project-sessions-title">Sesiones del proyecto</h2>
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
        ) : loading ? (
          <div className="sessions-list-loading" aria-live="polite">
            <div className="session-item-skeleton" />
            <div className="session-item-skeleton" />
          </div>
        ) : sesiones.length === 0 ? (
          <div className="sessions-list-empty">
            <p className="sessions-empty-text">
              Este proyecto todavía no tiene ninguna sesión colaborativa creada.
            </p>
            <button
              type="button"
              className="ui-button"
              onClick={() => {
                onClose();
                onNuevaSesion();
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Crear primera sesión
            </button>
          </div>
        ) : (
          <div className="project-sessions-content">
            <div className="project-sessions-list">
              {sesiones.map((s) => (
                <div key={s.id} className="session-row-card">
                  <div className="session-row-info">
                    <div className="session-row-header">
                      <strong className="session-row-name">{s.nombre}</strong>
                      <span
                        className={`status-badge ${
                          s.estado === 'ABIERTA'
                            ? 'status-badge--active'
                            : 'status-badge--archived'
                        }`}
                      >
                        {s.estado}
                      </span>
                    </div>

                    <div className="session-row-meta">
                      <span className="session-row-date">
                        <Clock size={12} aria-hidden="true" />
                        {formatDate(s.fechaInicio)}
                      </span>
                      <span className="session-row-participants">
                        <Users size={12} aria-hidden="true" />
                        {s._count?.participantes ?? 1} participante(s)
                      </span>
                    </div>

                    <div className="session-row-code-box">
                      <span className="session-code-tag">Código:</span>
                      <code className="session-code-text">{s.codigoAcceso}</code>
                      <button
                        type="button"
                        className="session-code-copy-btn"
                        onClick={() => handleCopy(s)}
                        title="Copiar código de acceso"
                        aria-label="Copiar código de acceso"
                      >
                        {copiedId === s.id ? (
                          <>
                            <Check size={13} aria-hidden="true" />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} aria-hidden="true" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="session-row-actions" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="ui-button ui-button--small session-enter-btn"
                      onClick={() => handleEnterCanvas(s.id)}
                    >
                      Entrar
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                    {s.estado === 'ABIERTA' && (
                      <button
                        type="button"
                        className="ui-button ui-button--small ui-button--secondary"
                        onClick={() => handleCerrarSesion(s.id)}
                        title="Cerrar sesión"
                      >
                        <Lock size={14} aria-hidden="true" />
                        Cerrar
                      </button>
                    )}
                    <button
                      type="button"
                      className="ui-button ui-button--small ui-button--danger"
                      style={{ background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', boxShadow: 'none' }}
                      onClick={() => handleEliminarSesion(s.id)}
                      title="Eliminar sesión"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="dialog-actions" style={{ marginTop: 'var(--space-6)' }}>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => {
                  onClose();
                  onNuevaSesion();
                }}
              >
                <Plus size={15} aria-hidden="true" />
                Nueva sesión
              </button>
              <button type="button" className="ui-button" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSessionsModal;
