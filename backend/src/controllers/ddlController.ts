import { RequestHandler } from 'express';
import '../types/auth';
import { DiagramService } from '../services/diagramaService';
import {
  PostgresDdlGeneratorService,
  createPostgresDdlGeneratorService,
} from '../services/postgresDdlGeneratorService';
import { PostgresDdlOptions } from '../models/ddl.types';
import { AppError } from '../errors/AppError';
import { parseDiagram } from '../utils/validateDiagram';
import { UMLDiagramAST } from '../models/uml.types';

export interface DdlController {
  generarDdlDirecto: RequestHandler;
  generarDdlSesion: RequestHandler;
  descargarDdlSesion: RequestHandler;
}

export function createDdlController(
  diagramService?: DiagramService,
  generatorService: PostgresDdlGeneratorService = createPostgresDdlGeneratorService(),
): DdlController {
  return {
    generarDdlDirecto: async (req, res) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const query = (req.query || {}) as Record<string, string | undefined>;
      const opts = (body.options || {}) as PostgresDdlOptions;

      const ddlOptions: PostgresDdlOptions = {
        inheritanceStrategy: opts.inheritanceStrategy || (query.strategy as any) || 'TPS',
        includeDropTable: opts.includeDropTable ?? (query.includeDropTable !== 'false'),
        ifNotExists: opts.ifNotExists ?? (query.ifNotExists !== 'false'),
        includeComments: opts.includeComments ?? (query.includeComments !== 'false'),
        includeIndices: opts.includeIndices ?? (query.includeIndices !== 'false'),
        pluralize: opts.pluralize ?? (query.pluralize !== 'false'),
        schemaName: opts.schemaName || query.schemaName || 'public',
      };

      // Puede recibir un dataModel lógico pregenerado o un diagrama UML
      if (body.dataModel && typeof body.dataModel === 'object') {
        const result = generatorService.generateDdl(body.dataModel as any, ddlOptions);
        res.status(200).json({ data: result });
        return;
      }

      const astInput = (body.diagrama && typeof body.diagrama === 'object') ? body.diagrama : body;
      const ast = parseDiagram(astInput);

      if (!ast.classes || ast.classes.length === 0) {
        throw new AppError('El diagrama no contiene clases para generar el script DDL.', 400, 'EMPTY_DIAGRAM');
      }

      const result = generatorService.generateDdl(ast, ddlOptions);
      res.status(200).json({ data: result });
    },

    generarDdlSesion: async (req, res) => {
      if (!req.auth) throw new AppError('Debes iniciar sesión para generar el script DDL.', 401, 'AUTH_REQUIRED');
      const sessionId = String(req.params.sesionId);

      const body = (req.body || {}) as Record<string, unknown>;
      const query = (req.query || {}) as Record<string, string | undefined>;
      const opts = (body.options || {}) as PostgresDdlOptions;

      const ddlOptions: PostgresDdlOptions = {
        inheritanceStrategy: opts.inheritanceStrategy || (query.strategy as any) || (body.estrategiaHerencia as any) || 'TPS',
        includeDropTable: opts.includeDropTable ?? (query.includeDropTable !== 'false'),
        ifNotExists: opts.ifNotExists ?? (query.ifNotExists !== 'false'),
        includeComments: opts.includeComments ?? (query.includeComments !== 'false'),
        includeIndices: opts.includeIndices ?? (query.includeIndices !== 'false'),
        pluralize: opts.pluralize ?? (query.pluralize !== 'false'),
        schemaName: opts.schemaName || query.schemaName || 'public',
      };

      let ast: UMLDiagramAST;

      if (body.diagrama && typeof body.diagrama === 'object') {
        ast = parseDiagram(body.diagrama);
      } else if (body.classes || body.relationships) {
        ast = parseDiagram(body);
      } else if (diagramService) {
        const sessionDiagram = await diagramService.get(sessionId, req.auth.id);
        ast = sessionDiagram.diagram;
      } else {
        throw new AppError('No se proporcionó un diagrama de clases para generar DDL.', 400, 'INVALID_DIAGRAM');
      }

      if (!ast.classes || ast.classes.length === 0) {
        throw new AppError('El diagrama no contiene clases para generar el script DDL.', 400, 'EMPTY_DIAGRAM');
      }

      const result = generatorService.generateDdl(ast, ddlOptions);
      res.status(200).json({ data: result });
    },

    descargarDdlSesion: async (req, res) => {
      if (!req.auth) throw new AppError('Debes iniciar sesión para descargar el script DDL.', 401, 'AUTH_REQUIRED');
      const sessionId = String(req.params.sesionId);
      const query = (req.query || {}) as Record<string, string | undefined>;

      const ddlOptions: PostgresDdlOptions = {
        inheritanceStrategy: (query.strategy as any) || 'TPS',
        includeDropTable: query.includeDropTable !== 'false',
        ifNotExists: query.ifNotExists !== 'false',
        includeComments: query.includeComments !== 'false',
        includeIndices: query.includeIndices !== 'false',
        pluralize: query.pluralize !== 'false',
        schemaName: query.schemaName || 'public',
      };

      let ast: UMLDiagramAST;
      let projectName = 'schema';

      if (diagramService) {
        const sessionDiagram = await diagramService.get(sessionId, req.auth.id);
        ast = sessionDiagram.diagram;
        if (ast.nombre) {
          projectName = ast.nombre.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        }
      } else {
        throw new AppError('No hay servicio de persistencia disponible para descargar el diagrama.', 500);
      }

      if (!ast.classes || ast.classes.length === 0) {
        throw new AppError('El diagrama no contiene clases para generar el script DDL.', 400, 'EMPTY_DIAGRAM');
      }

      const result = generatorService.generateDdl(ast, ddlOptions);
      const filename = `${projectName}_schema.sql`;

      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(result.sql);
    },
  };
}
