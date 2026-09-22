import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { createPrismaDiagramRepository } from '../src/repositories/prismaDiagramRepository';
import { DiagramService } from '../src/services/diagramaService';

// Explicit integration check: all synthetic rows live in one rolled-back transaction.
async function verify() {
  const prisma = new PrismaClient();
  const projectId = randomUUID();
  const rollback = new Error('CU05_TEST_ROLLBACK');
  try {
    try {
      await prisma.$transaction(async tx => {
        const user = await tx.usuario.create({ data: { nombre: 'CU05 prueba transaccional', email: `${randomUUID()}@example.test`, passwordHash: 'not-a-login-hash', activo: false, rol: 'ANFITRION' } });
        await tx.proyecto.create({ data: { id: projectId, nombre: 'CU05 integración (rollback)', propietarioId: user.id } });
        const session = await tx.sesionColaborativa.create({ data: { proyectoId: projectId, anfitrionId: user.id, codigoAcceso: randomUUID().slice(0, 12), nombre: 'Prueba rollback' } });
        // Reuse the outer transaction instead of opening/committing nested ones.
        const scopedClient = { $transaction: <T>(action: (client: Prisma.TransactionClient) => Promise<T>) => action(tx) } as unknown as PrismaClient;
        const service = new DiagramService(createPrismaDiagramRepository(scopedClient));
        const initial = await service.get(session.id, user.id);
        assert.equal(initial.diagram.version, 1);
        const saved = await service.save(session.id, user.id, { ...initial.diagram, classes: [{ id: 'paciente', name: 'Paciente', isAbstract: false, isInterface: false, position: { x: 100, y: 150 }, attributes: [], methods: [] }] });
        assert.equal(saved.diagram.version, 2);
        assert.equal((await service.get(session.id, user.id)).diagram.classes[0].name, 'Paciente');
        assert.equal(await tx.diagramaClases.count({ where: { proyectoId: projectId } }), 1);
        await assert.rejects(service.save(session.id, user.id, initial.diagram), { code: 'DIAGRAM_CONFLICT' });
        await assert.rejects(service.get(session.id, randomUUID()), { statusCode: 403 });
        console.log('PASS: JSON-B, carga, guardado v2, conflicto y acceso ajeno en PostgreSQL.');
        throw rollback;
      }, { maxWait: 15000, timeout: 30000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.equal(await prisma.proyecto.count({ where: { id: projectId } }), 0);
    console.log('PASS: rollback verificado; no se conservaron datos de prueba.');
  } finally { await prisma.$disconnect(); }
}
verify().catch(error => { console.error(error instanceof Error ? error.message : 'Falló la integración'); process.exitCode = 1; });
