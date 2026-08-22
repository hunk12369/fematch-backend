import prisma from '../services/prisma.js';

export async function validateAndSyncUser(req, res, next) {
  try {
    const telegramUser = req.telegramUser;

    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({
        success: false,
        error: 'No Telegram user profile found in initData',
      });
    }

    // Upsert user in database via Prisma
    const user = await prisma.user.upsert({
      where: {
        telegramId: BigInt(telegramUser.id),
      },
      update: {
        firstName: telegramUser.first_name || '',
        lastName: telegramUser.last_name || null,
        username: telegramUser.username || null,
        languageCode: telegramUser.language_code || null,
        isPremium: Boolean(telegramUser.is_premium),
        allowsWriteToPm: Boolean(telegramUser.allows_write_to_pm),
      },
      create: {
        telegramId: BigInt(telegramUser.id),
        firstName: telegramUser.first_name || '',
        lastName: telegramUser.last_name || null,
        username: telegramUser.username || null,
        languageCode: telegramUser.language_code || null,
        isPremium: Boolean(telegramUser.is_premium),
        allowsWriteToPm: Boolean(telegramUser.allows_write_to_pm),
      },
    });

    return res.json({
      success: true,
      message: 'Telegram authentication successful',
      data: {
        user,
        telegramUser,
      },
    });
  } catch (error) {
    next(error);
  }
}

export function getCurrentUser(req, res) {
  return res.json({
    success: true,
    data: {
      telegramUser: req.telegramUser,
      initData: req.telegramInitData,
    },
  });
}
