import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = ['TELEGRAM_BOT_TOKEN'];

if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push(
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_DOMAIN'
  );
}

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

  // Cloudflare R2 Configuration
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'fematch-photos',
  R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN || '',
};
