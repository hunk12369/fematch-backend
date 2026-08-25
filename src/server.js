import app, { allowedOrigins } from './app.js';
import { env } from './config/env.js';
import prisma from './services/prisma.js';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 [Server] Telegram Mini App Backend running on port ${PORT}`);
  console.log(`📡 [Environment] ${env.NODE_ENV}`);
  console.log(`🌐 [CORS Allowed] ${allowedOrigins.join(', ')} (Vite port 5173 enabled)`);
  console.log(`🩺 [Health Check] http://localhost:${PORT}/health`);
});

/**
 * Graceful Shutdown Handler
 */
async function handleShutdown(signal) {
  console.log(`\n🛑 [Server] Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('🔌 [Server] HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('🗄️  [Prisma] Database connection closed.');
      process.exit(0);
    } catch (error) {
      console.error('❌ [Prisma] Error during database disconnect:', error);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if hanging
  setTimeout(() => {
    console.error('⚠️ [Server] Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 [Server] Uncaught Exception:', error);
  process.exit(1);
});
