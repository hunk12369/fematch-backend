import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['error'] : ['query', 'info', 'warn', 'error'],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

// Fix BigInt JSON serialization for Express JSON responses
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export default prisma;
