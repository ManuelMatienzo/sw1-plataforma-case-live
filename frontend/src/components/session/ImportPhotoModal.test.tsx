import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ImportPhotoModal from './ImportPhotoModal';
import { aiApi } from '../../services/aiApi';
import { PhotoImportResult } from '../../types/ai';

vi.mock('../../services/aiApi', () => ({
  aiApi: {
    importarDiagramaFoto: vi.fn(),
  },
}));

// Mock URL.createObjectURL / revokeObjectURL for JSDOM
global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-img-preview');
global.URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockImportResult: PhotoImportResult = {
  diagram: {
    version: 1,
    nombre: 'Modelo Digitalizado desde Foto',
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
        position: { x: 60, y: 80 },
      },
      {
        id: 'cls-2',
        name: 'Medico',
        isAbstract: false,
        isInterface: false,
        attributes: [
          { id: 'a3', name: 'id', type: 'Integer', visibility: '+', isPrimaryKey: true },
        ],
        methods: [],
        position: { x: 400, y: 80 },
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
  },
  summary: {
    classes: 2,
    interfaces: 0,
    attributes: 3,
    methods: 0,
    relationships: 1,
  },
  warnings: ['Trazo manuscrito ligeramente borroso en multiplicidad 0..*'],
  validationReport: {
    isValid: true,
    criticalErrorsCount: 0,
    warningsCount: 0,
    diagnostics: [],
    validatedAt: new Date().toISOString(),
  },
  source: 'gemini_vision',
};

it('renderiza la zona de carga y permite seleccionar una foto', async () => {
  render(<ImportPhotoModal hasExistingDiagram={false} onImported={vi.fn()} onClose={vi.fn()} />);

  expect(screen.getByText('Importar Diagrama Desde Foto (IA)')).toBeInTheDocument();
  expect(screen.getByText(/Haz clic o arrastra tu fotografía aquí/i)).toBeInTheDocument();

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['fake-png-bytes'], 'pizarra-hospital.png', { type: 'image/png' });
  fireEvent.change(fileInput, { target: { files: [file] } });

  expect(await screen.findByText('pizarra-hospital.png')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Digitalizar con IA/i })).toBeInTheDocument();
});

it('digitaliza con IA, muestra el resumen de clases/relaciones y confirma importación', async () => {
  vi.mocked(aiApi.importarDiagramaFoto).mockResolvedValue(mockImportResult);

  const onImported = vi.fn();
  render(<ImportPhotoModal hasExistingDiagram={true} onImported={onImported} onClose={vi.fn()} />);

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['fake-png-bytes'], 'pizarra-hospital.png', { type: 'image/png' });
  fireEvent.change(fileInput, { target: { files: [file] } });

  const scanButton = await screen.findByRole('button', { name: /Digitalizar con IA/i });
  fireEvent.click(scanButton);

  await waitFor(() => {
    expect(aiApi.importarDiagramaFoto).toHaveBeenCalledWith(file, expect.anything());
  });

  expect(await screen.findByText('Estructura UML Reconocida')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument(); // 2 clases
  expect(screen.getByText(/Modelo conforme con la especificación UML 2.5 OMG/i)).toBeInTheDocument();
  expect(screen.getByText(/Trazo manuscrito ligeramente borroso/i)).toBeInTheDocument();

  // Por defecto hasExistingDiagram es true -> estrategia merge seleccionada
  const mergeRadio = screen.getByRole('radio', { name: /Fusionar con el diagrama actual/i });
  expect(mergeRadio).toBeChecked();

  const applyButton = screen.getByRole('button', { name: /Aplicar al Lienzo/i });
  fireEvent.click(applyButton);

  expect(onImported).toHaveBeenCalledWith(mockImportResult, 'merge');
});

it('permite cambiar a la estrategia de reemplazo y confirma la acción', async () => {
  vi.mocked(aiApi.importarDiagramaFoto).mockResolvedValue(mockImportResult);

  const onImported = vi.fn();
  render(<ImportPhotoModal hasExistingDiagram={true} onImported={onImported} onClose={vi.fn()} />);

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [new File(['fake-bytes'], 'boceto.jpg', { type: 'image/jpeg' })] } });

  const scanButton = await screen.findByRole('button', { name: /Digitalizar con IA/i });
  fireEvent.click(scanButton);

  await screen.findByText('Estructura UML Reconocida');

  const replaceRadio = screen.getByRole('radio', { name: /Reemplazar diagrama actual/i });
  fireEvent.click(replaceRadio);
  expect(replaceRadio).toBeChecked();

  const applyButton = screen.getByRole('button', { name: /Aplicar al Lienzo/i });
  fireEvent.click(applyButton);

  expect(onImported).toHaveBeenCalledWith(mockImportResult, 'replace');
});

it('muestra un error si el formato del archivo no es soportado', async () => {
  render(<ImportPhotoModal hasExistingDiagram={false} onImported={vi.fn()} onClose={vi.fn()} />);

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const invalidFile = new File(['text-bytes'], 'documento.pdf', { type: 'application/pdf' });
  fireEvent.change(fileInput, { target: { files: [invalidFile] } });

  expect(await screen.findByText(/Formato no soportado/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Digitalizar con IA/i })).not.toBeInTheDocument();
});

it('llama a onClose al hacer clic en cancelar o botón cerrar', async () => {
  const onClose = vi.fn();
  render(<ImportPhotoModal hasExistingDiagram={false} onImported={vi.fn()} onClose={onClose} />);

  const closeButton = screen.getByLabelText('Cerrar modal');
  fireEvent.click(closeButton);

  expect(onClose).toHaveBeenCalledTimes(1);
});
