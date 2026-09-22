import { AppError } from '../errors/AppError';
import { MobileAppResult } from '../models/mobile.types';
import { UMLDiagramAST } from '../models/uml.types';
import { DiagramService } from './diagramaService';
import { detectLanAddress, MobileAppService } from './mobileAppService';
import { SpringRunnerService } from './springRunnerService';

export class MobilePipelineService {
  private readonly apps = new Map<string, MobileAppResult>();
  private readonly sessionApps = new Map<string, string>();

  constructor(
    private readonly diagramService: DiagramService,
    private readonly runner: SpringRunnerService,
    private readonly generator = new MobileAppService(),
  ) {}

  private async authorizeHost(sesionId: string, userId: string) {
    const context = await this.diagramService.get(sesionId, userId);
    if (!context.isHost) throw new AppError('Solo el anfitrión puede generar la aplicación móvil', 403, 'HOST_REQUIRED');
    return context;
  }

  async generateDirect(diagrama: UMLDiagramAST, backendBaseUrl?: string): Promise<MobileAppResult> {
    const result = await this.generator.generate(diagrama, { backendBaseUrl });
    this.apps.set(result.appId, result);
    return result;
  }

  async generateSession(sesionId: string, userId: string, backendBaseUrl?: string): Promise<MobileAppResult> {
    const context = await this.authorizeHost(sesionId, userId);
    const currentPort = this.runner.getStatus(sesionId).port;
    const apiUrl = backendBaseUrl ?? (currentPort ? `http://${detectLanAddress()}:${currentPort}/api/v1` : '');
    const result = await this.generator.generate(context.diagram, {
      appId: sesionId,
      name: context.proyectoNombre || context.sesionNombre || 'App CASE IA',
      backendBaseUrl: apiUrl,
    });
    this.apps.set(sesionId, result);
    this.sessionApps.set(sesionId, sesionId);
    return result;
  }

  async getOrGenerate(sesionId: string, userId: string): Promise<MobileAppResult> {
    await this.authorizeHost(sesionId, userId);
    const appId = this.sessionApps.get(sesionId);
    return (appId && this.apps.get(appId)) || this.generateSession(sesionId, userId);
  }

  getPublic(appId: string): MobileAppResult {
    const app = this.apps.get(appId);
    if (!app) throw new AppError('Aplicación móvil no encontrada; genérala desde la sesión', 404, 'MOBILE_APP_NOT_FOUND');
    return app;
  }
}
