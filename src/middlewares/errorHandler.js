import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
}
