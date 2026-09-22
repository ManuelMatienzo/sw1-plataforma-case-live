import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const proyectos = await prisma.proyecto.findMany({
    include: {
      sesiones: {
        orderBy: { fechaInicio: 'desc' }
      }
    }
  });

  let deletedCount = 0;

  for (const p of proyectos) {
    if (p.sesiones.length > 1) {
      // keep the most recent one (index 0)
      const toDelete = p.sesiones.slice(1);
      for (const s of toDelete) {
        await prisma.sesionColaborativa.delete({ where: { id: s.id }});
        deletedCount++;
      }
    }
  }

  console.log(`Deleted ${deletedCount} garbage sessions.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
