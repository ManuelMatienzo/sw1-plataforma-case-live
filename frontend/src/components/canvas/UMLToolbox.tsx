import { MousePointer2, Square, CircleDashed, CornerRightUp, Diamond, MoveDiagonal, GitCommit, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { UMLRelationshipType } from '../../types/uml';
import { useState } from 'react';
import './UMLToolbox.css';

interface Props {
  editable: boolean;
  connecting: boolean;
  type: UMLRelationshipType;
  onAdd: (isInterface: boolean) => void;
  onSelect: () => void;
  onConnect: (type: UMLRelationshipType) => void;
}

const relationships: { type: UMLRelationshipType; icon: React.ReactNode; label: string }[] = [
  { type: 'ASSOCIATION', icon: <MoveDiagonal size={24} />, label: 'Asociación' },
  { type: 'INHERITANCE', icon: <CornerRightUp size={24} />, label: 'Herencia' },
  { type: 'REALIZATION', icon: <GitCommit size={24} />, label: 'Realización' },
  { type: 'DEPENDENCY', icon: <MoveDiagonal size={24} strokeDasharray="3 3" />, label: 'Dependencia' },
  { type: 'AGGREGATION', icon: <Diamond size={24} />, label: 'Agregación' },
  { type: 'COMPOSITION', icon: <Diamond size={24} fill="currentColor" />, label: 'Composición' },
];

export default function UMLToolbox({ editable, connecting, type, onAdd, onSelect, onConnect }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <aside className={`uml-toolbox ${isExpanded ? 'is-expanded' : ''}`} role="toolbar" aria-label="Caja de Herramientas">
      <button 
        aria-label={isExpanded ? 'Ocultar menú' : 'Mostrar menú'} 
        title={isExpanded ? 'Ocultar menú' : 'Mostrar menú'} 
        onClick={() => setIsExpanded(!isExpanded)}
        className="uml-toolbox-toggle"
      >
        {isExpanded ? <PanelLeftClose size={24} /> : <PanelLeftOpen size={24} />}
        <span>Ocultar</span>
      </button>

      <div className="uml-toolbox-divider" />

      <button 
        aria-label="Selector (V)" 
        title="Selector (V)" 
        className={!connecting ? 'is-active' : ''} 
        onClick={onSelect}
      >
        <MousePointer2 size={24} />
        <span>Selector</span>
      </button>

      <button 
        disabled={!editable} 
        aria-label="Nueva Clase" 
        title="Nueva Clase" 
        onClick={() => onAdd(false)}
      >
        <Square size={24} />
        <span>Clase</span>
      </button>
      
      <button 
        disabled={!editable} 
        aria-label="Nueva Interfaz" 
        title="Nueva Interfaz" 
        onClick={() => onAdd(true)}
      >
        <CircleDashed size={24} />
        <span>Interfaz</span>
      </button>

      <div className="uml-toolbox-divider" />

      {relationships.map(rel => (
        <button
          key={rel.type}
          disabled={!editable}
          aria-label={rel.label}
          title={rel.label}
          className={connecting && type === rel.type ? 'is-active' : ''}
          onClick={() => onConnect(rel.type)}
        >
          {rel.icon}
          <span>{rel.label}</span>
        </button>
      ))}
    </aside>
  );
}
