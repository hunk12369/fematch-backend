import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

// Security Headers
app.use(helmet());

// CORS Configuration (Habilitado para Vite dev server: 5173 / 4173 y orígenes configurados)
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'https://web.telegram.org',
];

const configuredOrigins =
  env.CORS_ORIGIN && env.CORS_ORIGIN !== '*'
    ? env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [];

export const allowedOrigins = Array.from(
  new Set([...defaultAllowedOrigins, ...configuredOrigins])
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir peticiones sin header Origin (server-to-server, webhooks, mobile apps nativas, curl)
      if (!origin) return callback(null, true);

      // Si coincide con los orígenes permitidos
      if (env.CORS_ORIGIN === '*' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // En desarrollo, permitir túneles y cualquier IP local (útil para pruebas en dispositivos móviles)
      if (
        !env.isProduction &&
        (origin.endsWith('.ngrok-free.app') ||
          origin.endsWith('.trycloudflare.com') ||
          origin.endsWith('.loca.lt') ||
          /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }

      callback(new Error(`Bloqueado por CORS: El origen ${origin} no tiene acceso permitido.`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data'],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Body Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api', apiRouter);

// Fallback & Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
