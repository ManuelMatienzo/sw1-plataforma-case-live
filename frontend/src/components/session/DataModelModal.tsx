import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import {
  Database,
  X,
  Copy,
  Check,
  Download,
  RotateCcw,
  Network,
  Table2,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { UMLDiagramAST } from '../../types/uml';
import { DataModelResult, InheritanceStrategy } from '../../types/dataModel';
import { dataModelApi } from '../../services/dataModelApi';
import './DataModelModal.css';

// Configuración inicial de Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'JetBrains Mono, monospace',
  er: {
    useMaxWidth: true,
  },
});

export interface DataModelModalProps {
  isOpen: boolean;
  onClose(): void;
  ast: UMLDiagramAST;
  sessionId?: string;
}

export const DataModelModal: React.FC<DataModelModalProps> = ({
  isOpen,
  onClose,
  ast,
  sessionId,
}) => {
  const [strategy, setStrategy] = useState<InheritanceStrategy>('TPS');
  const [activeTab, setActiveTab] = useState<'er' | 'tables' | 'norm' | 'recs'>('er');
  const [viewMode, setViewMode] = useState<'visual' | 'code'>('visual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DataModelResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState<string>('');
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const renderCounter = useRef(0);

  // Generar o regenerar modelo de datos relacional
  const generateModel = useCallback(async (targetStrategy: InheritanceStrategy) => {
    setLoading(true);
    setError(null);
    try {
      let data: DataModelResult;
      if (ast && (ast.classes.length > 0 || !sessionId)) {
        data = await dataModelApi.generarDesdeAst(ast, { inheritanceStrategy: targetStrategy });
      } else if (sessionId) {
        data = await dataModelApi.generarDesdeSesion(sessionId, { inheritanceStrategy: targetStrategy });
      } else {
        throw new Error('No hay clases ni sesión disponible para transformar.');
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Error al generar el modelo de datos relacional.');
    } finally {
      setLoading(false);
    }
  }, [ast, sessionId]);

  // Carga inicial al abrir o cambiar estrategia
  useEffect(() => {
    if (isOpen) {
      void generateModel(strategy);
    }
  }, [isOpen, strategy, generateModel]);

  // Renderizar Mermaid SVG cada vez que cambie el diagrama ER
  useEffect(() => {
    if (!result?.mermaidErDiagram) {
      setMermaidSvg('');
      return;
    }

    let isMounted = true;
    renderCounter.current += 1;
    const renderId = `mermaid-er-${Date.now()}-${renderCounter.current}`;

    const renderDiagram = async () => {
      try {
        setMermaidError(null);
        // Mermaid renderiza el diagrama ER en formato SVG
        const { svg } = await mermaid.render(renderId, result.mermaidErDiagram);
        if (isMounted) {
          setMermaidSvg(svg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Error renderizando Mermaid ER:', err);
          setMermaidError('No fue posible renderizar el gráfico SVG de Mermaid. Puedes ver la sintaxis formal.');
        }
      }
    };

    void renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [result?.mermaidErDiagram]);

  // Manejo de teclado (Escape para cerrar)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Copiar sintaxis Mermaid al portapapeles
  const handleCopyMermaid = async () => {
    if (!result?.mermaidErDiagram) return;
    try {
      await navigator.clipboard.writeText(result.mermaidErDiagram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback manual
    }
  };

  // Descargar JSON del modelo relacional
  const handleDownloadJson = () => {
    if (!result) return;
    const jsonStr = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-relacional-3fn-${strategy.toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="dm-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        className="dm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-dialog-title"
      >
        {/* Header */}
        <header className="dm-header">
          <div className="dm-header-title-group">
            <div className="dm-title-icon" aria-hidden="true">
              <Database size={22} />
            </div>
            <div>
              <h2 id="dm-dialog-title">
                Modelo de Datos Relacional
                <span className="dm-header-badge">Reglas de Tom · 3FN</span>
              </h2>
              <p className="dm-header-sub">
                Transformación formal desde UML 2.5 OMG hacia esquema relacional normalizado
              </p>
            </div>
          </div>
          <button
            className="dm-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
            title="Cerrar (Esc)"
          >
            <X size={20} />
          </button>
        </header>

        {/* Strategy and Action Bar */}
        <div className="dm-strategy-bar">
          <div className="dm-strategy-group">
            <span className="dm-strategy-label">Herencia:</span>
            <div className="dm-strategy-pills" role="radiogroup" aria-label="Estrategia de herencia">
              <button
                type="button"
                className={`dm-strategy-pill ${strategy === 'TPS' ? 'is-active' : ''}`}
                onClick={() => setStrategy('TPS')}
                title="Table-Per-Subclass (Joined): Superclase + Subclases con FK. Recomendada para 3FN."
              >
                <span>TPS</span>
                <span className="dm-pill-badge">3FN Recomendada</span>
              </button>
              <button
                type="button"
                className={`dm-strategy-pill ${strategy === 'TPH' ? 'is-active' : ''}`}
                onClick={() => setStrategy('TPH')}
                title="Table-Per-Hierarchy (Single Table): Una sola tabla con discriminador. Acepta NULLs."
              >
                <span>TPH</span>
                <span className="dm-pill-badge">Single Table</span>
              </button>
              <button
                type="button"
                className={`dm-strategy-pill ${strategy === 'TPC' ? 'is-active' : ''}`}
                onClick={() => setStrategy('TPC')}
                title="Table-Per-Concrete-Class: Tablas independientes sin FK de herencia."
              >
                <span>TPC</span>
                <span className="dm-pill-badge">Tablas Concretas</span>
              </button>
            </div>
          </div>

          <div className="dm-actions-group">
            <button
              type="button"
              className={`dm-btn-secondary ${copied ? 'is-copied' : ''}`}
              onClick={handleCopyMermaid}
              disabled={loading || !result}
              title="Copiar diagrama Mermaid erDiagram"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? '¡Copiado!' : 'Copiar Mermaid ER'}</span>
            </button>
            <button
              type="button"
              className="dm-btn-secondary"
              onClick={handleDownloadJson}
              disabled={loading || !result}
              title="Descargar estructura completa en JSON"
            >
              <Download size={15} />
              <span>Descargar JSON</span>
            </button>
            <button
              type="button"
              className="dm-btn-secondary"
              onClick={() => generateModel(strategy)}
              disabled={loading}
              title="Regenerar modelo de datos"
            >
              <RotateCcw size={15} className={loading ? 'dm-spinner' : ''} />
              <span>{loading ? 'Generando…' : 'Regenerar'}</span>
            </button>
          </div>
        </div>

        {/* Strategy Context Banner */}
        <div className="dm-strategy-expl">
          <Info size={15} aria-hidden="true" />
          <span>
            {strategy === 'TPS' && (
              <>
                <strong>Estrategia TPS (Table-Per-Subclass / Joined Table):</strong> Superclase y subclases mapeadas a tablas independientes con claves foráneas cruzadas y eliminación en cascada. Evita columnas nulas y preserva la Tercera Forma Normal (3FN).
              </>
            )}
            {strategy === 'TPH' && (
              <>
                <strong>Estrategia TPH (Table-Per-Hierarchy / Single Table):</strong> Jerarquía unificada en una única tabla con columna discriminadora (<code>tipo_discriminador</code>). Optimiza lecturas pero relaja restricciones NOT NULL en columnas especializadas.
              </>
            )}
            {strategy === 'TPC' && (
              <>
                <strong>Estrategia TPC (Table-Per-Concrete-Class):</strong> Cada subclase concreta mapea a una tabla propia replicando los atributos heredados. Desacopla entidades a expensas de redundancia de esquema.
              </>
            )}
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="dm-tabs-bar" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'er'}
            className={`dm-tab-btn ${activeTab === 'er' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('er')}
          >
            <Network size={16} />
            <span>Diagrama ER</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'tables'}
            className={`dm-tab-btn ${activeTab === 'tables' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('tables')}
          >
            <Table2 size={16} />
            <span>Tablas y Esquema</span>
            {result ? <span className="dm-tab-count">{result.tables.length}</span> : null}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'norm'}
            className={`dm-tab-btn ${activeTab === 'norm' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('norm')}
          >
            <ShieldCheck size={16} />
            <span>Auditoría 3FN</span>
            {result ? (
              <span
                className="dm-tab-count"
                style={{
                  color: result.normalization.enForma3FN ? 'var(--color-success)' : 'var(--color-warning)',
                }}
              >
                {result.normalization.enForma3FN ? '✓ 3FN' : 'Observación'}
              </span>
            ) : null}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'recs'}
            className={`dm-tab-btn ${activeTab === 'recs' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('recs')}
          >
            <Sparkles size={16} />
            <span>Recomendaciones DBA</span>
            {result ? <span className="dm-tab-count">{result.recommendations.length}</span> : null}
          </button>
        </div>

        {/* Tab Content Viewport */}
        <div className="dm-tab-content">
          {loading ? (
            <div className="dm-loading-wrap">
              <RotateCcw size={32} className="dm-spinner" />
              <p>Aplicando reglas de transformación de Tom y normalización 3FN…</p>
            </div>
          ) : error ? (
            <div className="dm-norm-banner is-warning">
              <AlertTriangle size={20} />
              <div>
                <h3>No fue posible generar el modelo de datos</h3>
                <p>{error}</p>
              </div>
            </div>
          ) : !result ? (
            <div className="dm-empty-state">
              <h3>Sin datos</h3>
              <p>Crea al menos una clase en el canvas para generar el modelo relacional.</p>
            </div>
          ) : (
            <>
              {/* TAB 1: Diagrama ER Mermaid */}
              {activeTab === 'er' && (
                <div className="dm-er-container">
                  <div className="dm-er-toolbar">
                    <div className="dm-toggle-group">
                      <button
                        type="button"
                        className={`dm-toggle-btn ${viewMode === 'visual' ? 'is-active' : ''}`}
                        onClick={() => setViewMode('visual')}
                      >
                        Vista Visual
                      </button>
                      <button
                        type="button"
                        className={`dm-toggle-btn ${viewMode === 'code' ? 'is-active' : ''}`}
                        onClick={() => setViewMode('code')}
                      >
                        Sintaxis Mermaid
                      </button>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Notación estándar Mermaid erDiagram
                    </span>
                  </div>

                  {viewMode === 'visual' ? (
                    <div className="dm-er-viewport">
                      {mermaidError ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                          <AlertTriangle size={28} color="var(--color-warning)" style={{ margin: '0 auto 0.5rem' }} />
                          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{mermaidError}</p>
                          <button
                            type="button"
                            className="dm-btn-secondary"
                            style={{ marginTop: '0.5rem' }}
                            onClick={() => setViewMode('code')}
                          >
                            Ver código fuente Mermaid
                          </button>
                        </div>
                      ) : mermaidSvg ? (
                        <div
                          className="dm-er-svg-wrap"
                          dangerouslySetInnerHTML={{ __html: mermaidSvg }}
                        />
                      ) : (
                        <div className="dm-loading-wrap">
                          <RotateCcw size={24} className="dm-spinner" />
                          <p>Renderizando diagrama ER…</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="dm-syntax-box">{result.mermaidErDiagram}</pre>
                  )}
                </div>
              )}

              {/* TAB 2: Tablas y Esquema */}
              {activeTab === 'tables' && (
                <div className="dm-tables-grid">
                  {result.tables.map(table => (
                    <div key={table.id} className="dm-table-card">
                      <div className="dm-table-header">
                        <div className="dm-table-title">
                          <Table2 size={18} color="var(--color-focus)" />
                          <span className="dm-table-name">{table.name}</span>
                          {table.sourceClassName && (
                            <span className="dm-table-source">({table.sourceClassName})</span>
                          )}
                        </div>
                        {table.isJunctionTable && (
                          <span className="dm-junction-badge">Tabla Intermedia (N:M)</span>
                        )}
                      </div>

                      {table.description && (
                        <div className="dm-table-desc">{table.description}</div>
                      )}

                      <table className="dm-columns-table">
                        <thead>
                          <tr>
                            <th>Columna</th>
                            <th>Tipo SQL</th>
                            <th>Restricciones y Claves</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map(col => (
                            <tr key={col.id}>
                              <td className="dm-col-name">{col.name}</td>
                              <td className="dm-col-type">{col.sqlType}</td>
                              <td>
                                <div className="dm-col-badges">
                                  {col.isPrimaryKey && <span className="dm-badge-pk">PK</span>}
                                  {col.isForeignKey && col.foreignKeyTarget && (
                                    <span
                                      className="dm-badge-fk"
                                      title={`Apunta a ${col.foreignKeyTarget.tableName}(${col.foreignKeyTarget.columnName}) [ON DELETE ${col.foreignKeyTarget.onDelete}]`}
                                    >
                                      FK → {col.foreignKeyTarget.tableName}({col.foreignKeyTarget.columnName})
                                    </span>
                                  )}
                                  {!col.isNullable && <span className="dm-badge-nn">NOT NULL</span>}
                                  {col.isUnique && <span className="dm-badge-uq">UNIQUE</span>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {table.indices.length > 0 && (
                        <div className="dm-table-indices">
                          <div className="dm-indices-title">Índices recomendados:</div>
                          {table.indices.map(idx => (
                            <div key={idx.name} className="dm-index-item">
                              <span className="dm-index-name">
                                {idx.name} ({idx.columns.join(', ')}) {idx.isUnique ? '[UNIQUE]' : '[B-Tree]'}:
                              </span>
                              <span className="dm-index-reason">{idx.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: Auditoría 3FN */}
              {activeTab === 'norm' && (
                <div className="dm-norm-container">
                  <div className={`dm-norm-banner ${result.normalization.enForma3FN ? 'is-success' : 'is-warning'}`}>
                    {result.normalization.enForma3FN ? (
                      <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
                    ) : (
                      <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                    )}
                    <div>
                      <h3>
                        {result.normalization.enForma3FN
                          ? 'Esquema Certificado en Tercera Forma Normal (3FN)'
                          : 'Esquema con Observaciones de Normalización'}
                      </h3>
                      <p>
                        {result.normalization.enForma3FN
                          ? 'El modelo relacional cumple rigurosamente con 1FN, 2FN y 3FN. Todos los atributos dependen única, completa y directamente de sus claves primarias según las Reglas de Tom.'
                          : 'Se han detectado advertencias de desnormalización o dependencias transitivas en algunas tablas.'}
                      </p>
                    </div>
                  </div>

                  <div className="dm-norm-checklist">
                    <div className="dm-checklist-card">
                      <div className="dm-checklist-header">
                        <span className="dm-checklist-title">1FN: Atomicidad</span>
                        <span className="dm-checklist-tag is-pass">CUMPLE</span>
                      </div>
                      <p className="dm-checklist-desc">
                        Ausencia de atributos multivaluados o grupos repetitivos. Cada celda contiene valores atómicos con tipos estándar.
                      </p>
                    </div>
                    <div className="dm-checklist-card">
                      <div className="dm-checklist-header">
                        <span className="dm-checklist-title">2FN: Dependencia Total</span>
                        <span className="dm-checklist-tag is-pass">CUMPLE</span>
                      </div>
                      <p className="dm-checklist-desc">
                        Cumple 1FN y ningún atributo no clave depende parcialmente de una clave primaria compuesta.
                      </p>
                    </div>
                    <div className="dm-checklist-card">
                      <div className="dm-checklist-header">
                        <span className="dm-checklist-title">3FN: No Transitividad</span>
                        <span
                          className="dm-checklist-tag"
                          style={{
                            background: result.normalization.is3FN ? 'var(--color-success-soft)' : 'var(--color-warning-soft)',
                            color: result.normalization.is3FN ? 'var(--color-success)' : 'var(--color-warning)',
                          }}
                        >
                          {result.normalization.is3FN ? 'CUMPLE' : 'REVISAR'}
                        </span>
                      </div>
                      <p className="dm-checklist-desc">
                        Ningún atributo no clave depende de otro atributo no clave (ausencia de dependencias transitivas).
                      </p>
                    </div>
                  </div>

                  {result.normalization.violations.length > 0 && (
                    <div className="dm-norm-section">
                      <h4>Violaciones o Advertencias Detectadas</h4>
                      {result.normalization.violations.map((v, i) => (
                        <div key={i} className="dm-norm-banner is-warning">
                          <AlertTriangle size={18} />
                          <div>
                            <strong>[{v.level}] En tabla <code>{v.tableName}</code>:</strong> {v.description}
                            <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                              Sugerencia: {v.suggestion}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="dm-norm-section">
                    <h4>Puntos Fuertes del Diseño Relacional</h4>
                    <ul className="dm-strengths-list">
                      {result.normalization.strengths.map((str, idx) => (
                        <li key={idx} className="dm-strength-item">
                          <CheckCircle2 size={16} className="dm-strength-icon" />
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 4: Recomendaciones DBA Virtual */}
              {activeTab === 'recs' && (
                <div className="dm-recs-grid">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="dm-rec-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="dm-rec-badge">{rec.type}</span>
                        <span className="dm-rec-table">{rec.tableName}</span>
                      </div>
                      <h4 className="dm-rec-title">{rec.title}</h4>
                      <p className="dm-rec-rationale">{rec.rationale}</p>
                      {rec.sqlSnippet && (
                        <pre className="dm-rec-sql">{rec.sqlSnippet}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DataModelModal;
