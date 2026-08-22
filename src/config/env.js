import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = ['TELEGRAM_BOT_TOKEN'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`[WARNING] Missing environment variable: ${envVar}`);
  }
}

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  isProduction: process.env.NODE_ENV === 'production',
};
