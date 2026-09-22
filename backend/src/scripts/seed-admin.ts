import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import prisma from '../config/prisma';

dotenv.config();

const seedAdmin = async () => {
  const email = 'admin@case.local';
  const existing = await prisma.usuario.findUnique({ where: { email } });
  if (existing) {
    console.log(`Administrador ya disponible: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash('Admin2026!', 12);
  await prisma.usuario.create({
    data: {
      nombre: 'Administración CASE',
      email,
      passwordHash,
      rol: 'ADMINISTRADOR',
      activo: true,
    },
  });
  console.log(`Administrador creado: ${email}`);
};

seedAdmin()
  .catch((error: unknown) => {
    console.error('No se pudo crear el administrador:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

