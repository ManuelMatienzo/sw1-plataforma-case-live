import { useMemo, useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  Crosshair,
  Lightbulb,
  Layers,
} from 'lucide-react';
import { UmlDiagnostic, UmlValidationReport } from '../../types/validation';
import './ValidationReportDrawer.css';

interface ValidationReportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  report: UmlValidationReport | null;
  isValidating: boolean;
  onRevalidate: () => void;
  onFocusElement: (targetType: UmlDiagnostic['targetType'], targetId: string) => void;
}

type FilterTab = 'ALL' | 'ERRORS' | 'WARNINGS';

export default function ValidationReportDrawer({
  isOpen,
  onClose,
  report,
  isValidating,
  onRevalidate,
  onFocusElement,
}: ValidationReportDrawerProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredDiagnostics = useMemo(() => {
    if (!report?.diagnostics) return [];
    if (filterTab === 'ERRORS') {
      return report.diagnostics.filter(d => d.severity === 'ERROR');
    }
    if (filterTab === 'WARNINGS') {
      return report.diagnostics.filter(d => d.severity === 'WARNING');
    }
    return report.diagnostics;
  }, [report, filterTab]);

  if (!isOpen) return null;

  const totalErrors = report?.criticalErrorsCount ?? 0;
  const totalWarnings = report?.warningsCount ?? 0;
  const totalTotal = (report?.diagnostics ?? []).length;
  const isValid = report ? report.isValid : false;

  return (
    <aside
      className="uml-val-drawer"
      aria-labelledby="uml-val-drawer-title"
      role="dialog"
      aria-modal="true"
    >
      <header className="uml-val-header">
        <div className="uml-val-header-title">
          <ShieldCheck className="uml-val-header-icon" size={22} aria-hidden="true" />
          <h2 id="uml-val-drawer-title">Validación UML 2.5+</h2>
        </div>
        <div className="uml-val-header-actions">
          <button
            type="button"
            className="uml-val-action-btn"
            onClick={onRevalidate}
            disabled={isValidating}
            aria-label="Revalidar modelo"
            title="Volver a validar diagrama"
          >
            <RefreshCw size={15} className={isValidating ? 'uml-val-spin' : ''} />
            <span>{isValidating ? 'Validando…' : 'Revalidar'}</span>
          </button>
          <button
            type="button"
            className="uml-val-close-btn"
            onClick={onClose}
            aria-label="Cerrar panel de validación (Esc)"
            title="Cerrar (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Banner de Estado General */}
      <div className="uml-val-status-container">
        {isValidating ? (
          <div className="uml-val-banner is-loading" role="status">
            <RefreshCw className="uml-val-spin" size={20} />
            <div>
              <h3>Verificando especificación UML 2.5+…</h3>
              <p>Analizando integridad de clases, multiplicidades y grafos de herencia.</p>
            </div>
          </div>
        ) : !report ? (
          <div className="uml-val-banner is-empty">
            <Layers size={20} />
            <div>
              <h3>Sin informe de validación</h3>
              <p>Presiona el botón "Revalidar" para analizar tu diagrama actual.</p>
            </div>
          </div>
        ) : isValid && totalWarnings === 0 ? (
          <div className="uml-val-banner is-success" role="status">
            <CheckCircle2 size={24} className="uml-val-banner-icon-success" />
            <div>
              <h3>Modelo Válido (UML 2.5+)</h3>
              <p>Cumple con todas las reglas sintácticas y semánticas. Listo para exportación de código.</p>
            </div>
          </div>
        ) : isValid && totalWarnings > 0 ? (
          <div className="uml-val-banner is-warning" role="status">
            <AlertTriangle size={24} className="uml-val-banner-icon-warning" />
            <div>
              <h3>Diagrama Válido con Advertencias</h3>
              <p>
                No hay errores críticos de compilación, pero existen {totalWarnings} sugerencias de diseño y estilo.
              </p>
            </div>
          </div>
        ) : (
          <div className="uml-val-banner is-error" role="alert">
            <AlertCircle size={24} className="uml-val-banner-icon-error" />
            <div>
              <h3>{totalErrors} {totalErrors === 1 ? 'Error Crítico' : 'Errores Críticos'}</h3>
              <p>El diagrama no cumple con las restricciones formales de UML 2.5+ o compatibilidad con backend.</p>
            </div>
          </div>
        )}
      </div>

      {/* Filtros por pestaña */}
      {report && totalTotal > 0 ? (
        <nav className="uml-val-tabs" aria-label="Filtro de diagnósticos">
          <button
            type="button"
            className={`uml-val-tab ${filterTab === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setFilterTab('ALL')}
          >
            <span>Todos</span>
            <span className="uml-val-tab-count">{totalTotal}</span>
          </button>
          <button
            type="button"
            className={`uml-val-tab ${filterTab === 'ERRORS' ? 'is-active' : ''}`}
            onClick={() => setFilterTab('ERRORS')}
            disabled={totalErrors === 0}
          >
            <span className="uml-val-tab-label-error">Errores Críticos</span>
            <span className="uml-val-tab-count is-error">{totalErrors}</span>
          </button>
          <button
            type="button"
            className={`uml-val-tab ${filterTab === 'WARNINGS' ? 'is-active' : ''}`}
            onClick={() => setFilterTab('WARNINGS')}
            disabled={totalWarnings === 0}
          >
            <span className="uml-val-tab-label-warning">Advertencias</span>
            <span className="uml-val-tab-count is-warning">{totalWarnings}</span>
          </button>
        </nav>
      ) : null}

      {/* Lista de Diagnósticos */}
      <main className="uml-val-list" tabIndex={0} aria-label="Lista de diagnósticos UML">
        {filteredDiagnostics.length === 0 && report && totalTotal === 0 ? (
          <div className="uml-val-empty-state">
            <CheckCircle2 size={40} className="uml-val-empty-icon" />
            <h3>¡Excelente trabajo!</h3>
            <p>No se encontraron errores de sintaxis, relaciones huérfanas ni ciclos de herencia en el modelo.</p>
          </div>
        ) : filteredDiagnostics.length === 0 && report ? (
          <div className="uml-val-empty-state">
            <p>No hay diagnósticos en la categoría seleccionada.</p>
          </div>
        ) : (
          filteredDiagnostics.map(diag => {
            const isError = diag.severity === 'ERROR';
            return (
              <article
                key={diag.id}
                className={`uml-val-card ${isError ? 'is-error-card' : 'is-warning-card'}`}
              >
                <header className="uml-val-card-header">
                  <div className="uml-val-card-badges">
                    <span className={`uml-val-severity-badge ${isError ? 'is-error' : 'is-warning'}`}>
                      {isError ? (
                        <>
                          <AlertCircle size={12} />
                          <span>Error Crítico</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={12} />
                          <span>Advertencia</span>
                        </>
                      )}
                    </span>
                    <span className="uml-val-rule-code">{diag.code}</span>
                  </div>
                  <button
                    type="button"
                    className="uml-val-locate-btn"
                    onClick={() => onFocusElement(diag.targetType, diag.targetId)}
                    title={`Localizar "${diag.targetName}" en el lienzo`}
                    aria-label={`Localizar "${diag.targetName}" en el lienzo`}
                  >
                    <Crosshair size={14} />
                    <span>Localizar</span>
                  </button>
                </header>

                <div className="uml-val-card-target">
                  <span className="uml-val-target-label">Elemento:</span>
                  <span className="uml-val-target-name">{diag.targetName}</span>
                </div>

                <p className="uml-val-card-message">{diag.message}</p>

                {diag.suggestion ? (
                  <div className="uml-val-suggestion-box">
                    <Lightbulb size={14} className="uml-val-suggestion-icon" aria-hidden="true" />
                    <p className="uml-val-suggestion-text">{diag.suggestion}</p>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </main>

      <footer className="uml-val-footer">
        <span>OMG UML Standard Specification v2.5.1</span>
        {report?.validatedAt ? (
          <span className="uml-val-timestamp">
            {new Date(report.validatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        ) : null}
      </footer>
    </aside>
  );
}
