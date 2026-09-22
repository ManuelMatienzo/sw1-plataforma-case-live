import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ImportXmiModal from './ImportXmiModal';
import { inspectXmiFile, xmiApi } from '../../services/xmiService';

vi.mock('../../services/xmiService', () => ({
  inspectXmiFile: vi.fn(),
  xmiApi: { importar: vi.fn() },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('muestra la vista previa, prefiere fusionar y confirma la importación', async () => {
  vi.mocked(inspectXmiFile).mockResolvedValue({
    content: '<xmi:XMI/>', fileName: 'modelo-clinica.xmi', size: 2048,
    summary: { classes: 2, interfaces: 1, attributes: 4, methods: 2, relationships: 1 },
  });
  const result = {
    diagram: { version: 8, classes: [], relationships: [] }, warnings: [],
    summary: { classes: 2, interfaces: 1, attributes: 4, methods: 2, relationships: 1 },
    validationReport: { isValid: true, criticalErrorsCount: 0, warningsCount: 0, diagnostics: [], validatedAt: new Date().toISOString() },
  };
  vi.mocked(xmiApi.importar).mockResolvedValue(result);
  const onImported = vi.fn();
  render(<ImportXmiModal sessionId="session-1" expectedVersion={7} hasExistingDiagram onImported={onImported} onClose={vi.fn()} />);

  const file = new File(['<xmi:XMI/>'], 'modelo-clinica.xmi', { type: 'application/xml' });
  fireEvent.change(screen.getByLabelText('Seleccionar archivo XMI'), { target: { files: [file] } });

  expect(await screen.findByText('modelo-clinica.xmi')).toBeInTheDocument();
  expect(screen.getByText('2 clases')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /fusionar/i })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Importar modelo' }));

  await waitFor(() => expect(xmiApi.importar).toHaveBeenCalledWith('session-1', {
    content: '<xmi:XMI/>', strategy: 'merge', expectedVersion: 7,
  }));
  expect(onImported).toHaveBeenCalledWith(result);
});

it('explica que reemplazar descarta el modelo actual y conserva el foco dentro del diálogo', async () => {
  vi.mocked(inspectXmiFile).mockResolvedValue({
    content: '<xmi:XMI/>', fileName: 'nuevo.xmi', size: 1024,
    summary: { classes: 1, interfaces: 0, attributes: 0, methods: 0, relationships: 0 },
  });
  render(<ImportXmiModal sessionId="session-1" expectedVersion={3} hasExistingDiagram onImported={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Seleccionar archivo XMI'), { target: { files: [new File(['x'], 'nuevo.xmi')] } });
  await screen.findByText('nuevo.xmi');
  fireEvent.click(screen.getByRole('radio', { name: /reemplazar/i }));
  expect(screen.getAllByText(/sustituirá las clases y relaciones actuales/i)).toHaveLength(2);
  expect(screen.getByRole('dialog', { name: 'Importar modelo XMI' })).toContainElement(document.activeElement as HTMLElement);
});
