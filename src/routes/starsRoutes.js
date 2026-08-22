import { Router } from 'express';
import { telegramAuth } from '../middlewares/telegramAuth.js';
import {
  createInvoiceLinkHandler,
  webhookHandler,
} from '../controllers/starsController.js';

const router = Router();

/**
 * POST /api/stars/create-invoice-link
 * Endpoint consumido por la Mini App para generar el enlace de pago oficial de Telegram Stars.
 * Protegido por el middleware de validación criptográfica de initData.
 */
router.post('/create-invoice-link', telegramAuth(), createInvoiceLinkHandler);

/**
 * POST /api/stars/webhook
 * Webhook de Telegram Bot API para procesar pre_checkout_query y successful_payment.
 * Llamado directamente por los servidores de Telegram.
 */
router.post('/webhook', webhookHandler);

export default router;
