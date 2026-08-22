import prisma from '../services/prisma.js';

/**
 * Helper to calculate age from birthDate
 */
function calculateAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * GET /api/feed
 * Devuelve perfiles activos filtrados según las preferencias del usuario autenticado,
 * excluyendo perfiles a los que ya dio swipe y a sí mismo.
 */
export async function getFeed(req, res, next) {
  try {
    const telegramId = req.telegramUser?.id;

    if (!telegramId) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    // 1. Obtener usuario autenticado y sus preferencias
    const currentUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: { preference: true },
    });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found. Please sync user first via /api/auth/telegram',
      });
    }

    // 2. Obtener lista de IDs de usuarios a los que ya dio swipe
    const userSwipes = await prisma.swipe.findMany({
      where: { fromUserId: currentUser.id },
      select: { toUserId: true },
    });

    const excludedUserIds = [
      currentUser.id,
      ...userSwipes.map((swipe) => swipe.toUserId),
    ];

    // 3. Parámetros de paginación (Límite por defecto: 20 perfiles)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // 4. Construcción dinámica de filtros basados en Preference
    const preference = currentUser.preference;
    const whereConditions = {
      id: { notIn: excludedUserIds },
    };

    // Filtro por identidades de género deseadas
    if (preference?.targetGenders && preference.targetGenders.length > 0) {
      whereConditions.genderIdentity = {
        in: preference.targetGenders,
      };
    }

    // Filtro por rango de edad basado en birthDate
    if (preference?.minAge || preference?.maxAge) {
      const now = new Date();
      const minAge = preference.minAge || 18;
      const maxAge = preference.maxAge || 99;

      // birthDate más reciente permitido (para minAge)
      const maxBirthDate = new Date(
        now.getFullYear() - minAge,
        now.getMonth(),
        now.getDate()
      );

      // birthDate más antiguo permitido (para maxAge)
      const minBirthDate = new Date(
        now.getFullYear() - maxAge - 1,
        now.getMonth(),
        now.getDate()
      );

      whereConditions.birthDate = {
        gte: minBirthDate,
        lte: maxBirthDate,
      };
    }

    // 5. Consulta en base de datos priorizando VIPs y perfiles más recientes
    const [totalMatching, users] = await prisma.$transaction([
      prisma.user.count({ where: whereConditions }),
      prisma.user.findMany({
        where: whereConditions,
        select: {
          id: true,
          username: true,
          firstName: true,
          birthDate: true,
          genderIdentity: true,
          bio: true,
          city: true,
          isVerified: true,
          isVip: true,
          createdAt: true,
          photos: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              url: true,
              orderIndex: true,
            },
          },
        },
        orderBy: [
          { isVip: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
    ]);

    // 6. Formatear salida con cálculo de edad
    const profiles = users.map((user) => ({
      ...user,
      age: calculateAge(user.birthDate),
    }));

    return res.json({
      success: true,
      data: {
        profiles,
        pagination: {
          page,
          limit,
          total: totalMatching,
          totalPages: Math.ceil(totalMatching / limit),
          hasMore: skip + profiles.length < totalMatching,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/swipe
 * Registra un swipe (LIKE, DISLIKE, SUPERLIKE).
 * Si es LIKE/SUPERLIKE y existe coincidencia mutua, crea un Match en una transacción atómica.
 */
export async function handleSwipe(req, res, next) {
  try {
    const telegramId = req.telegramUser?.id;
    const { targetUserId, type } = req.body;

    if (!telegramId) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    // Validación de entrada
    if (!targetUserId || !type) {
      return res.status(400).json({
        success: false,
        error: 'Fields "targetUserId" and "type" are required',
      });
    }

    const validTypes = ['LIKE', 'DISLIKE', 'SUPERLIKE'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid swipe type "${type}". Allowed values: ${validTypes.join(', ')}`,
      });
    }

    // 1. Obtener usuario actual
    const currentUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, firstName: true, username: true },
    });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found. Please sync user first',
      });
    }

    if (currentUser.id === targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot swipe on yourself',
      });
    }

    // 2. Transacción Atómica de Prisma
    const transactionResult = await prisma.$transaction(async (tx) => {
      // Verificar que el usuario objetivo existe
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          firstName: true,
          username: true,
          photos: {
            take: 1,
            orderBy: { orderIndex: 'asc' },
            select: { url: true },
          },
        },
      });

      if (!targetUser) {
        throw { status: 404, message: 'Target user not found' };
      }

      // Upsert del swipe del usuario actual
      const currentSwipe = await tx.swipe.upsert({
        where: {
          uq_from_to_swipe: {
            fromUserId: currentUser.id,
            toUserId: targetUserId,
          },
        },
        update: {
          type,
          createdAt: new Date(),
        },
        create: {
          fromUserId: currentUser.id,
          toUserId: targetUserId,
          type,
        },
      });

      // Si es LIKE o SUPERLIKE, comprobar si el otro usuario ya había dado LIKE / SUPERLIKE
      const isPositiveSwipe = type === 'LIKE' || type === 'SUPERLIKE';

      if (isPositiveSwipe) {
        const previousReciprocalSwipe = await tx.swipe.findUnique({
          where: {
            uq_from_to_swipe: {
              fromUserId: targetUserId,
              toUserId: currentUser.id,
            },
          },
        });

        const isReciprocalPositive =
          previousReciprocalSwipe &&
          (previousReciprocalSwipe.type === 'LIKE' || previousReciprocalSwipe.type === 'SUPERLIKE');

        if (isReciprocalPositive) {
          // Orden determinista de IDs (userAId < userBId) para garantizar unicidad sin race conditions
          const [userAId, userBId] = [currentUser.id, targetUserId].sort();

          const match = await tx.match.upsert({
            where: {
              uq_user_a_user_b_match: {
                userAId,
                userBId,
              },
            },
            update: {
              isActive: true,
            },
            create: {
              userAId,
              userBId,
              isActive: true,
            },
          });

          return {
            match: true,
            matchId: match.id,
            matchedAt: match.matchedAt,
            matchedUser: {
              id: targetUser.id,
              firstName: targetUser.firstName,
              username: targetUser.username,
              photoUrl: targetUser.photos[0]?.url || null,
            },
            swipe: currentSwipe,
          };
        }
      }

      return {
        match: false,
        swipe: currentSwipe,
      };
    });

    return res.status(200).json({
      success: true,
      ...transactionResult,
    });
  } catch (error) {
    next(error);
  }
}
