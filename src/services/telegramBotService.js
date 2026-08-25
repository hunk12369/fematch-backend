import crypto from 'node:crypto';
import { env } from '../config/env.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Genera un payload compacto firmado con HMAC-SHA256 (<= 128 bytes requeridos por Telegram).
 * Formato: `${userId}:${itemType}:${timestampInSeconds}:${signatureHex32}` (longitud aprox. 92 bytes)
 */
export function generateSignedPayload({ userId, itemType }) {
  if (!userId || !itemType) {
    throw new Error('userId and itemType are required to generate invoice payload');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const dataString = `${userId}:${itemType}:${timestamp}`;
  
  // Truncado a 16 bytes (32 caracteres hexadecimales) para no exceder 128 bytes
  const signature = crypto
    .createHmac('sha256', env.TELEGRAM_BOT_TOKEN)
    .update(dataString)
    .digest('hex')
    .slice(0, 32);

  const payload = `${dataString}:${signature}`;

  if (Buffer.byteLength(payload, 'utf8') > 128) {
    throw new Error(`Invoice payload exceeds Telegram 128 bytes limit (${payload.length} bytes)`);
  }

  return payload;
}

/**
 * Verifica y deserializa el payload compacto firmado.
 */
export function verifySignedPayload(payload) {
  try {
    if (!payload || typeof payload !== 'string') {
      return { valid: false, error: 'Empty or invalid payload' };
    }

    const parts = payload.split(':');
    if (parts.length !== 4) {
      return { valid: false, error: 'Malformed payload structure' };
    }

    const [userId, itemType, timestampStr, receivedSig] = parts;
    const dataString = `${userId}:${itemType}:${timestampStr}`;

    const expectedSig = crypto
      .createHmac('sha256', env.TELEGRAM_BOT_TOKEN)
      .update(dataString)
      .digest('hex')
      .slice(0, 32);

    const signatureBuffer = Buffer.from(receivedSig, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { valid: false, error: 'Invalid payload signature' };
    }

    return {
      valid: true,
      data: {
        userId,
        itemType,
        timestamp: parseInt(timestampStr, 10),
      },
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Llama al método createInvoiceLink de Telegram Bot API para moneda 'XTR' (Telegram Stars).
 */
export async function createStarsInvoiceLink({ title, description, payload, starsAmount }) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  if (!payload || Buffer.byteLength(payload, 'utf8') > 128) {
    throw new Error(`Payload must be between 1 and 128 bytes (current: ${Buffer.byteLength(payload || '', 'utf8')} bytes)`);
  }

  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`;

  const body = {
    title: title.slice(0, 32), // Máx 32 caracteres permitidos por Telegram
    description: description.slice(0, 255), // Máx 255 caracteres permitidos por Telegram
    payload,
    provider_token: '', // Cadena vacía obligatoria para pagos en Telegram Stars
    currency: 'XTR', // Moneda oficial para Telegram Stars
    prices: [
      {
        label: title.slice(0, 32),
        amount: Number(starsAmount), // En Stars el monto es un entero exacto (1 Star = 1 XTR)
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Telegram API createInvoiceLink failed: ${data.description || 'Unknown error'}`);
  }

  return data.result; // URL de la factura lista para Telegram.WebApp.openInvoice
}

/**
 * Responde a una pre_checkout_query. Obligatorio responder en menos de 10 segundos.
 */
export async function answerPreCheckoutQuery(preCheckoutQueryId, ok = true, errorMessage = '') {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/answerPreCheckoutQuery`;

  const body = {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(errorMessage && !ok ? { error_message: errorMessage } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error(`[answerPreCheckoutQuery] Failed: ${data.description}`);
  }

  return data;
}

/**
 * Envía un mensaje informativo de confirmación al chat del usuario en Telegram.
 */
export async function sendTelegramMessage(chatId, text) {
  try {
    const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (error) {
    console.error('[sendTelegramMessage] Error sending notification:', error);
  }
}
