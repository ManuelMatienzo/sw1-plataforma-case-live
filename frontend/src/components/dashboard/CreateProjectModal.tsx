import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { proyectosApi, Proyecto, getApiErrorMessage } from '../../services/api';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: (proyecto: Proyecto) => void;
}

const CreateProjectModal = ({ onClose, onCreated }: CreateProjectModalProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nombre = String(form.get('nombre') ?? '').trim();
    const descripcion = String(form.get('descripcion') ?? '').trim() || undefined;

    if (!nombre) {
      setError('El nombre del proyecto es obligatorio.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const proyecto = await proyectosApi.crear({ nombre, descripcion });
      onCreated(proyecto);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo crear el proyecto. Inténtalo de nuevo.'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="user-dialog">
        <div className="dialog-header">
          <div>
            <h2 id="create-project-title">Nuevo proyecto</h2>
            <p>Crea un proyecto para organizar tus sesiones colaborativas.</p>
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

        <form className="dialog-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="form-alert" role="alert">
              {error}
            </div>
          ) : null}

          <label className="field-label">
            Nombre del proyecto
            <input
              name="nombre"
              type="text"
              placeholder="Ej: Sistema de Reservas UTEC"
              required
              autoFocus
              maxLength={200}
            />
          </label>

          <label className="field-label">
            Descripción
            <span className="field-hint"> (opcional)</span>
            <textarea
              name="descripcion"
              placeholder="Descripción breve del sistema o contexto del proyecto"
              rows={3}
              maxLength={1000}
              style={{
                width: '100%',
                padding: '0.75rem 0.9rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-primary)',
                font: 'inherit',
                fontSize: '0.94rem',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </label>

          <div className="dialog-actions">
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button type="submit" className="ui-button" disabled={submitting}>
              {submitting ? 'Creando…' : 'Crear proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;
