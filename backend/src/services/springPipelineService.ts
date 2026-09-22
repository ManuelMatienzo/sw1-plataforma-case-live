import { AppError } from '../errors/AppError';
import { DataModelResult } from '../models/dataModel.types';
import { SpringProjectOptions, SpringProjectResult } from '../models/spring.types';
import { DiagramService } from './diagramaService';
import { SpringGeneratorService } from './springGeneratorService';

export interface CachedSpringProject {
  result: SpringProjectResult;
  projectName: string;
  generatedAt: string;
}

export class SpringPipelineService {
  private readonly projects = new Map<string, CachedSpringProject>();

  constructor(
    private readonly diagramService: DiagramService,
    private readonly generator = new SpringGeneratorService(),
  ) {}

  async authorizeHost(sesionId: string, userId: string): Promise<Awaited<ReturnType<DiagramService['get']>>> {
    const context = await this.diagramService.get(sesionId, userId);
    if (!context.isHost) throw new AppError('Solo el anfitrión puede generar o ejecutar el backend', 403, 'HOST_REQUIRED');
    return context;
  }

  async generate(
    sesionId: string,
    userId: string,
    options?: Partial<SpringProjectOptions>,
    dataModel?: DataModelResult,
  ): Promise<CachedSpringProject> {
    const context = await this.authorizeHost(sesionId, userId);
    const result = await this.generator.generate(context.diagram, options, dataModel);
    const cached = {
      result,
      projectName: context.proyectoNombre || context.sesionNombre || 'proyecto-case',
      generatedAt: new Date().toISOString(),
    };
    this.projects.set(sesionId, cached);
    return cached;
  }

  async getOrGenerate(sesionId: string, userId: string): Promise<CachedSpringProject> {
    await this.authorizeHost(sesionId, userId);
    return this.projects.get(sesionId) ?? this.generate(sesionId, userId);
  }
}
