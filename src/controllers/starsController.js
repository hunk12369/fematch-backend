import prisma from '../services/prisma.js';
import { STARS_PRODUCTS } from '../config/starsProducts.js';
import {
  createStarsInvoiceLink,
  generateSignedPayload,
  verifySignedPayload,
  answerPreCheckoutQuery,
  sendTelegramMessage,
} from '../services/telegramBotService.js';

/**
 * POST /api/stars/create-invoice-link
 * Genera un enlace de pago en Telegram Stars (XTR) para ser consumido por Telegram.WebApp.openInvoice.
 */
export async function createInvoiceLinkHandler(req, res, next) {
  try {
    const telegramId = req.telegramUser?.id;
    const { itemType } = req.body;

    if (!telegramId) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    if (!itemType || !STARS_PRODUCTS[itemType]) {
      return res.status(400).json({
        success: false,
        error: `Invalid or missing itemType. Allowed values: ${Object.keys(STARS_PRODUCTS).join(', ')}`,
      });
    }

    // 1. Obtener usuario de la base de datos
    const currentUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, telegramId: true, firstName: true },
    });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found. Please sync user first',
      });
    }

    const product = STARS_PRODUCTS[itemType];

    // 2. Generar payload firmado criptográficamente (máx 128 bytes)
    const signedPayload = generateSignedPayload({
      userId: currentUser.id,
      itemType: product.itemType,
    });

    // 3. Crear enlace de factura oficial de Telegram Stars (XTR)
    const invoiceLink = await createStarsInvoiceLink({
      title: product.title,
      description: product.description,
      payload: signedPayload,
      starsAmount: product.starsAmount,
    });

    return res.status(200).json({
      success: true,
      data: {
        invoiceLink,
        product: {
          itemType: product.itemType,
          title: product.title,
          starsAmount: product.starsAmount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/stars/webhook
 * Procesa actualizaciones de Telegram Bot API (pre_checkout_query y successful_payment).
 */
export async function webhookHandler(req, res, next) {
  try {
    const update = req.body;

    // ------------------------------------------------------------------------
    // 1. Manejo de PRE_CHECKOUT_QUERY (Respuesta obligatoria < 10 segundos)
    // ------------------------------------------------------------------------
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const { id: queryId, invoice_payload: payloadBase64, currency, total_amount } = query;

      // Validar que la moneda sea Stars (XTR)
      if (currency !== 'XTR') {
        await answerPreCheckoutQuery(queryId, false, 'Solo se aceptan pagos en Telegram Stars (XTR)');
        return res.status(200).json({ ok: true });
      }

      // Validar la firma del payload
      const verification = verifySignedPayload(payloadBase64);
      if (!verification.valid) {
        console.error('[Stars Webhook] Invalid pre_checkout_query payload signature:', verification.error);
        await answerPreCheckoutQuery(queryId, false, 'Firma de la orden no válida o expirada');
        return res.status(200).json({ ok: true });
      }

      // Validar que el monto coincida con el producto
      const payloadData = verification.data;
      const product = STARS_PRODUCTS[payloadData.itemType];

      if (!product || product.starsAmount !== total_amount) {
        await answerPreCheckoutQuery(queryId, false, 'El monto en Stars no coincide con el producto seleccionado');
        return res.status(200).json({ ok: true });
      }

      // Aprobar el checkout para que Telegram proceda con el cobro
      await answerPreCheckoutQuery(queryId, true);
      return res.status(200).json({ ok: true });
    }

    // ------------------------------------------------------------------------
    // 2. Manejo de SUCCESSFUL_PAYMENT (Cobro completado exitosamente)
    // ------------------------------------------------------------------------
    const successfulPayment = update.message?.successful_payment;

    if (successfulPayment) {
      const {
        currency,
        total_amount,
        invoice_payload: payloadBase64,
        telegram_payment_charge_id: chargeId,
      } = successfulPayment;

      const chatId = update.message.chat.id;

      // Validar firma del payload
      const verification = verifySignedPayload(payloadBase64);
      if (!verification.valid) {
        console.error('[Stars Webhook] Tampered payload in successful_payment:', verification.error);
        return res.status(200).json({ ok: true });
      }

      const { userId, itemType } = verification.data;

      // Ejecutar actualización de estado del usuario y registro de transacción atómica
      await prisma.$transaction(async (tx) => {
        // 1. Registrar o confirmar la transacción de Stars con idempotencia
        await tx.starTransaction.upsert({
          where: { telegramPaymentChargeId: chargeId },
          update: {
            status: 'COMPLETED',
            rawPayload: update,
          },
          create: {
            telegramPaymentChargeId: chargeId,
            userId,
            starsAmount: total_amount,
            itemType,
            status: 'COMPLETED',
            rawPayload: update,
          },
        });

        // 2. Aplicar beneficios según el itemType
        if (itemType === 'VIP_MONTHLY') {
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { isVip: true, vipExpiresAt: true },
          });

          const now = new Date();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

          // Si el usuario ya era VIP y no ha expirado, extender fecha. Si no, calcular desde ahora.
          const baseDate = user?.vipExpiresAt && new Date(user.vipExpiresAt) > now
            ? new Date(user.vipExpiresAt)
            : now;

          const newExpiration = new Date(baseDate.getTime() + THIRTY_DAYS_MS);

          await tx.user.update({
            where: { id: userId },
            data: {
              isVip: true,
              vipExpiresAt: newExpiration,
            },
          });
        }
      });

      // Notificar al usuario a través del bot en Telegram
      const product = STARS_PRODUCTS[itemType];
      const notificationMessage = `⭐ <b>¡Pago exitoso recibido!</b>\n\n` +
        `Has adquirido: <b>${product ? product.title : itemType}</b> por <b>${total_amount} Stars ⭐</b>.\n` +
        `Tus beneficios ya se encuentran activos en la aplicación. ¡Que disfrutes la experiencia!`;

      await sendTelegramMessage(chatId, notificationMessage);

      return res.status(200).json({ ok: true });
    }

    // Respuesta por defecto para otros tipos de actualizaciones de Telegram
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Stars Webhook] Error processing webhook:', error);
    // Retornamos 200 a Telegram para evitar bucles de reintento en errores no recuperables
    return res.status(200).json({ ok: true });
  }
}
