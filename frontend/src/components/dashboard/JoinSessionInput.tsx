import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { sesionesApi, getApiErrorMessage } from '../../services/api';

const JoinSessionInput = () => {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = codigo.trim();
    if (!trimmed || trimmed.length !== 6) {
      setError('El código debe tener exactamente 6 caracteres.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await sesionesApi.unirse(trimmed);
      navigate(`/sesion/${result.sesionId}`);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No se pudo unir a la sesión.');
      // Map 404 to friendly message
      setError(
        msg.toLowerCase().includes('no encontrado') || msg.toLowerCase().includes('not found')
          ? 'Código no encontrado. Verifica que sea correcto.'
          : msg,
      );
      setLoading(false);
    }
  };

  return (
    <form className="join-session-form" onSubmit={handleSubmit} aria-label="Unirse a sesión por código">
      <label className="join-session__label" htmlFor="join-codigo">
        ¿Tienes un código de sesión?
      </label>

      {error ? (
        <div className="form-alert join-session__error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="join-session__row">
        <input
          id="join-codigo"
          type="text"
          className="join-session__input"
          placeholder="ABC123"
          value={codigo}
          onChange={(e) => {
            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length <= 6) {
              setCodigo(val);
              if (error) setError('');
            }
          }}
          maxLength={6}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={error ? 'join-error' : undefined}
        />
        <button
          type="submit"
          className="ui-button"
          disabled={loading || codigo.length !== 6}
          aria-label="Unirse a la sesión"
        >
          {loading ? 'Uniéndose…' : (
            <>
              Unirse
              <LogIn size={16} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default JoinSessionInput;
