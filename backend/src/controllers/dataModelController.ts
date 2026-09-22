import { RequestHandler } from 'express';
import '../types/auth';
import { DiagramService } from '../services/diagramaService';
import {
  DataModelGeneratorService,
  createDataModelGeneratorService,
} from '../services/dataModelGeneratorService';
import { InheritanceStrategy } from '../models/dataModel.types';
import { AppError } from '../errors/AppError';
import { parseDiagram } from '../utils/validateDiagram';
import { UMLDiagramAST } from '../models/uml.types';

export interface DataModelController {
  generarModeloDatosSesion: RequestHandler;
  generarModeloDatosDirecto: RequestHandler;
}

export function createDataModelController(
  diagramService?: DiagramService,
  generatorService: DataModelGeneratorService = createDataModelGeneratorService(),
): DataModelController {
  return {
    generarModeloDatosSesion: async (req, res) => {
      if (!req.auth) throw new AppError('Debes iniciar sesión para generar el modelo de datos.', 401, 'AUTH_REQUIRED');
      const sessionId = String(req.params.sesionId);

      const body = (req.body || {}) as Record<string, unknown>;
      const query = (req.query || {}) as Record<string, string | undefined>;
      const opts = (body.options || {}) as Record<string, unknown>;

      const estrategiaHerencia = (
        body.estrategiaHerencia ||
        opts.inheritanceStrategy ||
        query.estrategiaHerencia ||
        query.strategy
      ) as InheritanceStrategy || 'TPS';

      const pluralize = Boolean(
        body.pluralize ??
        opts.pluralize ??
        (query.pluralize === 'true')
      );

      let ast: UMLDiagramAST;

      // 1. Si el cliente envía el diagrama en vivo desde el canvas, usamos ese
      if (body.diagrama && typeof body.diagrama === 'object') {
        ast = parseDiagram(body.diagrama);
      } else if (body.classes || body.relationships) {
        ast = parseDiagram(body);
      } else if (diagramService) {
        // 2. Si no, cargamos el diagrama persistido de la base de datos
        const result = await diagramService.get(sessionId, req.auth.id);
        ast = result.diagram;
      } else {
        throw new AppError('No se proporcionó un diagrama de clases para transformar.', 400, 'INVALID_DIAGRAM');
      }

      if (!ast.classes || ast.classes.length === 0) {
        throw new AppError('El diagrama no contiene clases para generar el modelo relacional.', 400, 'EMPTY_DIAGRAM');
      }

      const modelResult = generatorService.generateDataModel(ast, {
        inheritanceStrategy: estrategiaHerencia,
        pluralize,
      });

      res.status(200).json({
        data: modelResult,
      });
    },

    generarModeloDatosDirecto: async (req, res) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const query = (req.query || {}) as Record<string, string | undefined>;
      const opts = (body.options || {}) as Record<string, unknown>;

      const estrategiaHerencia = (
        body.estrategiaHerencia ||
        opts.inheritanceStrategy ||
        query.estrategiaHerencia ||
        query.strategy
      ) as InheritanceStrategy || 'TPS';

      const pluralize = Boolean(
        body.pluralize ??
        opts.pluralize ??
        (query.pluralize === 'true')
      );

      const astInput = (body.diagrama && typeof body.diagrama === 'object') ? body.diagrama : body;
      const ast = parseDiagram(astInput);

      if (!ast.classes || ast.classes.length === 0) {
        throw new AppError('El diagrama no contiene clases para generar el modelo relacional.', 400, 'EMPTY_DIAGRAM');
      }

      const modelResult = generatorService.generateDataModel(ast, {
        inheritanceStrategy: estrategiaHerencia,
        pluralize,
      });

      res.status(200).json({
        data: modelResult,
      });
    },
  };
}
