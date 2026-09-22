import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileAppModal from './MobileAppModal';
import { mobileAppApi } from '../../services/mobileAppApi';
import type { MobileAppResult } from '../../types/mobile';
import type { UMLDiagramAST } from '../../types/uml';

vi.mock('../../services/mobileAppApi', () => ({ mobileAppApi: {
  generateDirect: vi.fn(), generateSession: vi.fn(), downloadZip: vi.fn(), downloadZipDirect: vi.fn(), getQr: vi.fn(),
} }));

const ast: UMLDiagramAST = { version: 1, nombre: 'Clínica', classes: [{ id: 'p', name: 'Paciente', isAbstract: false,
  isInterface: false, position: { x: 0, y: 0 }, methods: [], attributes: [{ id: 'n', name: 'nombre', type: 'String', visibility: '+' }] }], relationships: [] };
const result: MobileAppResult = {
  appId: 'demo-id', config: { name: 'Clínica', shortName: 'Clínica', backgroundColor: '#0b0e14', themeColor: '#3b82f6',
    version: '1.0.0', backendBaseUrl: '', entities: [{ name: 'Paciente', route: 'pacientes', fields: [
      { name: 'nombre', label: 'Nombre', umlType: 'String', inputType: 'text', required: true },
    ] }] },
  files: [{ path: 'manifest.webmanifest', content: '{"display":"standalone"}', mimeType: 'application/json' },
    { path: 'app.js', content: 'renderList();', mimeType: 'text/javascript' }],
  summary: { entitiesCount: 1, filesCount: 2 },
  access: { appId: 'demo-id', url: 'http://192.168.1.41:4000/m/demo-id', secureContext: false,
    note: 'Para instalar, se necesita HTTPS confiable.' },
};

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe('MobileAppModal (CU-15/CU-16)', () => {
  it('genera la app y muestra un simulador CRUD interactivo', async () => {
    vi.mocked(mobileAppApi.generateDirect).mockResolvedValue(result);
    render(<MobileAppModal isOpen onClose={vi.fn()} ast={ast} />);
    expect(await screen.findByRole('heading', { name: /App móvil PWA/ })).toBeInTheDocument();
    const phone = screen.getByLabelText('Simulador móvil');
    fireEvent.click(within(phone).getByRole('button', { name: /Nuevo Paciente/ }));
    fireEvent.change(within(phone).getByLabelText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.click(within(phone).getByRole('button', { name: 'Guardar' }));
    expect(within(phone).getByText('Ana')).toBeInTheDocument();
  });

  it('interpreta texto sin red y conserva cambios pendientes en Modo Avión', async () => {
    vi.mocked(mobileAppApi.generateDirect).mockResolvedValue(result);
    render(<MobileAppModal isOpen onClose={vi.fn()} ast={ast} />);
    const phone = await screen.findByLabelText('Simulador móvil');
    fireEvent.click(within(phone).getByRole('button', { name: /Modo Avión/ }));
    fireEvent.click(within(phone).getByRole('button', { name: /Abrir asistente/ }));
    fireEvent.change(within(phone).getByLabelText('Escribe una orden'), { target: { value: 'Registra un nuevo paciente con nombre Ana' } });
    fireEvent.click(within(phone).getByRole('button', { name: 'Enviar orden' }));
    expect(within(phone).getByText(/1 cambio pendiente/)).toBeInTheDocument();
    expect(within(phone).getByText(/guardado en este dispositivo/i)).toBeInTheDocument();
  });

  it('muestra un QR local real y advierte cuando HTTP LAN impide instalar la PWA', async () => {
    vi.mocked(mobileAppApi.generateSession).mockResolvedValue(result);
    vi.mocked(mobileAppApi.getQr).mockResolvedValue(result.access);
    render(<MobileAppModal isOpen onClose={vi.fn()} ast={ast} sessionId="s-1" />);
    fireEvent.click(screen.getByRole('tab', { name: /Código QR/ }));
    await waitFor(() => expect(screen.getByRole('img', { name: /Código QR/ })).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/)));
    expect(screen.getByText('http://192.168.1.41:4000/m/demo-id')).toBeInTheDocument();
    expect(screen.getAllByText(/HTTPS confiable/).length).toBeGreaterThan(0);
  });

  it('inspecciona código, descarga ZIP y cierra con Escape', async () => {
    vi.mocked(mobileAppApi.generateSession).mockResolvedValue(result);
    vi.mocked(mobileAppApi.getQr).mockResolvedValue(result.access);
    const onClose = vi.fn();
    render(<MobileAppModal isOpen onClose={onClose} ast={ast} sessionId="s-1" />);
    fireEvent.click(screen.getByRole('tab', { name: /Código fuente/ }));
    expect((await screen.findAllByText('manifest.webmanifest')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Descargar App Móvil/ }));
    expect(mobileAppApi.downloadZip).toHaveBeenCalledWith('s-1');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
