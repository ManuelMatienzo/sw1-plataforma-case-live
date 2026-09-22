import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from '../errors/AppError';
import { UserRole } from '../types/auth';

export interface AuthUserRecord {
  id: string;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRole;
  activo: boolean;
}

export interface SafeAuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
}

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  registerSuccessfulLogin(userId: string, ip?: string): Promise<void>;
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
}

export interface LoginResult {
  token: string;
  user: SafeAuthUser;
}

export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>;
}

export interface AuthServiceConfig {
  jwtSecret: string;
  jwtExpiresIn: SignOptions['expiresIn'];
}

const invalidCredentials = () =>
  new AppError('Correo o contraseña incorrectos', 401, 'INVALID_CREDENTIALS');

export const createAuthService = (
  repository: AuthRepository,
  config: AuthServiceConfig,
): AuthService => ({
  async login(input) {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw invalidCredentials();
    }

    const user = await repository.findByEmail(email);
    if (!user || !user.activo) {
      throw invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    await repository.registerSuccessfulLogin(user.id, input.ip);

    const token = jwt.sign(
      { email: user.email, nombre: user.nombre, rol: user.rol },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn, subject: user.id },
    );

    return {
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
    };
  },
});

