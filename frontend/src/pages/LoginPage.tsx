import { FormEvent, useState } from 'react';
import { Eye, EyeOff, LogIn, Network, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi, getApiErrorMessage } from '../services/api';
import { getStoredSession, saveSession } from '../services/authStorage';
import './AuthAdmin.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const existingSession = getStoredSession();

  if (existingSession) {
    return <Navigate to={existingSession.user.rol === 'ADMINISTRADOR' ? '/admin' : '/dashboard'} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      const result = await authApi.login({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      saveSession(result.token, result.user);
      navigate(result.user.rol === 'ADMINISTRADOR' ? '/admin' : '/dashboard', { replace: true });
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, 'No se pudo iniciar sesión. Verifica tus datos.'));
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-context" aria-labelledby="auth-context-title">
        <Link className="auth-brand" to="/" aria-label="CASE IA, volver a la landing">
          <span className="auth-brand__mark" aria-hidden="true"><Network size={20} /></span>
          CASE IA
        </Link>
        <div className="auth-context__body">
          <h2 id="auth-context-title">Tu espacio de ingeniería, con acceso controlado.</h2>
          <p>
            Continúa al entorno de modelado o administra las cuentas y proyectos de la plataforma.
          </p>
          <div className="auth-trust-line">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Sesión protegida mediante JWT y control de rol.</span>
          </div>
        </div>
        <p className="auth-context__note">Proyecto académico · Software 1</p>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-heading">
            <h1 id="login-title">Accede a CASE IA</h1>
            <p>Ingresa tus credenciales para continuar.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error ? <div className="form-alert" role="alert">{error}</div> : null}
            <label className="field-label">
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nombre@equipo.com"
                required
                autoFocus
              />
            </label>
            <label className="field-label">
              Contraseña
              <span className="password-field">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <button className="ui-button login-submit" type="submit" disabled={submitting}>
              {submitting ? 'Verificando…' : 'Ingresar'}
              {submitting ? null : <LogIn size={18} aria-hidden="true" />}
            </button>
          </form>

          <p className="login-support">Si no tienes acceso, solicita una cuenta al administrador del sistema.</p>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;

