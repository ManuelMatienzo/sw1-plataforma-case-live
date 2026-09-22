import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { UMLDiagramAST } from '../models/uml.types';
import { DiagramRepository } from '../services/diagramaService';

export const createPrismaDiagramRepository = (prisma: PrismaClient): DiagramRepository => ({
  async run(sessionId, userId, action) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.sesionColaborativa.findUnique({ where: { id: sessionId },
        include: { proyecto: true, participantes: { where: { usuarioId: userId } } } });
      if (!session) throw new AppError('Sesión no encontrada', 404, 'SESSION_NOT_FOUND');
      // A project lock serializes initialization and version checks across sessions.
      await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${session.proyectoId} FOR UPDATE`;
      const participant = session.participantes[0];
      const host = session.anfitrionId === userId;
      let row = await tx.diagramaClases.findFirst({ where: { proyectoId: session.proyectoId },
        orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }] });
      const read = (value: NonNullable<typeof row>): UMLDiagramAST => ({
        ...(value.contenido as unknown as UMLDiagramAST), version: value.version,
      });
      return action({ proyectoId: session.proyectoId, proyectoNombre: session.proyecto.nombre,
        sesionNombre: session.nombre, estado: session.estado, proyectoEstado: session.proyecto.estado,
        canRead: host || Boolean(participant), canEdit: host || Boolean(participant && participant.permiso !== 'SOLO_LECTURA'),
        isHost: host }, {
        async load() {
          if (!row) row = await tx.diagramaClases.create({ data: { proyectoId: session.proyectoId,
            contenido: { version: 1, classes: [], relationships: [] } } });
          return read(row);
        },
        async save(ast) {
          if (!row) throw new AppError('Diagrama no encontrado', 404);
          row = await tx.diagramaClases.update({ where: { id: row.id },
            data: { version: ast.version, contenido: ast as unknown as Prisma.InputJsonValue } });
          return read(row);
        },
      });
    }, { timeout: 15000 });
  },
});
