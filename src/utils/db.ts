import { PrismaClient } from '@prisma/client';

// Singleton to prevent multiple database connections
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
