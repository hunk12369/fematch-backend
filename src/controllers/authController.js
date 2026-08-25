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

    // 1. Buscar si el usuario ya existe en PostgreSQL
    const existingUser = await prisma.user.findUnique({
      where: {
        telegramId: BigInt(telegramUser.id),
      },
      include: {
        photos: {
          orderBy: { orderIndex: 'asc' },
        },
        preference: true,
      },
    });

    // 2. Si no existe en la BD -> Retornar isNewUser: true para disparar onboarding
    if (!existingUser) {
      return res.json({
        success: true,
        isNewUser: true,
        data: {
          telegramUser,
        },
      });
    }

    // 3. Si existe, comprobar si completó el perfil
    const isProfileIncomplete = !existingUser.genderIdentity || !existingUser.birthDate;

    return res.json({
      success: true,
      message: 'Telegram authentication successful',
      isNewUser: isProfileIncomplete,
      isProfileIncomplete,
      data: {
        user: existingUser,
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
