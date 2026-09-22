import { SignOptions } from 'jsonwebtoken';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: SignOptions['expiresIn'];
}

export const getAuthConfig = (): AuthConfig => {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET es obligatorio para iniciar el backend');
  }

  return {
    jwtSecret,
    jwtExpiresIn: (process.env.JWT_EXPIRES_IN?.trim() || '8h') as SignOptions['expiresIn'],
  };
};

