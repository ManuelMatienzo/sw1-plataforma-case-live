import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FileCode,
  X,
  Copy,
  Check,
  Download,
  RotateCcw,
  Layers,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { UMLDiagramAST } from '../../types/uml';
import { InheritanceStrategy } from '../../types/dataModel';
import { PostgresDdlOptions, PostgresDdlResult } from '../../types/ddl';
import { ddlApi } from '../../services/ddlApi';
import './PostgresDdlModal.css';

export interface PostgresDdlModalProps {
  isOpen: boolean;
  onClose(): void;
  ast: UMLDiagramAST;
  sessionId?: string;
}

export const PostgresDdlModal: React.FC<PostgresDdlModalProps> = ({
  isOpen,
  onClose,
  ast,
  sessionId,
}) => {
  const [strategy, setStrategy] = useState<InheritanceStrategy>('TPS');
  const [pluralize, setPluralize] = useState<boolean>(true);
  const [includeDropTable, setIncludeDropTable] = useState<boolean>(true);
  const [ifNotExists, setIfNotExists] = useState<boolean>(true);
  const [includeComments, setIncludeComments] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostgresDdlResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Generar script DDL
  const generateDdl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const options: PostgresDdlOptions = {
        inheritanceStrategy: strategy,
        pluralize,
        includeDropTable,
        ifNotExists,
        includeComments,
        schema: 'public',
      };

      let data: PostgresDdlResult;
      if (ast && (ast.classes.length > 0 || !sessionId)) {
        data = await ddlApi.generarDesdeAst(ast, options);
      } else if (sessionId) {
        data = await ddlApi.generarDesdeSesion(sessionId, options);
      } else {
        throw new Error('No hay clases ni sesión disponible para transformar en DDL.');
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Error al generar el script DDL de PostgreSQL.');
    } finally {
      setLoading(false);
    }
  }, [ast, sessionId, strategy, pluralize, includeDropTable, ifNotExists, includeComments]);

  // Cargar DDL al abrir o cuando cambien los parámetros principales
  useEffect(() => {
    if (isOpen) {
      void generateDdl();
    }
  }, [isOpen, strategy, pluralize, includeDropTable, ifNotExists, includeComments, generateDdl]);

  // Copiar al portapapeles
  const handleCopy = async () => {
    if (!result?.sql) return;
    try {
      await navigator.clipboard.writeText(result.sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar al portapapeles', err);
    }
  };

  // Descargar archivo .sql
  const handleDownload = async () => {
    if (!result?.sql) return;
    setDownloading(true);
    try {
      if (sessionId) {
        await ddlApi.descargarDesdeSesion(sessionId, {
          inheritanceStrategy: strategy,
          pluralize,
          includeDropTable,
          ifNotExists,
          includeComments,
        });
      } else {
        ddlApi.descargarTextoSql(result.sql, result.filename || 'schema.sql');
      }
    } catch (err) {
      console.error('Error en descarga de DDL:', err);
      // Fallback a descarga directa de texto
      ddlApi.descargarTextoSql(result.sql, result.filename || 'schema.sql');
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="ddl-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ddl-modal-container" onClick={e => e.stopPropagation()}>
        {/* Cabecera */}
        <header className="ddl-modal-header">
          <div className="ddl-modal-title-group">
            <div className="ddl-modal-icon-badge">
              <FileCode className="ddl-icon-main" size={24} />
            </div>
            <div>
              <div className="ddl-title-row">
                <h2>Script DDL PostgreSQL 15+</h2>
                <span className="ddl-version-badge">Idempotente</span>
              </div>
              <p className="ddl-subtitle">
                Esquema relacional normalizado a 3FN, claves foráneas diferidas con ALTER TABLE e índices B-tree.
              </p>
            </div>
          </div>

          <button
            className="ddl-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
            title="Cerrar"
          >
            <X size={20} />
          </button>
        </header>

        {/* Barra de opciones de generación */}
        <section className="ddl-options-bar">
          <div className="ddl-options-controls">
            <div className="ddl-option-group">
              <label htmlFor="ddl-strategy-select" className="ddl-label">
                <Layers size={14} />
                <span>Herencia:</span>
              </label>
              <select
                id="ddl-strategy-select"
                value={strategy}
                onChange={e => setStrategy(e.target.value as InheritanceStrategy)}
                className="ddl-select"
              >
                <option value="TPS">TPS (Table-Per-Subclass / Normalizado)</option>
                <option value="TPH">TPH (Table-Per-Hierarchy / Single Table)</option>
                <option value="TPC">TPC (Table-Per-Concrete-Class)</option>
              </select>
            </div>

            <label className="ddl-checkbox-label">
              <input
                type="checkbox"
                checked={pluralize}
                onChange={e => setPluralize(e.target.checked)}
              />
              <span>Pluralizar tablas (ej. pacientes)</span>
            </label>

            <label className="ddl-checkbox-label">
              <input
                type="checkbox"
                checked={includeDropTable}
                onChange={e => setIncludeDropTable(e.target.checked)}
              />
              <span>DROP TABLE IF EXISTS</span>
            </label>

            <label className="ddl-checkbox-label">
              <input
                type="checkbox"
                checked={ifNotExists}
                onChange={e => setIfNotExists(e.target.checked)}
              />
              <span>IF NOT EXISTS</span>
            </label>

            <label className="ddl-checkbox-label">
              <input
                type="checkbox"
                checked={includeComments}
                onChange={e => setIncludeComments(e.target.checked)}
              />
              <span>Comentarios SQL</span>
            </label>
          </div>

          <div className="ddl-options-actions">
            <button
              className="ddl-btn-secondary"
              onClick={generateDdl}
              disabled={loading}
              title="Regenerar script DDL con opciones actuales"
            >
              <RotateCcw size={14} className={loading ? 'ddl-spinning' : ''} />
              <span>Regenerar</span>
            </button>
          </div>
        </section>

        {/* Resumen de Métricas */}
        {result && (
          <section className="ddl-metrics-bar">
            <div className="ddl-metric-chip">
              <span className="ddl-metric-number">{result.tablesCount}</span>
              <span className="ddl-metric-label">Tablas</span>
            </div>
            <div className="ddl-metric-chip">
              <span className="ddl-metric-number">{result.relationshipsCount}</span>
              <span className="ddl-metric-label">Foreign Keys</span>
            </div>
            <div className="ddl-metric-chip">
              <span className="ddl-metric-number">{result.indicesCount}</span>
              <span className="ddl-metric-label">Índices B-Tree</span>
            </div>
            <div className="ddl-metric-chip ddl-chip-info">
              <Info size={13} />
              <span>Dialecto ANSI SQL:2016 / PostgreSQL 15+</span>
            </div>
          </section>
        )}

        {/* Contenido Principal */}
        <main className="ddl-modal-body">
          {loading && (
            <div className="ddl-loading-overlay">
              <RotateCcw className="ddl-spinning" size={32} />
              <p>Generando script DDL de PostgreSQL...</p>
            </div>
          )}

          {error && (
            <div className="ddl-error-banner" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {result && !loading && (
            <div className="ddl-code-viewer-container">
              <div className="ddl-code-toolbar">
                <span className="ddl-code-filename">{result.filename}</span>
                <div className="ddl-code-actions">
                  <button
                    className="ddl-code-btn"
                    onClick={handleCopy}
                    title="Copiar script SQL al portapapeles"
                  >
                    {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    <span>{copied ? '¡Copiado!' : 'Copiar SQL'}</span>
                  </button>
                  <button
                    className="ddl-code-btn ddl-btn-highlight"
                    onClick={handleDownload}
                    disabled={downloading}
                    title="Descargar archivo schema.sql"
                  >
                    <Download size={14} />
                    <span>{downloading ? 'Descargando...' : 'Descargar schema.sql'}</span>
                  </button>
                </div>
              </div>
              <pre className="ddl-code-block">
                <code>{result.sql}</code>
              </pre>
            </div>
          )}
        </main>

        {/* Pie de modal */}
        <footer className="ddl-modal-footer">
          <div className="ddl-footer-hint">
            <SlidersHorizontal size={14} />
            <span>El script puede ejecutarse directamente en `psql`, pgAdmin o DBeaver.</span>
          </div>
          <button className="ddl-btn-primary" onClick={onClose}>
            Entendido
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};
export default PostgresDdlModal;
