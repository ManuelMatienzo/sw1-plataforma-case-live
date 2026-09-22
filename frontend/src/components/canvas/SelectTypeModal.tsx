import { useEffect, useRef, useState } from 'react';
import { Box, Check, Search, X } from 'lucide-react';
import './SelectTypeModal.css';

interface SelectTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedType: string) => void;
  currentType: string;
  availableClasses: { id: string; name: string }[];
  isOperation?: boolean;
}

const COMMON_TYPES = [
  'String',
  'Date',
  'LocalDate',
  'LocalDateTime',
  'BigDecimal',
  'Object',
  'List<String>',
];

export default function SelectTypeModal({
  isOpen,
  onClose,
  onSelect,
  currentType,
  availableClasses,
  isOperation = false,
}: SelectTypeModalProps) {
  const [query, setQuery] = useState(currentType && currentType !== '<none>' ? currentType : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(currentType && currentType !== '<none>' ? currentType : '');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentType]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const clean = query.trim();
    if (clean) {
      onSelect(clean);
      onClose();
    }
  };

  return (
    <div className="select-type-backdrop" onClick={onClose} role="presentation">
      <div
        className="select-type-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-type-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="select-type-header">
          <div className="select-type-title-group">
            <div className="select-type-icon-box">
              <Box size={20} />
            </div>
            <div>
              <h2 id="select-type-title">Select Type</h2>
              <p>
                {isOperation
                  ? 'Selecciona o escribe el tipo de retorno de la operación'
                  : 'Selecciona una clase del modelo o escribe un clasificador'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="select-type-close"
            onClick={onClose}
            aria-label="Cerrar ventana (Esc)"
          >
            <X size={18} />
          </button>
        </header>

        <div className="select-type-body">
          <label className="select-type-field">
            <span>Nombre del Tipo / Classifier:</span>
            <div className="select-type-input-wrap">
              <Search size={16} className="select-type-search-icon" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Ej: String, Paciente, Date, List<T>..."
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            </div>
          </label>

          {availableClasses.length > 0 && (
            <div className="select-type-section">
              <h3>Clases del Modelo</h3>
              <div className="select-type-chips">
                {availableClasses.map((cls) => {
                  const isSelected = query.trim().toLowerCase() === cls.name.trim().toLowerCase();
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      className={`select-type-chip ${isSelected ? 'is-active' : ''}`}
                      onClick={() => {
                        setQuery(cls.name);
                        onSelect(cls.name);
                        onClose();
                      }}
                    >
                      <span className="select-type-class-badge">C</span>
                      <span>{cls.name}</span>
                      {isSelected && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="select-type-section">
            <h3>Tipos Comunes</h3>
            <div className="select-type-chips">
              {COMMON_TYPES.map((t) => {
                const isSelected = query.trim().toLowerCase() === t.toLowerCase();
                return (
                  <button
                    key={t}
                    type="button"
                    className={`select-type-chip ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      setQuery(t);
                      onSelect(t);
                      onClose();
                    }}
                  >
                    <span>{t}</span>
                    {isSelected && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="select-type-footer">
          <button type="button" className="select-type-btn-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="select-type-btn-confirm"
            disabled={!query.trim()}
            onClick={handleConfirm}
          >
            Aceptar
          </button>
        </footer>
      </div>
    </div>
  );
}
