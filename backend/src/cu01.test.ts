import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AppError } from './errors/AppError';
import {
  AdminRepository,
  AdminService,
  createAdminService,
} from './services/adminService';
import {
  AuthRepository,
  AuthService,
  createAuthService,
} from './services/authService';
import { AuthSessionRepository } from './middlewares/auth';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-cu01';

test('login autentica con bcrypt, normaliza el email y firma un JWT sin exponer el hash', async () => {
  const passwordHash = await bcrypt.hash('Admin2026!', 4);
  let recordedLogin = false;
  const repository: AuthRepository = {
    findByEmail: async (email) =>
      email === 'admin@case.local'
        ? {
            id: 'admin-1',
            nombre: 'Administración CASE',
            email,
            passwordHash,
            rol: 'ADMINISTRADOR',
            activo: true,
          }
        : null,
    registerSuccessfulLogin: async (userId, ip) => {
      recordedLogin = userId === 'admin-1' && ip === '127.0.0.1';
    },
  };
  const service = createAuthService(repository, {
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: '8h',
  });

  const result = await service.login({
    email: '  ADMIN@CASE.LOCAL ',
    password: 'Admin2026!',
    ip: '127.0.0.1',
  });

  const claims = jwt.verify(result.token, JWT_SECRET);
  assert.equal(typeof claims === 'string' ? undefined : claims.sub, 'admin-1');
  assert.equal(result.user.email, 'admin@case.local');
  assert.equal(result.user.rol, 'ADMINISTRADOR');
  assert.equal('passwordHash' in result.user, false);
  assert.equal(recordedLogin, true);
});

test('login devuelve el mismo error para cuenta inexistente, inactiva o contraseña incorrecta', async () => {
  const repository: AuthRepository = {
    findByEmail: async () => null,
    registerSuccessfulLogin: async () => undefined,
  };
  const service = createAuthService(repository, {
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: '8h',
  });

  await assert.rejects(
    () => service.login({ email: 'nadie@case.local', password: 'incorrecta' }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 401 &&
      error.code === 'INVALID_CREDENTIALS',
  );
});

test('crear usuario valida los datos, hashea la contraseña y devuelve un usuario seguro', async () => {
  let storedHash = '';
  const repository: AdminRepository = {
    listUsers: async () => ({ users: [], total: 0 }),
    createUserWithAudit: async (input) => {
      storedHash = input.passwordHash;
      return {
        id: 'user-1',
        nombre: input.nombre,
        email: input.email,
        rol: input.rol,
        activo: true,
        fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
        ultimoAcceso: null,
      };
    },
    setUserActiveWithAudit: async () => {
      throw new Error('No usado en esta prueba');
    },
    listProjects: async () => [],
    setProjectStatusWithAudit: async () => {
      throw new Error('No usado en esta prueba');
    },
  };
  const service = createAdminService(repository);

  const user = await service.createUser(
    {
      nombre: 'Ada Lovelace',
      email: ' ADA@EXAMPLE.COM ',
      password: 'ClaveSegura2026!',
      rol: 'ANFITRION',
    },
    { userId: 'admin-1', ip: '127.0.0.1' },
  );

  assert.equal(user.email, 'ada@example.com');
  assert.equal(await bcrypt.compare('ClaveSegura2026!', storedHash), true);
  assert.equal('passwordHash' in user, false);
});

test('las rutas administrativas exigen un JWT vigente y rol ADMINISTRADOR', async () => {
  const authService: AuthService = {
    login: async () => {
      throw new Error('No usado en esta prueba');
    },
  };
  const adminService: AdminService = {
    listUsers: async () => ({
      data: [
        {
          id: 'user-1',
          nombre: 'Ada Lovelace',
          email: 'ada@example.com',
          rol: 'ANFITRION',
          activo: true,
          fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
          ultimoAcceso: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }),
    createUser: async () => {
      throw new Error('No usado en esta prueba');
    },
    setUserStatus: async () => {
      throw new Error('No usado en esta prueba');
    },
    deleteUser: async () => {
      throw new Error('No usado en esta prueba');
    },
    listProjects: async () => [],
    setProjectStatus: async () => {
      throw new Error('No usado en esta prueba');
    },
  };
  const sessionRepository: AuthSessionRepository = {
    findSessionUserById: async (id) =>
      id === 'admin-1'
        ? {
            id,
            nombre: 'Administración CASE',
            email: 'admin@case.local',
            rol: 'ADMINISTRADOR',
            activo: true,
          }
        : {
            id,
            nombre: 'Colaborador',
            email: 'colaborador@case.local',
            rol: 'COLABORADOR',
            activo: true,
          },
  };
  const app = createApp({
    authService,
    adminService,
    sessionRepository,
    jwtSecret: JWT_SECRET,
    corsOrigin: 'http://localhost:5173',
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  try {
    const anonymous = await fetch(`${baseUrl}/api/admin/usuarios`);
    assert.equal(anonymous.status, 401);

    const collaboratorToken = jwt.sign(
      { email: 'colaborador@case.local', rol: 'COLABORADOR', nombre: 'Colaborador' },
      JWT_SECRET,
      { subject: 'collaborator-1', expiresIn: '8h' },
    );
    const forbidden = await fetch(`${baseUrl}/api/admin/usuarios`, {
      headers: { Authorization: `Bearer ${collaboratorToken}` },
    });
    assert.equal(forbidden.status, 403);

    const adminToken = jwt.sign(
      { email: 'admin@case.local', rol: 'ADMINISTRADOR', nombre: 'Administración CASE' },
      JWT_SECRET,
      { subject: 'admin-1', expiresIn: '8h' },
    );
    const allowed = await fetch(`${baseUrl}/api/admin/usuarios`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(allowed.status, 200);
    const body = (await allowed.json()) as { data: Array<{ email: string }> };
    assert.equal(body.data[0]?.email, 'ada@example.com');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

