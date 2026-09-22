import { RequestHandler } from 'express';
import { AuthService } from '../services/authService';

export interface AuthController {
  login: RequestHandler;
}

export const createAuthController = (service: AuthService): AuthController => ({
  login: async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const result = await service.login({
      email: typeof body.email === 'string' ? body.email : '',
      password: typeof body.password === 'string' ? body.password : '',
      ip: req.ip,
    });
    res.status(200).json(result);
  },
});

