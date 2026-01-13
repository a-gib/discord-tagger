import { PrismaClient } from '@prisma/client';

// Singleton pattern: Create a single Prisma client instance
// This prevents multiple connections to the database
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Handle cleanup on process exit
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
