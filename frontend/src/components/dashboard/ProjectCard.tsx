import { FolderOpen, Archive, ArrowRight } from 'lucide-react';

interface ProjectCardProps {
  id: string;
  nombre: string;
  descripcion: string | null;
  sesionesCount: number;
  estado: 'ACTIVO' | 'ARCHIVADO';
  activeSessionId?: string;
  onVerSesiones: (id: string) => void;
  onArchivar: (id: string) => void;
  onEntrarLienzo: (sessionId: string) => void;
}

const ProjectCard = ({
  id,
  nombre,
  descripcion,
  sesionesCount,
  estado,
  activeSessionId,
  onVerSesiones,
  onArchivar,
  onEntrarLienzo,
}: ProjectCardProps) => (
  <article className="project-card">
    <div className="project-card__header">
      <div className="project-card__meta">
        <span
          className={`status-badge ${
            estado === 'ACTIVO' ? 'status-badge--active' : 'status-badge--archived'
          }`}
        >
          {estado === 'ACTIVO' ? 'Activo' : 'Archivado'}
        </span>
        <span className="project-card__session-count">
          {sesionesCount === 0
            ? 'Sin sesiones'
            : sesionesCount === 1
              ? '1 sesión'
              : `${sesionesCount} sesiones`}
        </span>
      </div>
      <button
        type="button"
        className="icon-button project-card__archive-btn"
        onClick={() => onArchivar(id)}
        aria-label={`Archivar proyecto ${nombre}`}
        disabled={estado === 'ARCHIVADO'}
        title="Archivar proyecto"
      >
        <Archive size={15} aria-hidden="true" />
      </button>
    </div>

    <h3 className="project-card__name">{nombre}</h3>

    {descripcion ? (
      <p className="project-card__desc">{descripcion}</p>
    ) : (
      <p className="project-card__desc project-card__desc--empty">Sin descripción</p>
    )}

    <div className="project-card__actions" style={{ flexDirection: 'column', gap: 'var(--space-2)' }}>
      {activeSessionId ? (
        <button
          type="button"
          className="ui-button"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => onEntrarLienzo(activeSessionId)}
          disabled={estado === 'ARCHIVADO'}
        >
          Entrar al lienzo
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : null}

      <button
        type="button"
        className={activeSessionId ? "row-action project-card__btn" : "ui-button ui-button--secondary"}
        style={!activeSessionId ? { width: '100%', justifyContent: 'center' } : {}}
        onClick={() => onVerSesiones(id)}
        disabled={estado === 'ARCHIVADO'}
        title="Ver sesiones del proyecto"
      >
        <FolderOpen size={14} aria-hidden="true" />
        Gestor de Sesiones
      </button>
    </div>
  </article>
);

export default ProjectCard;
