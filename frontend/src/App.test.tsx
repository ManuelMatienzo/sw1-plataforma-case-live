import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { adminApi, authApi } from './services/api';
import App from './App';

vi.mock('./services/api', () => ({
  authApi: { login: vi.fn() },
  adminApi: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    setUserStatus: vi.fn(),
    deleteUser: vi.fn(),
    listProjects: vi.fn(),
    setProjectStatus: vi.fn(),
  },
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App />
    </MemoryRouter>,
  );

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(adminApi.listUsers).mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  vi.mocked(adminApi.listProjects).mockResolvedValue([]);
});

describe('rutas públicas de la plataforma CASE', () => {
  it('presenta en la raíz la propuesta UML a backend', () => {
    renderAt('/');

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Del diagrama de clases a un backend listo para probar.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Demostración académica · Software 1')).toBeInTheDocument();
  });

  it('resume las tres capacidades sin afirmar resultados ya logrados', () => {
    renderAt('/');

    const summary = screen.getByRole('region', { name: 'Resumen de capacidades' });
    expect(within(summary).getByRole('heading', { name: 'Modela' })).toBeInTheDocument();
    expect(within(summary).getByRole('heading', { name: 'Colabora' })).toBeInTheDocument();
    expect(within(summary).getByRole('heading', { name: 'Genera' })).toBeInTheDocument();
    expect(
      within(summary).getByText(/busca reducir trabajo manual y ayudar a afrontar/i),
    ).toBeInTheDocument();
  });

  it('muestra el flujo completo y etiqueta el preview como ilustrativo', () => {
    renderAt('/');

    const flow = screen.getByRole('region', { name: 'Flujo del producto' });
    expect(within(flow).getByText('UML validado')).toBeInTheDocument();
    expect(within(flow).getByText('Modelo lógico 3FN')).toBeInTheDocument();
    expect(within(flow).getByText('PostgreSQL')).toBeInTheDocument();
    expect(within(flow).getByText('Spring Boot + Postman')).toBeInTheDocument();
    expect(screen.getByText('Ejemplo ilustrativo')).toBeInTheDocument();
    expect(screen.getByLabelText('Ejemplo de entidad Java generada')).toHaveTextContent(
      'GenerationType.IDENTITY',
    );
  });

  it('envía los CTA principales al acceso de la plataforma (/login)', () => {
    renderAt('/');

    const loginLinks = screen.getAllByRole('link', {
      name: /iniciar sesión|entrar a la plataforma|ingresar a la plataforma/i,
    });
    expect(loginLinks).toHaveLength(3);
    loginLinks.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('ofrece el editor de práctica sin persistencia en /app', () => {
    renderAt('/app');

    expect(screen.getByText('Demostración local')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar diagrama' })).toBeDisabled();
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'Del diagrama de clases a un backend listo para probar.',
      }),
    ).not.toBeInTheDocument();
  });

  it('presenta el formulario de acceso con controles accesibles', () => {
    renderAt('/login');

    expect(screen.getByRole('heading', { level: 1, name: 'Accede a CASE IA' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('type', 'email');
    const password = screen.getByLabelText('Contraseña');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');
  });

  it('inicia sesión como administrador, guarda la sesión y redirige al panel', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: 'jwt-admin',
      user: {
        id: 'admin-1',
        nombre: 'Administración CASE',
        email: 'admin@case.local',
        rol: 'ADMINISTRADOR',
      },
    });
    renderAt('/login');

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'admin@case.local' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'Admin2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Administración del sistema' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('case.auth.v1')).toContain('jwt-admin');
  });

  it('protege /admin cuando no existe una sesión local', () => {
    renderAt('/admin');

    expect(screen.getByRole('heading', { level: 1, name: 'Accede a CASE IA' })).toBeInTheDocument();
  });

  it('muestra usuarios y proyectos reales del servicio administrativo', async () => {
    localStorage.setItem(
      'case.auth.v1',
      JSON.stringify({
        version: 1,
        token: 'jwt-admin',
        user: {
          id: 'admin-1',
          nombre: 'Administración CASE',
          email: 'admin@case.local',
          rol: 'ADMINISTRADOR',
        },
      }),
    );
    vi.mocked(adminApi.listUsers).mockResolvedValue({
      data: [
        {
          id: 'user-1',
          nombre: 'Ada Lovelace',
          email: 'ada@example.com',
          rol: 'ANFITRION',
          activo: true,
          fechaCreacion: '2026-09-20T00:00:00.000Z',
          ultimoAcceso: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(adminApi.listProjects).mockResolvedValue([
      {
        id: 'project-1',
        nombre: 'Sistema HCE',
        descripcion: 'Historias clínicas electrónicas',
        estado: 'ACTIVO',
        fechaActualizacion: '2026-09-20T00:00:00.000Z',
        propietario: { id: 'user-1', nombre: 'Ada Lovelace', email: 'ada@example.com' },
      },
    ]);
    renderAt('/admin');

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Proyectos' }));
    await waitFor(() => expect(screen.getByText('Sistema HCE')).toBeInTheDocument());
  });

  it('devuelve el foco al control que abrió el formulario de usuario', async () => {
    localStorage.setItem(
      'case.auth.v1',
      JSON.stringify({
        version: 1,
        token: 'jwt-admin',
        user: {
          id: 'admin-1',
          nombre: 'Administración CASE',
          email: 'admin@case.local',
          rol: 'ADMINISTRADOR',
        },
      }),
    );
    renderAt('/admin');

    const createButton = await screen.findByRole('button', { name: 'Crear usuario' });
    createButton.focus();
    fireEvent.click(createButton);
    const dialog = screen.getByRole('dialog', { name: 'Crear usuario' });
    expect(screen.getByLabelText('Nombre completo')).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Crear usuario' })).not.toBeInTheDocument();
    expect(createButton).toHaveFocus();
  });
});
