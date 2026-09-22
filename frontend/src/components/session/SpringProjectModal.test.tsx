import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SpringProjectModal from './SpringProjectModal';
import { springApi } from '../../services/springApi';
import type { SpringProjectResult } from '../../types/spring';
import type { UMLDiagramAST } from '../../types/uml';

vi.mock('../../services/springApi', () => ({
  springApi: {
    generarDesdeAst: vi.fn(), generarDesdeSesion: vi.fn(), descargarZip: vi.fn(), descargarZipDirecto: vi.fn(),
    descargarPostman: vi.fn(), iniciarRunner: vi.fn(), detenerRunner: vi.fn(),
    obtenerEstado: vi.fn(), conectarLogs: vi.fn(() => () => undefined),
  },
}));

const ast: UMLDiagramAST = {
  version: 1, classes: [{ id: '1', name: 'Paciente', isAbstract: false, isInterface: false,
    position: { x: 0, y: 0 }, methods: [], attributes: [{ id: 'a', name: 'nombre', type: 'String', visibility: '+' }] }], relationships: [],
};

const result: SpringProjectResult = {
  files: [
    { path: 'src/main/java/com/generated/app/entity/Paciente.java', name: 'Paciente.java', content: 'public class Paciente {}', category: 'entity' },
    { path: 'pom.xml', name: 'pom.xml', content: '<project />', category: 'config' },
  ],
  summary: { entitiesCount: 1, endpointsCount: 5, filesCount: 2 },
  postmanCollection: {
    info: { name: 'API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [{ key: 'baseUrl', value: 'http://localhost:8080/api/v1' }],
    item: [{ name: 'Paciente', item: [{ name: 'Crear Paciente', request: { method: 'POST', body: { raw: '{"nombre":"Ana"}' }, url: { raw: '{{baseUrl}}/pacientes' } } }] }],
  },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SpringProjectModal (CU-13/CU-14)', () => {
  it('genera y presenta el árbol de código de cuatro capas', async () => {
    vi.mocked(springApi.generarDesdeAst).mockResolvedValue(result);
    render(<SpringProjectModal isOpen onClose={vi.fn()} ast={ast} />);
    expect(screen.getByRole('heading', { name: /Backend Spring Boot 3/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Paciente.java')).toBeInTheDocument());
    expect(screen.getByText(/public class Paciente/)).toBeInTheDocument();
    expect(springApi.generarDesdeAst).toHaveBeenCalledWith(ast);
  });

  it('muestra la colección Postman y sus métodos HTTP', async () => {
    vi.mocked(springApi.generarDesdeAst).mockResolvedValue(result);
    render(<SpringProjectModal isOpen onClose={vi.fn()} ast={ast} />);
    fireEvent.click(screen.getByRole('tab', { name: /Colección Postman/ }));
    await waitFor(() => expect(screen.getByText('Crear Paciente')).toBeInTheDocument());
    expect(screen.getAllByText('POST')[0]).toHaveClass('spring-http-post');
    expect(screen.getByText(/"nombre":"Ana"/)).toBeInTheDocument();
  });

  it('inicia el runner y refleja URL y logs en vivo', async () => {
    vi.mocked(springApi.generarDesdeSesion).mockResolvedValue(result);
    vi.mocked(springApi.obtenerEstado).mockResolvedValue({ sesionId: 'sesion-1', status: 'IDLE', port: null, baseUrl: null, pid: null, startedAt: null, error: null, logs: [] });
    vi.mocked(springApi.iniciarRunner).mockResolvedValue({ sesionId: 'sesion-1', status: 'RUNNING', port: 8081, baseUrl: 'http://localhost:8081/api/v1', pid: 42, startedAt: '2026-09-22T00:00:00Z', error: null, logs: ['Started BackendGeneradoApplication'] });
    render(<SpringProjectModal isOpen onClose={vi.fn()} ast={ast} sessionId="sesion-1" />);
    fireEvent.click(screen.getByRole('tab', { name: /Runner en vivo/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar servidor/ }));
    await waitFor(() => expect(screen.getByText('http://localhost:8081/api/v1')).toBeInTheDocument());
    expect(screen.getByText(/Started BackendGeneradoApplication/)).toBeInTheDocument();
  });

  it('cierra con Escape y ofrece descargas del ZIP y Postman', async () => {
    vi.mocked(springApi.generarDesdeSesion).mockResolvedValue(result);
    vi.mocked(springApi.obtenerEstado).mockResolvedValue({ sesionId: 's', status: 'IDLE', port: null, baseUrl: null, pid: null, startedAt: null, error: null, logs: [] });
    const onClose = vi.fn();
    render(<SpringProjectModal isOpen onClose={onClose} ast={ast} sessionId="s" />);
    const zipButton = await screen.findByRole('button', { name: /Descargar Proyecto/ });
    await waitFor(() => expect(zipButton).not.toBeDisabled());
    fireEvent.click(zipButton);
    fireEvent.click(screen.getByRole('tab', { name: /Colección Postman/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Descargar Colección Postman/ }));
    expect(springApi.descargarZip).toHaveBeenCalledWith('s');
    expect(springApi.descargarPostman).toHaveBeenCalledWith('s');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('descarga un ZIP real también en el modo demo sin sesión', async () => {
    vi.mocked(springApi.generarDesdeAst).mockResolvedValue(result);
    render(<SpringProjectModal isOpen onClose={vi.fn()} ast={ast} />);
    const zipButton = await screen.findByRole('button', { name: /Descargar Proyecto/ });
    await waitFor(() => expect(zipButton).not.toBeDisabled());
    fireEvent.click(zipButton);
    await waitFor(() => expect(springApi.descargarZipDirecto).toHaveBeenCalledWith(ast));
  });
});
