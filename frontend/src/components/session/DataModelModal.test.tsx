import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataModelModal from './DataModelModal';
import { dataModelApi } from '../../services/dataModelApi';
import { DataModelResult } from '../../types/dataModel';
import { UMLDiagramAST } from '../../types/uml';

vi.mock('../../services/dataModelApi', () => ({
  dataModelApi: {
    generarDesdeAst: vi.fn(),
    generarDesdeSesion: vi.fn(),
  },
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-mock">Mock ER SVG</svg>' }),
  },
}));

// Mock URL.createObjectURL / revokeObjectURL for JSDOM
global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-data-model');
global.URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockAst: UMLDiagramAST = {
  version: 1,
  nombre: 'Prueba Modelo',
  classes: [
    {
      id: 'cls-1',
      name: 'Pedido',
      isAbstract: false,
      isInterface: false,
      attributes: [
        { id: 'a1', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        { id: 'a2', name: 'total', type: 'Float', visibility: '+' },
      ],
      methods: [],
      position: { x: 100, y: 100 },
    },
    {
      id: 'cls-2',
      name: 'Cliente',
      isAbstract: false,
      isInterface: false,
      attributes: [
        { id: 'a3', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        { id: 'a4', name: 'nombre', type: 'String', visibility: '+' },
      ],
      methods: [],
      position: { x: 400, y: 100 },
    },
  ],
  relationships: [
    {
      id: 'rel-1',
      sourceClassId: 'cls-2',
      targetClassId: 'cls-1',
      type: 'ASSOCIATION',
      sourceMultiplicity: '1',
      targetMultiplicity: '0..*',
    },
  ],
};

const mockResult: DataModelResult = {
  inheritanceStrategy: 'TPS',
  tables: [
    {
      id: 'tbl-cliente',
      name: 'cliente',
      displayName: 'Cliente',
      sourceClassId: 'cls-2',
      sourceClassName: 'Cliente',
      isJunctionTable: false,
      columns: [
        { id: 'c1', name: 'id', sqlType: 'BIGSERIAL', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { id: 'c2', name: 'nombre', sqlType: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
      ],
      foreignKeys: [],
      indices: [],
      description: 'Mapeo de clase Cliente',
    },
    {
      id: 'tbl-pedido',
      name: 'pedido',
      displayName: 'Pedido',
      sourceClassId: 'cls-1',
      sourceClassName: 'Pedido',
      isJunctionTable: false,
      columns: [
        { id: 'c3', name: 'id', sqlType: 'BIGSERIAL', isPrimaryKey: true, isForeignKey: false, isNullable: false },
        { id: 'c4', name: 'total', sqlType: 'NUMERIC(12,2)', isPrimaryKey: false, isForeignKey: false, isNullable: false },
        {
          id: 'c5',
          name: 'cliente_id',
          sqlType: 'BIGINT',
          isPrimaryKey: false,
          isForeignKey: true,
          isNullable: false,
          foreignKeyTarget: { tableName: 'cliente', columnName: 'id', onDelete: 'RESTRICT' },
        },
      ],
      foreignKeys: [
        {
          name: 'fk_pedido_cliente',
          columnName: 'cliente_id',
          targetTable: 'cliente',
          targetColumn: 'id',
          onDelete: 'RESTRICT',
          relationshipType: 'ASSOCIATION',
        },
      ],
      indices: [
        {
          name: 'idx_pedido_cliente_id',
          tableName: 'pedido',
          columns: ['cliente_id'],
          isUnique: false,
          reason: 'Índice B-tree para acelerar JOINs.',
        },
      ],
      description: 'Mapeo de clase Pedido',
    },
  ],
  normalization: {
    is1FN: true,
    is2FN: true,
    is3FN: true,
    enForma3FN: true,
    violations: [],
    strengths: [
      'Claves primarias subrogadas homogéneas (BIGSERIAL).',
      'Claves foráneas con índices B-Tree.',
    ],
  },
  recommendations: [
    {
      type: 'INDEX',
      tableName: 'pedido',
      title: 'Índice B-tree en clave foránea cliente_id',
      rationale: 'Acelera JOINs frecuentes entre pedido y cliente.',
      sqlSnippet: 'CREATE INDEX idx_pedido_cliente_id ON pedido(cliente_id);',
    },
  ],
  mermaidErDiagram: 'erDiagram\n  CLIENTE ||--o{ PEDIDO : "tiene"\n',
  generatedAt: new Date().toISOString(),
};

describe('CU-11: DataModelModal', () => {
  it('no renderiza nada cuando isOpen es false', () => {
    const { container } = render(
      <DataModelModal isOpen={false} onClose={vi.fn()} ast={mockAst} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza título, selector de estrategias y tabs al abrirse', async () => {
    vi.mocked(dataModelApi.generarDesdeAst).mockResolvedValue(mockResult);

    render(<DataModelModal isOpen={true} onClose={vi.fn()} ast={mockAst} />);

    expect(screen.getByText(/Modelo de Datos Relacional/i)).toBeInTheDocument();
    expect(screen.getByText(/Reglas de Tom · 3FN/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Diagrama ER/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Tablas y Esquema/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Auditoría 3FN/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Recomendaciones DBA/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(dataModelApi.generarDesdeAst).toHaveBeenCalledWith(mockAst, {
        inheritanceStrategy: 'TPS',
      });
    });
  });

  it('permite cambiar a la pestaña "Tablas y Esquema" y muestra las columnas e índices', async () => {
    vi.mocked(dataModelApi.generarDesdeAst).mockResolvedValue(mockResult);

    render(<DataModelModal isOpen={true} onClose={vi.fn()} ast={mockAst} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Tablas y Esquema/i })).toBeInTheDocument();
    });

    const tablesTab = screen.getByRole('tab', { name: /Tablas y Esquema/i });
    fireEvent.click(tablesTab);

    expect(screen.getByText('cliente')).toBeInTheDocument();
    expect(screen.getByText('pedido')).toBeInTheDocument();
    expect(screen.getAllByText('BIGSERIAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('cliente_id')).toBeInTheDocument();
  });

  it('permite cambiar a la pestaña "Auditoría 3FN" y muestra la certificación y checklist', async () => {
    vi.mocked(dataModelApi.generarDesdeAst).mockResolvedValue(mockResult);

    render(<DataModelModal isOpen={true} onClose={vi.fn()} ast={mockAst} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Auditoría 3FN/i })).toBeInTheDocument();
    });

    const normTab = screen.getByRole('tab', { name: /Auditoría 3FN/i });
    fireEvent.click(normTab);

    expect(screen.getByText(/Esquema Certificado en Tercera Forma Normal \(3FN\)/i)).toBeInTheDocument();
    expect(screen.getByText('1FN: Atomicidad')).toBeInTheDocument();
    expect(screen.getByText('2FN: Dependencia Total')).toBeInTheDocument();
    expect(screen.getByText('3FN: No Transitividad')).toBeInTheDocument();
    expect(screen.getByText(/Claves primarias subrogadas homogéneas/i)).toBeInTheDocument();
  });

  it('cambia de estrategia a TPH y regenera el modelo', async () => {
    vi.mocked(dataModelApi.generarDesdeAst).mockResolvedValue(mockResult);

    render(<DataModelModal isOpen={true} onClose={vi.fn()} ast={mockAst} />);

    await waitFor(() => {
      expect(dataModelApi.generarDesdeAst).toHaveBeenCalledTimes(1);
    });

    const tphBtn = screen.getByRole('button', { name: /TPH/i });
    fireEvent.click(tphBtn);

    await waitFor(() => {
      expect(dataModelApi.generarDesdeAst).toHaveBeenCalledWith(mockAst, {
        inheritanceStrategy: 'TPH',
      });
    });
  });

  it('llama a onClose al hacer clic en el botón de cerrar', async () => {
    vi.mocked(dataModelApi.generarDesdeAst).mockResolvedValue(mockResult);
    const handleClose = vi.fn();

    render(<DataModelModal isOpen={true} onClose={handleClose} ast={mockAst} />);

    const closeBtn = screen.getByLabelText(/Cerrar modal/i);
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});
