import { useEffect, useState } from 'react';
import { FolderKanban, LogOut, Network, Plus, RefreshCw, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CreateUserModal from '../components/admin/CreateUserModal';
import ProjectsTable from '../components/admin/ProjectsTable';
import UsersTable from '../components/admin/UsersTable';
import { adminApi, getApiErrorMessage } from '../services/api';
import { clearSession, getStoredSession } from '../services/authStorage';
import { AdminProject, AdminUser, CreateUserInput } from '../types/admin';
import './AuthAdmin.css';

type AdminSection = 'users' | 'projects';

const AdminPage = () => {
  const navigate = useNavigate();
  const session = getStoredSession();
  const [section, setSection] = useState<AdminSection>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersResponse, projectsResponse] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listProjects(),
      ]);
      setUsers(usersResponse.data);
      setProjects(projectsResponse);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'No se pudieron cargar los datos administrativos.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const handleCreateUser = async (input: CreateUserInput) => {
    const created = await adminApi.createUser(input);
    setUsers((current) => [created, ...current]);
    setShowCreateUser(false);
  };

  const handleUserStatus = async (user: AdminUser) => {
    setBusyId(user.id);
    setError('');
    try {
      const updated = await adminApi.setUserStatus(user.id, !user.activo);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (statusError) {
      setError(getApiErrorMessage(statusError, 'No se pudo cambiar el estado del usuario.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleProjectStatus = async (project: AdminProject) => {
    setBusyId(project.id);
    setError('');
    try {
      const updated = await adminApi.setProjectStatus(
        project.id,
        project.estado === 'ACTIVO' ? 'ARCHIVADO' : 'ACTIVO',
      );
      setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (statusError) {
      setError(getApiErrorMessage(statusError, 'No se pudo cambiar el estado del proyecto.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-brand">
          <span className="auth-brand__mark" aria-hidden="true"><Network size={19} /></span>
          <span>CASE IA</span>
        </div>
        <div className="admin-account">
          <span className="admin-account__copy">
            <strong>{session?.user.nombre}</strong>
            <span>Administrador</span>
          </span>
          <button className="icon-button" type="button" onClick={handleLogout} aria-label="Cerrar sesión">
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="Secciones de administración">
          <p className="admin-sidebar__label">Administración</p>
          <nav>
            <button
              type="button"
              aria-label="Usuarios"
              className={section === 'users' ? 'is-active' : ''}
              aria-current={section === 'users' ? 'page' : undefined}
              onClick={() => setSection('users')}
            >
              <Users size={18} aria-hidden="true" /> Usuarios
              <span aria-hidden="true">{users.length}</span>
            </button>
            <button
              type="button"
              aria-label="Proyectos"
              className={section === 'projects' ? 'is-active' : ''}
              aria-current={section === 'projects' ? 'page' : undefined}
              onClick={() => setSection('projects')}
            >
              <FolderKanban size={18} aria-hidden="true" /> Proyectos
              <span aria-hidden="true">{projects.length}</span>
            </button>
          </nav>
          <p className="admin-sidebar__scope">Auditoría activa en cada cambio administrativo.</p>
        </aside>

        <main className="admin-main" id="admin-content">
          <div className="admin-titlebar">
            <div>
              <h1>Administración del sistema</h1>
              <p>
                {section === 'users'
                  ? 'Gestiona quién puede acceder a la plataforma y con qué rol.'
                  : 'Consulta y archiva proyectos de todos los equipos.'}
              </p>
            </div>
            {section === 'users' ? (
              <button className="ui-button" type="button" onClick={() => setShowCreateUser(true)}>
                <Plus size={18} aria-hidden="true" /> Crear usuario
              </button>
            ) : null}
          </div>

          <div className="admin-section-header">
            <div>
              <h2>{section === 'users' ? 'Usuarios' : 'Proyectos'}</h2>
              <p>{section === 'users' ? `${users.length} cuentas cargadas` : `${projects.length} proyectos cargados`}</p>
            </div>
            <button className="row-action" type="button" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" /> Actualizar
            </button>
          </div>

          {error ? <div className="form-alert admin-alert" role="alert">{error}</div> : null}

          {loading ? (
            <div className="table-skeleton" role="status" aria-label="Cargando datos">
              <span /><span /><span />
            </div>
          ) : section === 'users' ? (
            <UsersTable users={users} busyId={busyId} onToggleStatus={handleUserStatus} />
          ) : (
            <ProjectsTable projects={projects} busyId={busyId} onToggleStatus={handleProjectStatus} />
          )}
        </main>
      </div>

      {showCreateUser ? (
        <CreateUserModal onClose={() => setShowCreateUser(false)} onCreate={handleCreateUser} />
      ) : null}
    </div>
  );
};

export default AdminPage;
