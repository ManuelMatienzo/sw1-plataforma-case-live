import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ManageParticipantsModal from './ManageParticipantsModal';
import { participantsApi } from '../../services/participantsApi';

vi.mock('../../services/participantsApi', () => ({
  participantsApi: {
    listar: vi.fn(),
    actualizarPermiso: vi.fn(),
    remover: vi.fn(),
  },
}));

const details = {
  id: 'session-1', codigoAcceso: 'CASE-7K9Q', nombre: 'Modelo hospitalario', anfitrionId: 'host',
  participantes: [
    { id: 'p-host', permiso: 'EDICION_COMPLETA' as const, usuario: { id: 'host', nombre: 'Elena', email: 'elena@example.com', rol: 'ANFITRION' as const } },
    { id: 'p-rafael', permiso: 'EDICION_COMPLETA' as const, usuario: { id: 'rafael', nombre: 'Rafael', email: 'rafael@example.com', rol: 'COLABORADOR' as const } },
    { id: 'p-ana', permiso: 'SOLO_LECTURA' as const, usuario: { id: 'ana', nombre: 'Ana', email: 'ana@example.com', rol: 'COLABORADOR' as const } },
  ],
};
const presence = [
  { socketId: 's-host', userId: 'host', name: 'Elena', color: '#22D3A0', role: 'ANFITRION' as const, permission: 'EDICION_COMPLETA' as const, canEdit: true },
  { socketId: 's-rafael', userId: 'rafael', name: 'Rafael', color: '#F4C76B', role: 'COLABORADOR' as const, permission: 'EDICION_COMPLETA' as const, canEdit: true },
];

beforeEach(() => {
  vi.mocked(participantsApi.listar).mockResolvedValue(details);
  vi.mocked(participantsApi.actualizarPermiso).mockResolvedValue({ userId: 'rafael', permission: 'SOLO_LECTURA' });
  vi.mocked(participantsApi.remover).mockResolvedValue();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('muestra anfitrión, estados en vivo, copia el código y administra colaboradores', async () => {
  const onClose = vi.fn();
  render(<ManageParticipantsModal sessionId="session-1" presenceUsers={presence} onClose={onClose} />);

  expect(await screen.findByRole('dialog', { name: 'Colaboradores de la sesión' })).toBeInTheDocument();
  expect(screen.getByText('CASE-7K9Q')).toBeInTheDocument();
  expect(screen.getByText('Anfitrión')).toBeInTheDocument();
  expect(screen.getAllByText('En línea')).toHaveLength(2);
  expect(screen.getByText('Desconectado')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Copiar código de acceso' }));
  await screen.findByText('Código copiado');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CASE-7K9Q');

  fireEvent.change(screen.getByRole('combobox', { name: 'Permiso de Rafael' }), { target: { value: 'SOLO_LECTURA' } });
  await waitFor(() => expect(participantsApi.actualizarPermiso).toHaveBeenCalledWith('session-1', 'rafael', 'SOLO_LECTURA'));

  const removeAna = screen.getByRole('button', { name: 'Remover a Ana' });
  removeAna.focus();
  fireEvent.click(removeAna);
  expect(screen.getByRole('dialog', { name: 'Remover a Ana' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('button', { name: 'Remover a Ana' })).toHaveFocus();

  fireEvent.click(screen.getByRole('button', { name: 'Remover a Ana' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoción' }));
  await waitFor(() => expect(participantsApi.remover).toHaveBeenCalledWith('session-1', 'ana'));
  expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});

it('reconcilia el permiso mostrado con la presencia recibida mientras permanece abierto', async () => {
  const { rerender } = render(<ManageParticipantsModal sessionId="session-1" presenceUsers={presence} onClose={vi.fn()} />);
  const permission = await screen.findByRole('combobox', { name: 'Permiso de Rafael' });
  expect(permission).toHaveValue('EDICION_COMPLETA');

  rerender(
    <ManageParticipantsModal
      sessionId="session-1"
      presenceUsers={presence.map(user => user.userId === 'rafael'
        ? { ...user, permission: 'SOLO_LECTURA' as const, canEdit: false }
        : user)}
      onClose={vi.fn()}
    />,
  );

  expect(permission).toHaveValue('SOLO_LECTURA');
});

it('recarga la lista persistida ante una nueva publicación de presencia aunque conserve los mismos usuarios', async () => {
  const { rerender } = render(<ManageParticipantsModal sessionId="session-1" presenceUsers={presence} onClose={vi.fn()} />);
  await screen.findByText('CASE-7K9Q');
  expect(participantsApi.listar).toHaveBeenCalledTimes(1);

  rerender(<ManageParticipantsModal sessionId="session-1" presenceUsers={[...presence]} onClose={vi.fn()} />);

  await waitFor(() => expect(participantsApi.listar).toHaveBeenCalledTimes(2));
});

it('permite reintentar cuando no puede cargar los participantes', async () => {
  vi.mocked(participantsApi.listar).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(details);
  render(<ManageParticipantsModal sessionId="session-1" presenceUsers={[]} onClose={vi.fn()} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('CASE-7K9Q')).toBeInTheDocument();
});
