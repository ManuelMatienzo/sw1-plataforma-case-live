import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getApiErrorMessage } from '../../services/api';
import { CreateUserInput, UserRole } from '../../types/admin';

interface CreateUserModalProps {
  onClose: () => void;
  onCreate: (input: CreateUserInput) => Promise<void>;
}

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';

const CreateUserModal = ({ onClose, onCreate }: CreateUserModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState<UserRole>('COLABORADOR');

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActiveElement instanceof HTMLElement && previousActiveElement.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !saving) onClose();
    if (event.key !== 'Tab') return;
    const elements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await onCreate({
        nombre: String(form.get('nombre') ?? ''),
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rol: role,
      });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'No se pudo crear el usuario. Inténtalo otra vez.'));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <div
        className="user-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog-header">
          <div>
            <h2 id="create-user-title">Crear usuario</h2>
            <p>La cuenta quedará activa inmediatamente.</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar formulario"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          {error ? <div className="form-alert" role="alert">{error}</div> : null}
          <label className="field-label">
            Nombre completo
            <input ref={nameRef} name="nombre" autoComplete="name" minLength={2} maxLength={100} required />
          </label>
          <label className="field-label">
            Correo electrónico
            <input name="email" type="email" autoComplete="email" maxLength={150} required />
          </label>
          <label className="field-label">
            Contraseña temporal
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
            <span className="field-hint">Mínimo 8 caracteres.</span>
          </label>
          <label className="field-label">
            Rol
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="COLABORADOR">Colaborador</option>
              <option value="ANFITRION">Anfitrión</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </label>

          <div className="dialog-actions">
            <button className="ui-button ui-button--secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="ui-button" type="submit" disabled={saving}>
              {saving ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default CreateUserModal;
