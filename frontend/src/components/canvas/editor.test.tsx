import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkspaceDemoPage from '../../pages/WorkspaceDemoPage';
import { sesionesApi } from '../../services/api';
import { downloadBlob, xmiApi } from '../../services/xmiService';
import { classSize, relationshipPoints, endpointLabel } from './geometry';

const live = vi.hoisted(() => ({
  options: null as null | Record<string, (...args: never[]) => void>,
  client: { connect: vi.fn(), disconnect: vi.fn(), emitOperation: vi.fn(), moveCursor: vi.fn(), sendChatMessage: vi.fn(), clearChat: vi.fn(), setParticipantPermission: vi.fn(), kickParticipant: vi.fn() },
}));
vi.mock('./UMLCanvas', () => ({ default: ({ onCursorMove }: { onCursorMove?: (x: number, y: number) => void }) => <div aria-label="Lienzo UML"><button aria-label="Mover cursor de prueba" onMouseMove={() => onCursorMove?.(80, 90)} /></div> }));
vi.mock('../session/ManageParticipantsModal', () => ({ default: ({ onClose }: { onClose(): void }) => <div role="dialog" aria-label="Colaboradores de la sesión"><button onClick={onClose}>Cerrar modal de prueba</button></div> }));
vi.mock('../session/ImportXmiModal', () => ({ default: ({ onImported, onClose }: { onImported(result: unknown): void; onClose(): void }) => <div role="dialog" aria-label="Importar modelo XMI"><button onClick={() => onImported({ diagram: { version: 8, classes: [{ id: 'imported', name: 'Importada', isAbstract: false, isInterface: false, position: { x: 48, y: 48 }, attributes: [], methods: [] }], relationships: [] }, warnings: [], summary: { classes: 1, interfaces: 0, attributes: 0, methods: 0, relationships: 0 }, validationReport: { isValid: true, criticalErrorsCount: 0, warningsCount: 1, diagnostics: [], validatedAt: new Date().toISOString() } })}>Confirmar importación de prueba</button><button onClick={onClose}>Cerrar XMI</button></div> }));
vi.mock('../session/MobileAppModal', () => ({ default: ({ onClose }: { onClose(): void }) => <div role="dialog" aria-label="App móvil generada"><button onClick={onClose}>Cerrar app móvil</button></div> }));
vi.mock('../../services/api', () => ({ sesionesApi: { getDiagrama: vi.fn(), saveDiagrama: vi.fn() }, getApiErrorMessage: (_e: unknown, fallback: string) => fallback }));
vi.mock('../../services/chatApi', () => ({ chatApi: { getHistorial: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/umlSocketClient', () => ({ createUmlSocketClient: (options: Record<string, (...args: never[]) => void>) => { live.options = options; return live.client; } }));
vi.mock('../../services/xmiService', () => ({ xmiApi: { exportar: vi.fn() }, downloadBlob: vi.fn() }));
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); live.options = null; Object.values(live.client).forEach(mock => mock.mockClear()); });
const data = { diagram: { version: 1, classes: [], relationships: [] }, canEdit: true, proyectoNombre: 'Hospital', sesionNombre: 'Modelo' };
const open = () => render(<MemoryRouter initialEntries={['/sesion/abc']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/sesion/:sesionId" element={<WorkspaceDemoPage />} /><Route path="/dashboard" element={<div>Dashboard después de la sesión</div>} /></Routes></MemoryRouter>);
it('abre la generación móvil desde la barra y desde el menú Modelo', async () => {
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  open(); await screen.findByText('Hospital');
  fireEvent.click(screen.getByRole('button', { name: /Generar app móvil PWA/ }));
  expect(await screen.findByRole('dialog', { name: 'App móvil generada' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar app móvil' }));
  fireEvent.click(screen.getByRole('button', { name: 'Menú de modelo y archivos' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Generar App Móvil/ }));
  expect(await screen.findByRole('dialog', { name: 'App móvil generada' })).toBeInTheDocument();
});
it('carga una sesión, crea una clase y guarda el AST editado', async () => {
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  vi.mocked(sesionesApi.saveDiagrama).mockImplementation(async (_id, ast) => ({ ...data, diagram: { ...ast, version: 2 } }));
  open();
  await screen.findByText('Hospital');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Clase' }));
  fireEvent.change(screen.getByLabelText('Nombre de clase'), { target: { value: 'Paciente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Añadir atributo' }));
  expect(screen.getByLabelText('Nombre de atributo 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar diagrama' }));
  await screen.findByText('Guardado · v2');
  expect(screen.getByLabelText('Nombre de clase')).toHaveValue('Paciente');
});
it('solo lectura permite inspeccionar pero no crear ni guardar', async () => {
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue({ ...data, canEdit: false });
  open(); await screen.findByText('Solo lectura');
  expect(screen.getByRole('button', { name: 'Nueva Clase' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Guardar diagrama' })).toBeDisabled();
});
it('un error de carga ofrece reintento sin habilitar un lienzo vacío editable', async () => {
  vi.mocked(sesionesApi.getDiagrama).mockRejectedValue(new Error('offline'));
  open(); await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Nueva clase' })).not.toBeInTheDocument();
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nueva Clase' })).toBeEnabled());
});
it('conecta relaciones en los bordes y representa autorrelaciones fuera de la clase', () => {
  const a = { id: 'a', name: 'A', isAbstract: false, isInterface: false, position: { x: 0, y: 0 }, attributes: [], methods: [] };
  const b = { ...a, id: 'b', position: { x: 600, y: 0 } };
  const points = relationshipPoints(a, b);
  expect(points[0]).toBe(classSize(a).width);
  expect(points[points.length - 2]).toBe(600);
  expect(relationshipPoints(a, a).length).toBeGreaterThan(4);
});
it('ofrece restaurar cambios locales después de salir con navegación interna', async () => {
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  const first = open(); await screen.findByText('Hospital');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Clase' }));
  fireEvent.change(screen.getByLabelText('Nombre de clase'), { target: { value: 'BorradorPaciente' } });
  first.unmount();
  open(); await screen.findByText('Hospital');
  fireEvent.click(await screen.findByRole('button', { name: 'Restaurar borrador' }));
  expect(screen.getByRole('button', { name: 'Seleccionar BorradorPaciente' })).toBeInTheDocument();
  expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
});
it('coloca etiquetas fuera del nodo también en relaciones inversas y verticales', () => {
  const left = endpointLabel(600, 80, 300, 80);
  expect(left.x + left.width).toBeLessThan(600);
  const up = endpointLabel(300, 300, 300, 80);
  expect(up.y + 32).toBeLessThan(300);
  const down = endpointLabel(300, 100, 300, 300);
  expect(down.y).toBeGreaterThan(100);
});
it('ubica la etiqueta según el borde real del nodo en conexiones diagonales', () => {
  const source = { id: 'a', name: 'A', isAbstract: false, isInterface: false, position: { x: 0, y: 0 }, attributes: [], methods: [] };
  const target = { ...source, id: 'b', position: { x: 400, y: 320 } };
  const points = relationshipPoints(source, target);
  const label = endpointLabel(points[0], points[1], points[2], points[3], source);
  expect(label.y).toBeGreaterThan(classSize(source).height);
});
it('conecta la sesión en vivo, publica deltas y presenta colaboradores remotos', async () => {
  localStorage.setItem('case.auth.v1', JSON.stringify({ version: 1, token: 'jwt', user: { id: 'me', nombre: 'Yo', email: 'yo@example.com', rol: 'ANFITRION', activo: true } }));
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  const page = open();
  await screen.findByText('Hospital');
  expect(live.client.connect).toHaveBeenCalledOnce();
  act(() => live.options?.onStatus?.('online' as never));
  act(() => live.options?.onPresence?.([
    { socketId: 'self', userId: 'me', name: 'Yo', color: '#9DB0FF', role: 'ANFITRION', permission: 'EDICION_COMPLETA', canEdit: true },
    { socketId: 'remote', userId: 'ana', name: 'Ana', color: '#22D3A0', role: 'COLABORADOR', permission: 'EDICION_COMPLETA', canEdit: true },
  ] as never, 'self' as never));
  expect(screen.getByRole('group', { name: 'Participantes en línea' })).toHaveTextContent('Ana');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Clase' }));
  expect(live.client.emitOperation).toHaveBeenCalledWith(expect.objectContaining({ type: 'class:add' }));
  fireEvent.mouseMove(screen.getByRole('button', { name: 'Mover cursor de prueba' }));
  expect(live.client.moveCursor).toHaveBeenCalledWith(80, 90);
  act(() => live.options?.onOperation?.({
    type: 'class:add', payload: { class: { id: 'remote-class', name: 'Historia', isAbstract: false, isInterface: false, attributes: [], methods: [], position: { x: 300, y: 100 } } }, operationId: 'remote-op',
    actor: { userId: 'ana', name: 'Ana', color: '#22D3A0' }, serverSequence: 1, timestamp: new Date().toISOString(),
  } as never));
  expect(screen.getByRole('button', { name: 'Seleccionar Historia' })).toBeInTheDocument();
  page.unmount();
  expect(live.client.disconnect).toHaveBeenCalledOnce();
});

it('permite al anfitrión abrir la administración de colaboradores', async () => {
  localStorage.setItem('case.auth.v1', JSON.stringify({ version: 1, token: 'jwt', user: { id: 'host', nombre: 'Elena', email: 'elena@example.com', rol: 'ANFITRION', activo: true } }));
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  open();
  await screen.findByText('Hospital');
  act(() => live.options?.onPresence?.([
    { socketId: 'self', userId: 'host', name: 'Elena', color: '#22D3A0', role: 'ANFITRION', permission: 'EDICION_COMPLETA', canEdit: true },
  ] as never, 'self' as never));

  fireEvent.click(screen.getByRole('button', { name: 'Administrar colaboradores' }));

  expect(await screen.findByRole('dialog', { name: 'Colaboradores de la sesión' })).toBeInTheDocument();
});

it('ofrece al anfitrión importar y exportar XMI y aplica el reemplazo validado', async () => {
  localStorage.setItem('case.auth.v1', JSON.stringify({ version: 1, token: 'jwt', user: { id: 'host', nombre: 'Elena', email: 'elena@example.com', rol: 'ANFITRION', activo: true } }));
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  vi.mocked(xmiApi.exportar).mockResolvedValue({ blob: new Blob(['xmi']), filename: 'hospital.xmi' });
  open();
  await screen.findByText('Hospital');
  act(() => live.options?.onPresence?.([
    { socketId: 'self', userId: 'host', name: 'Elena', color: '#22D3A0', role: 'ANFITRION', permission: 'EDICION_COMPLETA', canEdit: true },
  ] as never, 'self' as never));

  fireEvent.click(screen.getByRole('button', { name: /modelo/i }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Importar modelo XMI' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar importación de prueba' }));
  expect(screen.getByRole('button', { name: 'Seleccionar Importada' })).toBeInTheDocument();
  expect(screen.getByText(/modelo XMI importado/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /modelo/i }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Exportar modelo XMI' }));
  await waitFor(() => expect(xmiApi.exportar).toHaveBeenCalledWith('abc'));
  expect(downloadBlob).toHaveBeenCalledWith(expect.objectContaining({ filename: 'hospital.xmi' }));
});

it('aplica permisos recibidos en vivo y redirige al colaborador expulsado', async () => {
  localStorage.setItem('case.auth.v1', JSON.stringify({ version: 1, token: 'jwt', user: { id: 'me', nombre: 'Rafael', email: 'rafael@example.com', rol: 'COLABORADOR', activo: true } }));
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue(data);
  open();
  await screen.findByText('Hospital');

  act(() => live.options?.onPermissionUpdated?.({ userId: 'me', permission: 'SOLO_LECTURA', canEdit: false } as never));
  expect(screen.getByText('Ahora tienes permiso de solo lectura.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Guardar diagrama' })).toBeDisabled();

  act(() => live.options?.onKicked?.({ message: 'Has sido removido de la sesión por el anfitrión.' } as never));
  expect(screen.getByText('Dashboard después de la sesión')).toBeInTheDocument();
});

it('habilita la edición cuando un colaborador de solo lectura es promovido en vivo', async () => {
  localStorage.setItem('case.auth.v1', JSON.stringify({ version: 1, token: 'jwt', user: { id: 'me', nombre: 'Rafael', email: 'rafael@example.com', rol: 'COLABORADOR', activo: true } }));
  vi.mocked(sesionesApi.getDiagrama).mockResolvedValue({ ...data, canEdit: false });
  open();
  await screen.findByText('Solo lectura');

  act(() => live.options?.onPermissionUpdated?.({ userId: 'me', permission: 'EDICION_COMPLETA', canEdit: true } as never));

  expect(screen.getByText('Ahora puedes editar el diagrama.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nueva Clase' })).toBeEnabled();
});
