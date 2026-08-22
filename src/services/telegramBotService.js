import crypto from 'node:crypto';
import { env } from '../config/env.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Genera un payload seguro y firmado con HMAC-SHA256 para evitar alteraciones en el proceso de pago.
 */
export function generateSignedPayload(data) {
  const serialized = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', env.TELEGRAM_BOT_TOKEN)
    .update(serialized)
    .digest('hex');

  // Retorna base64 url-safe del objeto junto con su firma
  const payloadObject = { data, signature };
  return Buffer.from(JSON.stringify(payloadObject)).toString('base64url');
}

/**
 * Verifica y deserializa un payload firmado.
 */
export function verifySignedPayload(payloadBase64Url) {
  try {
    const rawString = Buffer.from(payloadBase64Url, 'base64url').toString('utf-8');
    const { data, signature } = JSON.parse(rawString);

    const expectedSignature = crypto
      .createHmac('sha256', env.TELEGRAM_BOT_TOKEN)
      .update(JSON.stringify(data))
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { valid: false, error: 'Invalid payload signature' };
    }

    return { valid: true, data };
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

  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`;

  const body = {
    title,
    description,
    payload,
    currency: 'XTR', // Moneda requerida para Telegram Stars
    prices: [
      {
        label: title,
        amount: starsAmount, // En Stars el monto es un entero exacto (1 Star = 1)
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
