import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { getAuthConfig } from './config/auth';
import { prismaAdminRepository } from './repositories/prismaAdminRepository';
import {
  prismaAuthRepository,
  prismaAuthSessionRepository,
} from './repositories/prismaAuthRepository';
import { createAdminService } from './services/adminService';
import { createAuthService } from './services/authService';
import { setupUMLSocket } from './sockets/umlSocket';
import { createPrismaCollaborationRepository } from './repositories/prismaCollaborationRepository';
import prisma from './config/prisma';
import { createParticipantManagementService } from './services/participantManagementService';
import { createPrismaParticipantManagementRepository } from './repositories/prismaParticipantManagementRepository';
import { createPrismaDiagramRepository } from './repositories/prismaDiagramRepository';
import { XmiSessionService } from './services/xmiService';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const authConfig = getAuthConfig();
const authService = createAuthService(prismaAuthRepository, authConfig);
const adminService = createAdminService(prismaAdminRepository);
const participantService = createParticipantManagementService(createPrismaParticipantManagementRepository(prisma));
const xmiService = new XmiSessionService(createPrismaDiagramRepository(prisma));
const app = createApp({
  authService,
  adminService,
  sessionRepository: prismaAuthSessionRepository,
  jwtSecret: authConfig.jwtSecret,
  corsOrigin: CORS_ORIGIN,
  participantService,
  xmiService,
});

// Servidor HTTP e integración de Socket.IO
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Inicializar sockets de colaboración
setupUMLSocket(io, {
  jwtSecret: authConfig.jwtSecret,
  authRepository: prismaAuthSessionRepository,
  collaborationRepository: createPrismaCollaborationRepository(prisma),
  participantService,
  xmiService,
});

// Iniciar servidor
httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor CASE Backend corriendo en http://localhost:${PORT}`);
  console.log(`📡 WebSocket listo en ws://localhost:${PORT}/uml-session`);
  console.log(`🩺 Health check disponible en http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});

export { app, httpServer, io };
