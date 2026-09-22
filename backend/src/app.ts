import express, { Request, Response } from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { AuthSessionRepository } from './middlewares/auth';
import { createAdminRouter } from './routes/adminRoutes';
import { createAuthRouter } from './routes/authRoutes';
import { createProyectosRouter } from './routes/proyectosRoutes';
import { createProyectoSesionesRouter, createSesionesRouter } from './routes/sesionesRoutes';
import { createAiRouter } from './routes/aiRoutes';
import { createDataModelRouter } from './routes/dataModelRoutes';
import { AdminService } from './services/adminService';
import { AuthService } from './services/authService';
import { ParticipantManagementService } from './services/participantManagementService';
import { GeminiService } from './services/geminiService';
import { HybridVisionService } from './services/hybridVisionService';
import { XmiSessionService } from './services/xmiService';
import { DiagramService } from './services/diagramaService';

export interface AppServices {
  authService: AuthService;
  adminService: AdminService;
  sessionRepository: AuthSessionRepository;
  jwtSecret: string;
  corsOrigin: string;
  participantService?: ParticipantManagementService;
  geminiService?: GeminiService;
  hybridVisionService?: HybridVisionService;
  xmiService?: XmiSessionService;
  diagramService?: DiagramService;
}

export const createApp = (services: AppServices) => {
  const app = express();

  app.use(cors({ origin: services.corsOrigin, credentials: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'CASE Platform Backend',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      message: 'Plataforma CASE Colaborativa con IA - API Backend',
      documentation: '/api/docs',
    });
  });

  app.use('/api/auth', createAuthRouter(services.authService));
  app.use(
    '/api/admin',
    createAdminRouter(services.adminService, services.sessionRepository, services.jwtSecret),
  );
  app.use(
    '/api/proyectos',
    createProyectosRouter(services.sessionRepository, services.jwtSecret),
  );
  app.use(
    '/api/proyectos/:id/sesiones',
    createProyectoSesionesRouter(services.sessionRepository, services.jwtSecret),
  );
  app.use(
    '/api/sesiones',
    createSesionesRouter(services.sessionRepository, services.jwtSecret, services.diagramService, undefined, services.participantService, services.xmiService),
  );
  app.use(
    '/api/ia',
    createAiRouter(services.sessionRepository, services.jwtSecret, services.geminiService, services.hybridVisionService),
  );
  app.use(
    '/api/modelo-datos',
    createDataModelRouter(services.sessionRepository, services.jwtSecret),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
