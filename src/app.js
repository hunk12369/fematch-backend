import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

// Security Headers
app.use(helmet());

// CORS Configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data'],
    credentials: true,
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
