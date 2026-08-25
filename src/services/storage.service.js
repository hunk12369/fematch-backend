import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';

/**
 * Cliente de S3 configurado para el endpoint de Cloudflare R2
 */
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Obtiene la extensión recomendada a partir del tipo MIME
 */
function getExtensionFromMime(mimeType, originalName = '') {
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

  if (mimeMap[mimeType]) {
    return mimeMap[mimeType];
  }

  const ext = path.extname(originalName).toLowerCase();
  return ext || '.jpg';
}

/**
 * Extrae la clave (key) de R2 si se proporciona una URL pública completa
 */
export function extractKeyFromUrl(urlOrKey) {
  if (!urlOrKey) return '';
  if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
    return urlOrKey;
  }

  try {
    const parsed = new URL(urlOrKey);
    // Elimina el slash inicial del pathname (/users/123/file.webp -> users/123/file.webp)
    return parsed.pathname.replace(/^\/+/, '');
  } catch {
    return urlOrKey;
  }
}

/**
 * Genera la URL pública accesible para una foto de perfil
 */
export function getPublicUrl(key) {
  if (!key) return '';
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }

  const cleanKey = key.replace(/^\/+/, '');
  const domain = (env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');

  if (domain) {
    return `${domain}/${cleanKey}`;
  }

  // Fallback si no se define dominio personalizado: endpoint directo R2
  return `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${cleanKey}`;
}

/**
 * Sube un buffer de imagen a Cloudflare R2
 * 
 * @param {Object} params
 * @param {Buffer} params.buffer - Búfer de la imagen
 * @param {string} params.mimeType - Tipo MIME (ej. 'image/webp', 'image/jpeg')
 * @param {string} [params.folder='photos'] - Subdirectorio de destino
 * @param {string} [params.userId='common'] - ID del usuario propietario
 * @param {string} [params.originalName] - Nombre original del archivo para inferir extensión
 * @returns {Promise<{ key: string, url: string, bucket: string, size: number }>}
 */
export async function uploadImageBuffer({
  buffer,
  mimeType,
  folder = 'photos',
  userId = 'anonymous',
  originalName = '',
}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid image buffer provided for upload');
  }

  const ext = getExtensionFromMime(mimeType, originalName);
  const randomHash = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  const key = `users/${userId}/${folder}/${timestamp}_${randomHash}${ext}`;

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    // Caché inmutable por 1 año para optimización de CDN
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: {
      userId: String(userId),
      uploadedAt: new Date().toISOString(),
    },
  });

  await r2Client.send(command);

  const url = getPublicUrl(key);

  return {
    key,
    url,
    bucket: env.R2_BUCKET_NAME,
    size: buffer.length,
    mimeType,
  };
}

/**
 * Genera una URL prefirmada de lectura temporal (por ejemplo para contenido privado)
 * 
 * @param {string} keyOrUrl - Clave del objeto o URL completa
 * @param {number} [expiresInSeconds=3600] - Tiempo de validez en segundos
 * @returns {Promise<string>}
 */
export async function getPresignedReadUrl(keyOrUrl, expiresInSeconds = 3600) {
  const key = extractKeyFromUrl(keyOrUrl);

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Elimina una imagen de Cloudflare R2
 * 
 * @param {string} keyOrUrl - Clave del objeto o URL completa almacenada en base de datos
 * @returns {Promise<{ success: boolean, key: string }>}
 */
export async function deleteImage(keyOrUrl) {
  const key = extractKeyFromUrl(keyOrUrl);

  if (!key) {
    return { success: false, key: '' };
  }

  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);

  return { success: true, key };
}

export default {
  r2Client,
  uploadImageBuffer,
  getPublicUrl,
  getPresignedReadUrl,
  deleteImage,
  extractKeyFromUrl,
};
