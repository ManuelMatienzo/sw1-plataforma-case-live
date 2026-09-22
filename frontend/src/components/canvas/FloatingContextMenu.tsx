import { Plus, Trash2, Link } from 'lucide-react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { UMLClass } from '../../types/uml';
import { classSize } from './geometry';

interface Props {
  cls: UMLClass;
  x: number;
  y: number;
  scale: number;
  onConnect: () => void;
}

export default function FloatingContextMenu({ cls, x, y, scale, onConnect }: Props) {
  const s = useDiagramStore.getState();
  const cSize = classSize(cls);
  const left = x + cSize.width * scale + 12;
  const top = y;

  return (
    <div
      className="uml-floating-menu"
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 50,
        pointerEvents: 'auto',
      }}
    >
      <button 
        onClick={() => s.addAttribute(cls.id, { id: crypto.randomUUID(), name: 'nuevoAtributo', type: 'Integer', visibility: '-' })}
        style={btnStyle}
        title="Añadir Atributo"
      >
        <Plus size={16} /> Atributo
      </button>
      <button 
        onClick={() => s.addMethod(cls.id, { id: crypto.randomUUID(), name: 'nuevoMetodo', returnType: 'void', parameters: [], visibility: '+' })}
        style={btnStyle}
        title="Añadir Método"
      >
        <Plus size={16} /> Método
      </button>
      <div style={{ height: '1px', background: 'var(--color-border)', margin: '2px 0' }} />
      <button 
        onClick={onConnect}
        style={btnStyle}
        title="Conectar a..."
      >
        <Link size={16} /> Conectar
      </button>
      <div style={{ height: '1px', background: 'var(--color-border)', margin: '2px 0' }} />
      <button 
        onClick={() => s.deleteClass(cls.id)}
        style={{ ...btnStyle, color: 'var(--color-error)' }}
        title="Borrar Clase"
      >
        <Trash2 size={16} /> Borrar
      </button>
    </div>
  );
}

const btnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: 'transparent',
  border: 'none',
  color: 'var(--color-text-primary)',
  fontSize: '0.8125rem',
  padding: '6px 8px',
  borderRadius: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  textAlign: 'left' as const,
  width: '100%',
};
