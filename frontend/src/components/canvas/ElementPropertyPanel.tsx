import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { relationshipLabels, UMLMultiplicity, UMLRelationshipType, UMLVisibility } from '../../types/uml';
import SelectTypeModal from './SelectTypeModal';
import { createClientId } from '../../utils/uuid';

const visibilityOptions = <><option value="+">+ Pública</option><option value="-">− Privada</option><option value="#"># Protegida</option><option value="~">~ Paquete</option></>;

// Tipos estándar para Atributos (UML 2.5 OMG)
const UML_ATTRIBUTE_TYPES = [
  'String',
  'Integer',
  'Boolean',
  'Date',
  'DateTime',
  'Double',
  'Float',
  'Long',
  'Byte',
  'Char',
  'Short',
] as const;

// Tipos estándar para Operaciones / Métodos (UML 2.5 OMG)
const UML_OPERATION_TYPES = [
  'void',
  'String',
  'Integer',
  'Boolean',
  'Date',
  'DateTime',
  'Double',
  'Float',
  'Long',
  'Byte',
  'Char',
  'Short',
] as const;

interface DataTypeSelectProps {
  value: string;
  onChange: (type: string) => void;
  availableClasses: { id: string; name: string }[];
  isOperation?: boolean;
  ariaLabel?: string;
}

function DataTypeSelect({
  value,
  onChange,
  availableClasses,
  isOperation = false,
  ariaLabel,
}: DataTypeSelectProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const baseTypes = isOperation ? UML_OPERATION_TYPES : UML_ATTRIBUTE_TYPES;
  const trimmed = (value || '').trim();
  const lower = trimmed.toLowerCase();

  // Mapear sinónimos comunes (ej: 'int' -> 'integer')
  const normalizedLower = lower === 'int' ? 'integer' : lower;

  // Comprobar si coincide con alguno de los tipos estándar de UML 2.5
  const matchedBase = baseTypes.find((t) => t.toLowerCase() === normalizedLower);
  const isNone = lower === '<none>' || lower === 'none' || trimmed === '';

  // Si no está en baseTypes ni es <none>, es un clasificador o tipo personalizado (ej: Paciente, BigDecimal)
  const customClassifier = !matchedBase && !isNone && trimmed ? trimmed : null;

  const currentSelectValue = matchedBase || (isNone ? '<none>' : (customClassifier || (isOperation ? 'void' : 'Integer')));

  return (
    <>
      <select
        aria-label={ariaLabel || (isOperation ? 'Tipo de retorno' : 'Tipo de dato')}
        value={currentSelectValue}
        onChange={(e) => {
          const selected = e.target.value;
          if (selected === '__select_type__') {
            setIsModalOpen(true);
          } else {
            onChange(selected);
          }
        }}
      >
        {baseTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value="<none>">&lt;none&gt;</option>
        {customClassifier && (
          <option value={customClassifier}>
            {customClassifier}
          </option>
        )}
        <option value="__select_type__">Select Type...</option>
      </select>

      <SelectTypeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={(newType) => onChange(newType)}
        currentType={value}
        availableClasses={availableClasses}
        isOperation={isOperation}
      />
    </>
  );
}

export default function ElementPropertyPanel({ isExpanded = true, editable, connecting, type, onConnected, onFocusClass }: {
  isExpanded?: boolean; editable: boolean; connecting: boolean; type: UMLRelationshipType; onConnected(): void; onFocusClass(id: string): void;
}) {
  const selectedClassId = useDiagramStore(s => s.selectedClassId);
  const selectedRelationshipId = useDiagramStore(s => s.selectedRelationshipId);
  const connectingSourceId = useDiagramStore(s => s.connectingSourceId);
  const classes = useDiagramStore(s => s.classes);
  const relationships = useDiagramStore(s => s.relationships);
  const s = useDiagramStore.getState();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const cls = classes.find(c => c.id === selectedClassId);
  const rel = relationships.find(r => r.id === selectedRelationshipId);
  const chooseClass = (id: string) => {
    if (editable && (connecting || connectingSourceId)) {
      if (connectingSourceId) { s.finishConnecting(id, type); onConnected(); } else s.startConnecting(id);
    } else { s.selectClass(id); onFocusClass(id); }
    setConfirmId(null);
  };
  return <aside className={`uml-properties ${!isExpanded ? 'is-collapsed' : ''}`} aria-label="Elementos y propiedades">
    <details className="uml-elements" open>
      <summary>Elementos <span>{classes.length + relationships.length}</span></summary>
      <div className="uml-element-list">
        {classes.map(c => <button key={c.id} className={selectedClassId === c.id ? 'is-selected' : ''} onClick={() => chooseClass(c.id)}
          aria-label={`Seleccionar ${c.name}`}><span className="uml-element-symbol">{c.isInterface ? 'I' : 'C'}</span><span>{c.name}</span></button>)}
        {relationships.map(r => <button key={r.id} className={selectedRelationshipId === r.id ? 'is-selected' : ''} onClick={() => s.selectRelationship(r.id)}>
          <span className="uml-element-symbol">R</span><span>{r.name || `${classes.find(c => c.id === r.sourceClassId)?.name} → ${classes.find(c => c.id === r.targetClassId)?.name}`}</span></button>)}
        {!classes.length ? <p>Las clases y relaciones aparecerán aquí.</p> : null}
      </div>
    </details>
    <div className="uml-property-heading"><h2>Propiedades</h2>{cls || rel ? <button aria-label="Cerrar propiedades" onClick={() => s.selectClass(null)}><X size={17} /></button> : null}</div>
    {!cls && !rel ? <p className="uml-property-hint">Selecciona un elemento del lienzo o de la lista para editar sus propiedades.</p> : null}
    {cls ? <fieldset disabled={!editable} className="uml-property-fields" key={cls.id}>
      <label>Nombre de clase<input value={cls.name} maxLength={200} onChange={e => s.updateClass(cls.id, { name: e.target.value })} /></label>
      <div className="uml-checks">
        <label><input type="checkbox" checked={cls.isAbstract} onChange={e => s.updateClass(cls.id, { isAbstract: e.target.checked })} />Abstracta</label>
        <label><input type="checkbox" checked={cls.isInterface} onChange={e => s.updateClass(cls.id, { isInterface: e.target.checked })} />Interfaz</label>
      </div>
      <div className="uml-field-pair">{(['x', 'y'] as const).map(axis => <label key={axis}>Posición {axis.toUpperCase()}<input type="number" step={10} min={-100000} max={100000} value={Math.round(cls.position[axis])}
        onChange={e => s.moveClass(cls.id, axis === 'x' ? Number(e.target.value) : cls.position.x, axis === 'y' ? Number(e.target.value) : cls.position.y)} /></label>)}</div>
      <label>Comentario<textarea value={cls.comment || ''} maxLength={2000} onChange={e => s.updateClass(cls.id, { comment: e.target.value })} /></label>
      <section><div className="uml-section-heading"><h3>Atributos</h3><button aria-label="Añadir atributo" onClick={() => s.addAttribute(cls.id, { id: createClientId(), name: `atributo${cls.attributes.length + 1}`, type: 'Integer', visibility: '-' })}><Plus size={17} /></button></div>
        {cls.attributes.map((a, i) => <details className="uml-member" key={a.id} open>
          <summary>{a.visibility} {a.name}: {a.type}</summary>
          <label>Nombre<input aria-label={`Nombre de atributo ${i + 1}`} value={a.name} maxLength={200} onChange={e => s.updateAttribute(cls.id, a.id, { name: e.target.value })} /></label>
          <div className="uml-field-pair">
            <label>Tipo
              <DataTypeSelect
                ariaLabel={`Tipo de atributo ${i + 1}`}
                value={a.type}
                onChange={(newType) => s.updateAttribute(cls.id, a.id, { type: newType })}
                availableClasses={classes}
                isOperation={false}
              />
            </label>
            <label>Visibilidad<select value={a.visibility} onChange={e => s.updateAttribute(cls.id, a.id, { visibility: e.target.value as UMLVisibility })}>{visibilityOptions}</select></label>
          </div>
          <div className="uml-checks"><label><input type="checkbox" checked={Boolean(a.isPrimaryKey)} onChange={e => s.updateAttribute(cls.id, a.id, { isPrimaryKey: e.target.checked })} />PK</label>
            <label><input type="checkbox" checked={Boolean(a.isNullable)} onChange={e => s.updateAttribute(cls.id, a.id, { isNullable: e.target.checked })} />Nulo</label>
            <label><input type="checkbox" checked={Boolean(a.isUnique)} onChange={e => s.updateAttribute(cls.id, a.id, { isUnique: e.target.checked })} />Único</label></div>
          <label>Valor por defecto<input value={a.defaultValue || ''} maxLength={1000} onChange={e => s.updateAttribute(cls.id, a.id, { defaultValue: e.target.value })} /></label>
          <button className="uml-delete" onClick={() => s.deleteAttribute(cls.id, a.id)} aria-label={`Eliminar atributo ${a.name}`}><Trash2 size={14} />Eliminar atributo</button>
        </details>)}
      </section>
      <section><div className="uml-section-heading"><h3>Métodos</h3><button aria-label="Añadir método" onClick={() => s.addMethod(cls.id, { id: createClientId(), name: `metodo${cls.methods.length + 1}`, returnType: 'void', visibility: '+', parameters: [] })}><Plus size={17} /></button></div>
        {cls.methods.map((m, i) => <details className="uml-member" key={m.id} open>
          <summary>{m.visibility} {m.name}(): {m.returnType}</summary>
          <label>Nombre<input aria-label={`Nombre de método ${i + 1}`} value={m.name} maxLength={200} onChange={e => s.updateMethod(cls.id, m.id, { name: e.target.value })} /></label>
          <div className="uml-field-pair">
            <label>Retorno
              <DataTypeSelect
                ariaLabel={`Tipo de retorno de método ${i + 1}`}
                value={m.returnType}
                onChange={(newType) => s.updateMethod(cls.id, m.id, { returnType: newType })}
                availableClasses={classes}
                isOperation={true}
              />
            </label>
            <label>Visibilidad<select value={m.visibility} onChange={e => s.updateMethod(cls.id, m.id, { visibility: e.target.value as UMLVisibility })}>{visibilityOptions}</select></label>
          </div>
          <div className="uml-checks"><label><input type="checkbox" checked={Boolean(m.isAbstract)} onChange={e => s.updateMethod(cls.id, m.id, { isAbstract: e.target.checked })} />Abstracto</label>
            <label><input type="checkbox" checked={Boolean(m.isStatic)} onChange={e => s.updateMethod(cls.id, m.id, { isStatic: e.target.checked })} />Estático</label></div>
          <div className="uml-section-heading"><h4>Parámetros</h4><button aria-label={`Añadir parámetro a ${m.name}`} onClick={() => s.updateMethod(cls.id, m.id, { parameters: [...m.parameters, { name: `param${m.parameters.length + 1}`, type: 'Integer' }] })}><Plus size={15} /></button></div>
          {m.parameters.map((p, j) => <div className="uml-parameter" key={j}>
            <input aria-label={`Nombre de parámetro ${j + 1} de ${m.name}`} value={p.name} maxLength={200} onChange={e => s.updateMethod(cls.id, m.id, { parameters: m.parameters.map((x, k) => k === j ? { ...x, name: e.target.value } : x) })} />
            <DataTypeSelect
              ariaLabel={`Tipo de parámetro ${j + 1} de ${m.name}`}
              value={p.type}
              onChange={(newType) => s.updateMethod(cls.id, m.id, { parameters: m.parameters.map((x, k) => k === j ? { ...x, type: newType } : x) })}
              availableClasses={classes}
              isOperation={false}
            />
            <button aria-label={`Eliminar parámetro ${j + 1} de ${m.name}`} onClick={() => s.updateMethod(cls.id, m.id, { parameters: m.parameters.filter((_x, k) => k !== j) })}><X size={14} /></button>
          </div>)}
          <button className="uml-delete" onClick={() => s.deleteMethod(cls.id, m.id)} aria-label={`Eliminar método ${m.name}`}><Trash2 size={14} />Eliminar método</button>
        </details>)}
      </section>
      {confirmId === cls.id ? <div className="uml-delete-confirm"><p>También se eliminarán sus relaciones.</p><button className="uml-delete" onClick={() => { s.deleteClass(cls.id); setConfirmId(null); }}>Confirmar eliminación</button><button onClick={() => setConfirmId(null)}>Cancelar</button></div>
        : <button className="uml-delete" onClick={() => setConfirmId(cls.id)}><Trash2 size={16} />Eliminar clase</button>}
    </fieldset> : null}
    {rel ? <fieldset disabled={!editable} className="uml-property-fields" key={rel.id}>
      <label>Nombre de relación<input value={rel.name || ''} maxLength={200} onChange={e => s.updateRelationship(rel.id, { name: e.target.value })} /></label>
      <label>Tipo de relación<select value={rel.type} onChange={e => s.updateRelationship(rel.id, { type: e.target.value as UMLRelationshipType })}>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="uml-checks" style={{ margin: '8px 0' }}><input type="checkbox" checked={rel.isOrthogonal !== false} onChange={e => s.updateRelationship(rel.id, { isOrthogonal: e.target.checked })} /> Enrutamiento ortogonal (90°)</label>
      {(['source', 'target'] as const).map(side => <section key={side}><h3>{side === 'source' ? 'Origen' : 'Destino'} · {s.classes.find(c => c.id === rel[`${side}ClassId`])?.name}</h3>
        <label>Multiplicidad {side === 'source' ? 'origen' : 'destino'}<select value={rel[`${side}Multiplicity`] || ''} onChange={e => s.updateRelationship(rel.id, { [`${side}Multiplicity`]: e.target.value || undefined } as Partial<typeof rel>)}>
          <option value="">Sin especificar</option>{(['1', '0..1', '1..*', '0..*', '*'] as UMLMultiplicity[]).map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Rol {side === 'source' ? 'origen' : 'destino'}<input value={rel[`${side}Role`] || ''} maxLength={200} onChange={e => s.updateRelationship(rel.id, { [`${side}Role`]: e.target.value })} /></label>
      </section>)}
      {rel.type === 'COMPOSITION' || rel.type === 'AGGREGATION' ? <p className="uml-property-hint">El rombo se dibuja en el origen, que representa el todo.</p> : null}
      <p className="uml-property-hint">La consistencia semántica está pendiente de validación UML.</p>
      <button className="uml-delete" onClick={() => s.deleteRelationship(rel.id)}><Trash2 size={16} />Eliminar relación</button>
    </fieldset> : null}
  </aside>;
}
