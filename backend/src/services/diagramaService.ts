import { AppError } from '../errors/AppError';
import { UMLDiagramAST } from '../models/uml.types';
import { parseDiagram } from '../utils/validateDiagram';

export interface DiagramContext {
  proyectoId: string;
  proyectoNombre: string;
  sesionNombre: string;
  estado: string;
  proyectoEstado: string;
  canRead: boolean;
  canEdit: boolean;
  isHost?: boolean;
}
export interface DiagramStorage {
  load(): Promise<UMLDiagramAST>;
  save(ast: UMLDiagramAST): Promise<UMLDiagramAST>;
}
export interface DiagramRepository {
  run<T>(sessionId: string, userId: string,
    action: (context: DiagramContext, storage: DiagramStorage) => Promise<T>): Promise<T>;
}
export class DiagramService {
  constructor(private readonly repository: DiagramRepository) {}

  private execute(sessionId: string, userId: string, input?: unknown, writing = false) {
    if (!/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(sessionId)) {
      throw new AppError('Identificador de sesión inválido', 400, 'INVALID_ID');
    }
    return this.repository.run(sessionId, userId, async (context, storage) => {
      if (!context.canRead) throw new AppError('No perteneces a esta sesión', 403, 'FORBIDDEN');
      const canEdit = context.canEdit && context.estado === 'ABIERTA' && context.proyectoEstado === 'ACTIVO';
      if (writing && !context.canEdit) throw new AppError('Tu permiso es de solo lectura', 403, 'READ_ONLY');
      if (writing && !canEdit) throw new AppError('La sesión o el proyecto ya no admite cambios', 409, 'SESSION_CLOSED');
      const incoming = writing ? parseDiagram(input) : null;
      let diagram = await storage.load();
      if (incoming) {
        if (incoming.version !== diagram.version) {
          throw new AppError('Hay una versión más reciente. Descarga tus cambios antes de recargar el diagrama.', 409, 'DIAGRAM_CONFLICT');
        }
        diagram = await storage.save({ ...incoming, version: diagram.version + 1 });
      }
      return { diagram, canEdit, isHost: Boolean(context.isHost), proyectoNombre: context.proyectoNombre, sesionNombre: context.sesionNombre };
    });
  }
  async get(sessionId: string, userId: string) { return this.execute(sessionId, userId); }
  async save(sessionId: string, userId: string, input: unknown) { return this.execute(sessionId, userId, input, true); }
}
