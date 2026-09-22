import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostgresDdlModal from './PostgresDdlModal';
import { ddlApi } from '../../services/ddlApi';
import { PostgresDdlResult } from '../../types/ddl';
import { UMLDiagramAST } from '../../types/uml';

vi.mock('../../services/ddlApi', () => ({
  ddlApi: {
    generarDesdeAst: vi.fn(),
    generarDesdeSesion: vi.fn(),
    descargarDesdeSesion: vi.fn(),
    descargarTextoSql: vi.fn(),
  },
}));

// Mock URL.createObjectURL / revokeObjectURL for JSDOM
global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-ddl');
global.URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockAst: UMLDiagramAST = {
  version: 1,
  nombre: 'Prueba DDL',
  classes: [
    {
      id: 'cls-1',
      name: 'Paciente',
      isAbstract: false,
      isInterface: false,
      attributes: [
        { id: 'a1', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        { id: 'a2', name: 'nombre', type: 'String', visibility: '+' },
      ],
      methods: [],
      position: { x: 100, y: 100 },
    },
  ],
  relationships: [],
};

const mockDdlResult: PostgresDdlResult = {
  sql: `DROP TABLE IF EXISTS pacientes CASCADE;
CREATE TABLE IF NOT EXISTS pacientes (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL
);`,
  tablesCount: 1,
  relationshipsCount: 0,
  indicesCount: 0,
  generatedAt: '2026-09-22T17:00:00.000Z',
  options: {
    inheritanceStrategy: 'TPS',
    pluralize: true,
    includeDropTable: true,
    ifNotExists: true,
    includeComments: true,
  },
  filename: 'prueba_ddl_schema.sql',
};

describe('PostgresDdlModal Component (CU-12)', () => {
  it('no renderiza nada cuando isOpen es false', () => {
    render(
      <PostgresDdlModal
        isOpen={false}
        onClose={vi.fn()}
        ast={mockAst}
      />
    );
    expect(screen.queryByText('Script DDL PostgreSQL 15+')).toBeNull();
  });

  it('renderiza cabecera, opciones y carga el script SQL correctamente', async () => {
    vi.mocked(ddlApi.generarDesdeAst).mockResolvedValue(mockDdlResult);

    render(
      <PostgresDdlModal
        isOpen={true}
        onClose={vi.fn()}
        ast={mockAst}
      />
    );

    expect(screen.getByText('Script DDL PostgreSQL 15+')).toBeDefined();
    expect(screen.getByText('Idempotente')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('prueba_ddl_schema.sql')).toBeDefined();
      expect(screen.getByText(/DROP TABLE IF EXISTS pacientes CASCADE;/)).toBeDefined();
      expect(screen.getByText('1')).toBeDefined(); // Tablas count
    });

    expect(ddlApi.generarDesdeAst).toHaveBeenCalledWith(
      mockAst,
      expect.objectContaining({
        inheritanceStrategy: 'TPS',
        pluralize: true,
        includeDropTable: true,
      })
    );
  });

  it('permite copiar el script SQL al portapapeles con feedback visual', async () => {
    vi.mocked(ddlApi.generarDesdeAst).mockResolvedValue(mockDdlResult);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <PostgresDdlModal
        isOpen={true}
        onClose={vi.fn()}
        ast={mockAst}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Copiar SQL')).toBeDefined();
    });

    const copyBtn = screen.getByText('Copiar SQL');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(mockDdlResult.sql);
      expect(screen.getByText('¡Copiado!')).toBeDefined();
    });
  });

  it('ejecuta descarga del script schema.sql', async () => {
    vi.mocked(ddlApi.generarDesdeAst).mockResolvedValue(mockDdlResult);

    render(
      <PostgresDdlModal
        isOpen={true}
        onClose={vi.fn()}
        ast={mockAst}
        sessionId="sesion-test-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Descargar schema.sql')).toBeDefined();
    });

    const downloadBtn = screen.getByText('Descargar schema.sql');
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(ddlApi.descargarDesdeSesion).toHaveBeenCalledWith(
        'sesion-test-123',
        expect.objectContaining({
          inheritanceStrategy: 'TPS',
          pluralize: true,
        })
      );
    });
  });

  it('muestra banner de error si la API rechaza la petición', async () => {
    vi.mocked(ddlApi.generarDesdeAst).mockRejectedValue(new Error('Fallo de conexión en backend'));

    render(
      <PostgresDdlModal
        isOpen={true}
        onClose={vi.fn()}
        ast={mockAst}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Fallo de conexión en backend/)).toBeDefined();
    });
  });

  it('llama a onClose al presionar botón Entendido o botón de cerrar', async () => {
    vi.mocked(ddlApi.generarDesdeAst).mockResolvedValue(mockDdlResult);
    const onClose = vi.fn();

    render(
      <PostgresDdlModal
        isOpen={true}
        onClose={onClose}
        ast={mockAst}
      />
    );

    const closeBtn = screen.getByLabelText('Cerrar modal');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const understoodBtn = screen.getByText('Entendido');
    fireEvent.click(understoodBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
