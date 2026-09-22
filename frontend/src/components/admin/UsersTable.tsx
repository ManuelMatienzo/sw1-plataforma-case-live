import { Power } from 'lucide-react';
import { AdminUser } from '../../types/admin';

interface UsersTableProps {
  users: AdminUser[];
  busyId: string | null;
  onToggleStatus: (user: AdminUser) => void;
}

const roleLabels: Record<AdminUser['rol'], string> = {
  ADMINISTRADOR: 'Administrador',
  ANFITRION: 'Anfitrión',
  COLABORADOR: 'Colaborador',
};

const dateFormatter = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const UsersTable = ({ users, busyId, onToggleStatus }: UsersTableProps) => {
  if (users.length === 0) {
    return (
      <div className="admin-empty">
        <h3>Aún no hay usuarios para mostrar</h3>
        <p>Crea la primera cuenta para habilitar el trabajo del equipo.</p>
      </div>
    );
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <caption className="sr-only">Usuarios registrados en CASE IA</caption>
        <thead>
          <tr>
            <th scope="col">Usuario</th>
            <th scope="col">Rol</th>
            <th scope="col">Creación</th>
            <th scope="col">Estado</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isBusy = busyId === user.id;
            return (
              <tr key={user.id}>
                <td>
                  <span className="table-primary">{user.nombre}</span>
                  <span className="table-secondary">{user.email}</span>
                </td>
                <td>{roleLabels[user.rol]}</td>
                <td>{dateFormatter.format(new Date(user.fechaCreacion))}</td>
                <td>
                  <span className={`status-badge status-badge--${user.activo ? 'active' : 'inactive'}`}>
                    {user.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="table-actions">
                  <button
                    className="row-action"
                    type="button"
                    disabled={isBusy}
                    onClick={() => onToggleStatus(user)}
                    aria-label={`${user.activo ? 'Desactivar' : 'Activar'} a ${user.nombre}`}
                  >
                    <Power size={16} aria-hidden="true" />
                    {isBusy ? 'Guardando…' : user.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default UsersTable;

