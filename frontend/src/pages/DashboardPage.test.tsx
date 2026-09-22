import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { proyectosApi } from '../services/api';

vi.mock('../services/api', () => ({
  proyectosApi: {
    listar: vi.fn(),
    archivar: vi.fn(),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.setItem(
      'case.auth.v1',
      JSON.stringify({
        version: 1,
        token: 'jwt-user',
        user: {
          id: 'user-1',
          nombre: 'Ada Lovelace',
          email: 'ada@example.com',
          rol: 'COLABORADOR',
        },
      }),
    );
    vi.mocked(proyectosApi.listar).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('explica por qué el colaborador regresó al dashboard y permite descartar el aviso', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/dashboard',
            state: { sessionNotice: 'El anfitrión te removió de la sesión.' },
          },
        ]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'El anfitrión te removió de la sesión.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
