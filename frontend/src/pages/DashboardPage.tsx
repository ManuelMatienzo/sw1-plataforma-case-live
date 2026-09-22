import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Network, LogOut, Plus, X } from 'lucide-react';
import { proyectosApi, Proyecto, getApiErrorMessage } from '../services/api';
import { getStoredSession, clearSession } from '../services/authStorage';
import ProjectCard from '../components/dashboard/ProjectCard';
import CreateProjectModal from '../components/dashboard/CreateProjectModal';
import CreateSessionModal from '../components/dashboard/CreateSessionModal';
import ProjectSessionsModal from '../components/dashboard/ProjectSessionsModal';
import JoinSessionInput from '../components/dashboard/JoinSessionInput';
import './DashboardPage.css';
import '../pages/AuthAdmin.css';

const DashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getStoredSession();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sessionNotice, setSessionNotice] = useState(() => {
    const state = location.state as { sessionNotice?: unknown } | null;
    return typeof state?.sessionNotice === 'string' ? state.sessionNotice : '';
  });

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [sessionModal, setSessionModal] = useState<{ proyectoId: string; nombre: string } | null>(
    null,
  );
  const [sessionsModal, setSessionsModal] = useState<{ proyectoId: string; nombre: string } | null>(
    null,
  );

  // Load projects on mount
  useEffect(() => {
    proyectosApi
      .listar()
      .then((data) => {
        setProyectos(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoadError(getApiErrorMessage(err, 'No se pudieron cargar los proyectos.'));
        setLoading(false);
      });
  }, []);

  const handleLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const handleProjectCreated = (proyecto: Proyecto) => {
    setProyectos((prev) => [proyecto, ...prev]);
  };


  const handleVerSesiones = (proyectoId: string) => {
    const proyecto = proyectos.find((p) => p.id === proyectoId);
    if (!proyecto) return;
    setSessionsModal({ proyectoId, nombre: proyecto.nombre });
  };

  const handleArchivar = async (proyectoId: string) => {
    try {
      const updated = await proyectosApi.archivar(proyectoId);
      setProyectos((prev) => prev.map((p) => (p.id === proyectoId ? { ...p, ...updated } : p)));
    } catch (err) {
      alert(getApiErrorMessage(err, 'No se pudo archivar el proyecto.'));
    }
  };

  return (
    <div className="dashboard-page">
      {/* ─── Topbar ─────────────────────────────────────────── */}
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" to="/" aria-label="CASE IA, volver a la landing">
          <span className="dashboard-brand__mark" aria-hidden="true">
            <Network size={18} />
          </span>
          CASE IA
        </Link>

        <div className="dashboard-account">
          <div className="dashboard-account__copy">
            <strong>{session?.user.nombre ?? 'Usuario'}</strong>
            <span>{session?.user.rol}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ─── Main ───────────────────────────────────────────── */}
      <main className="dashboard-main">
        {sessionNotice ? (
          <div className="dashboard-session-notice" role="status">
            <span>{sessionNotice}</span>
            <button
              type="button"
              className="dashboard-session-notice__close"
              aria-label="Cerrar aviso"
              onClick={() => setSessionNotice('')}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="dashboard-titlebar">
          <h1>Mis proyectos</h1>
          <button
            type="button"
            className="ui-button"
            onClick={() => setShowCreateProject(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Nuevo proyecto
          </button>
        </div>

        {/* ─── Error state ──────────────────────────────────── */}
        {loadError ? (
          <div className="form-alert" role="alert">
            {loadError}
          </div>
        ) : loading ? (
          /* ─── Skeleton ──────────────────────────────────── */
          <div className="projects-loading" aria-busy="true" aria-label="Cargando proyectos">
            {[0, 1, 2].map((i) => (
              <div key={i} className="project-card-skeleton" aria-hidden="true" />
            ))}
          </div>
        ) : (
          /* ─── Grid ──────────────────────────────────────── */
          <div className="projects-grid">
            {proyectos.length === 0 ? (
              <div className="projects-empty">
                <h3>Aún no tienes proyectos</h3>
                <p>Crea tu primer proyecto para empezar a colaborar.</p>
              </div>
            ) : (
              proyectos.map((p) => {
                const activeSessionId = p.sesiones && p.sesiones.length > 0 ? p.sesiones[0].id : undefined;
                return (
                  <ProjectCard
                    key={p.id}
                    id={p.id}
                    nombre={p.nombre}
                    descripcion={p.descripcion}
                    sesionesCount={p._count.sesiones}
                    estado={p.estado}
                    activeSessionId={activeSessionId}
                    onVerSesiones={handleVerSesiones}
                    onArchivar={handleArchivar}
                    onEntrarLienzo={(sid) => navigate(`/sesion/${sid}`)}
                  />
                );
              })
            )}
          </div>
        )}

        {/* ─── Join by code ────────────────────────────────── */}
        <section className="join-section" aria-labelledby="join-heading">
          <JoinSessionInput />
        </section>
      </main>

      {/* ─── Modals ─────────────────────────────────────────── */}
      {showCreateProject ? (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={handleProjectCreated}
        />
      ) : null}

      {sessionModal !== null ? (
        <CreateSessionModal
          proyectoId={sessionModal.proyectoId}
          proyectoNombre={sessionModal.nombre}
          onClose={() => setSessionModal(null)}
        />
      ) : null}

      {sessionsModal !== null ? (
        <ProjectSessionsModal
          proyectoId={sessionsModal.proyectoId}
          proyectoNombre={sessionsModal.nombre}
          onClose={() => setSessionsModal(null)}
          onNuevaSesion={() => {
            const pid = sessionsModal.proyectoId;
            const pnom = sessionsModal.nombre;
            setSessionsModal(null);
            setSessionModal({ proyectoId: pid, nombre: pnom });
          }}
        />
      ) : null}
    </div>
  );
};

export default DashboardPage;
