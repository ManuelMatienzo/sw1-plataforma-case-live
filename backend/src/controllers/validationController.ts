import { RequestHandler } from 'express';
import '../types/auth';
import { DiagramService } from '../services/diagramaService';
import { validateUmlDiagram } from '../services/umlValidator';
import { AppError } from '../errors/AppError';
import { parseDiagram } from '../utils/validateDiagram';
import { UMLDiagramAST } from '../models/uml.types';

export interface ValidationController {
  validarDiagramaSesion: RequestHandler;
  validarDiagramaDirecto: RequestHandler;
}

export function createValidationController(diagramService?: DiagramService): ValidationController {
  return {
    validarDiagramaSesion: async (req, res) => {
      if (!req.auth) throw new AppError('Debes iniciar sesión', 401, 'AUTH_REQUIRED');
      const sessionId = String(req.params.sesionId);

      let astToValidate: UMLDiagramAST;
      const body = req.body as Record<string, unknown>;

      // Si el cliente envía un diagrama en el cuerpo (borrador en vivo), validamos ese
      if (body && (body.classes || body.relationships)) {
        astToValidate = parseDiagram(body);
      } else if (diagramService) {
        // De lo contrario, cargamos el diagrama persistido de la sesión
        const result = await diagramService.get(sessionId, req.auth.id);
        astToValidate = result.diagram;
      } else {
        throw new AppError('No se proporcionó un diagrama para validar', 400, 'INVALID_DIAGRAM');
      }

      const report = validateUmlDiagram(astToValidate);
      res.json({ data: report });
    },

    validarDiagramaDirecto: async (req, res) => {
      const ast = parseDiagram(req.body);
      const report = validateUmlDiagram(ast);
      res.json({ data: report });
    },
  };
}
