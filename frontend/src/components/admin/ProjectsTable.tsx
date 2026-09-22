import { ArchiveRestore, Archive } from 'lucide-react';
import { AdminProject } from '../../types/admin';

interface ProjectsTableProps {
  projects: AdminProject[];
  busyId: string | null;
  onToggleStatus: (project: AdminProject) => void;
}

const dateFormatter = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const ProjectsTable = ({ projects, busyId, onToggleStatus }: ProjectsTableProps) => {
  if (projects.length === 0) {
    return (
      <div className="admin-empty">
        <h3>No hay proyectos registrados</h3>
        <p>Los proyectos aparecerán aquí cuando un anfitrión cree el primero.</p>
      </div>
    );
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <caption className="sr-only">Proyectos registrados en CASE IA</caption>
        <thead>
          <tr>
            <th scope="col">Proyecto</th>
            <th scope="col">Propietario</th>
            <th scope="col">Actualización</th>
            <th scope="col">Estado</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const isArchived = project.estado === 'ARCHIVADO';
            const isBusy = busyId === project.id;
            const ActionIcon = isArchived ? ArchiveRestore : Archive;
            return (
              <tr key={project.id}>
                <td>
                  <span className="table-primary">{project.nombre}</span>
                  <span className="table-secondary">{project.descripcion || 'Sin descripción'}</span>
                </td>
                <td>
                  <span className="table-primary table-primary--small">{project.propietario.nombre}</span>
                  <span className="table-secondary">{project.propietario.email}</span>
                </td>
                <td>{dateFormatter.format(new Date(project.fechaActualizacion))}</td>
                <td>
                  <span className={`status-badge status-badge--${isArchived ? 'archived' : 'active'}`}>
                    {isArchived ? 'Archivado' : 'Activo'}
                  </span>
                </td>
                <td className="table-actions">
                  <button
                    className="row-action"
                    type="button"
                    disabled={isBusy}
                    onClick={() => onToggleStatus(project)}
                    aria-label={`${isArchived ? 'Reactivar' : 'Archivar'} ${project.nombre}`}
                  >
                    <ActionIcon size={16} aria-hidden="true" />
                    {isBusy ? 'Guardando…' : isArchived ? 'Reactivar' : 'Archivar'}
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

export default ProjectsTable;

