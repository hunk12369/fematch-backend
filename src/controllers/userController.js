import prisma from '../services/prisma.js';

const VALID_GENDERS = ['FEMBOY', 'TRANS_FEM', 'TRANS_MASC', 'CROSSDRESSER', 'OTHER'];

/**
 * Helper para calcular la edad a partir de birthDate
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
 * GET /api/user/me
 * Consulta la tabla User por req.telegramUser.id.
 * Si no existe en la base de datos, devuelve { isNewUser: true, telegramUser: req.telegramUser }.
 * Si existe, devuelve el perfil completo con sus fotos y preferencias.
 */
export async function getMe(req, res, next) {
  try {
    const telegramUser = req.telegramUser;

    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram user session found',
      });
    }

    // 1. Buscar usuario en PostgreSQL por su telegramId (BigInt)
    const user = await prisma.user.findUnique({
      where: {
        telegramId: BigInt(telegramUser.id),
      },
      include: {
        photos: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            url: true,
            orderIndex: true,
            createdAt: true,
          },
        },
        preference: true,
      },
    });

    // 2. Si no existe en la base de datos -> Retornar inmediatamente isNewUser: true con data: null
    if (!user) {
      return res.status(200).json({
        success: true,
        isNewUser: true,
        data: null,
      });
    }

    // 3. Si el usuario existe pero no ha completado campos obligatorios de perfil (ej. genderIdentity o birthDate)
    const isProfileIncomplete = !user.genderIdentity || !user.birthDate;

    // 4. Devolver perfil completo
    return res.status(200).json({
      success: true,
      isNewUser: false,
      isProfileIncomplete,
      data: {
        user: {
          ...user,
          age: calculateAge(user.birthDate),
        },
        telegramUser,
      },
    });
  } catch (error) {
    console.error('[User Me Error]:', error);
    next(error);
  }
}

/**
 * POST /api/user/onboarding
 * Recibe gender_identity, birth_date, bio, city y preferencias iniciales (target_genders, min_age, max_age, max_distance_km).
 * Crea o actualiza el registro en User y Preference en una transacción atómica de Prisma.
 */
export async function completeOnboarding(req, res, next) {
  try {
    console.log('[Onboarding Attempt] TelegramUser:', JSON.stringify(req.telegramUser));
    console.log('[Onboarding Attempt] Body Payload:', JSON.stringify(req.body));

    const telegramUser = req.telegramUser;

    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    // Extraer y sanear datos de Telegram (soporte para cuentas sin username o nombres vacíos)
    const telegramId = BigInt(telegramUser.id);
    const firstName = telegramUser.first_name ? String(telegramUser.first_name).trim() : 'Usuario';
    const username = telegramUser.username ? String(telegramUser.username).trim() : null;

    const {
      gender_identity,
      genderIdentity = gender_identity,
      birth_date,
      birthDate = birth_date,
      bio = '',
      city = null,
      latitude = null,
      longitude = null,
      target_genders,
      targetGenders = target_genders || [],
      min_age,
      minAge = min_age || 18,
      max_age,
      maxAge = max_age || 99,
      max_distance_km,
      maxDistanceKm = max_distance_km || 50,
    } = req.body;

    // 1. Validaciones de género
    if (!genderIdentity || !VALID_GENDERS.includes(genderIdentity)) {
      return res.status(400).json({
        success: false,
        error: `gender_identity inválido. Valores permitidos: ${VALID_GENDERS.join(', ')}`,
      });
    }

    // 2. Validaciones de fecha de nacimiento y mayoría de edad (+18)
    if (!birthDate) {
      return res.status(400).json({
        success: false,
        error: 'birth_date es obligatorio (formato YYYY-MM-DD)',
      });
    }

    const parsedBirthDate = new Date(birthDate);
    if (isNaN(parsedBirthDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'birth_date tiene un formato de fecha inválido',
      });
    }

    const calculatedAge = calculateAge(parsedBirthDate);
    if (calculatedAge === null || calculatedAge < 18) {
      return res.status(400).json({
        success: false,
        error: 'Debes ser mayor de 18 años para utilizar la aplicación',
      });
    }

    // 3. Sanear coordenadas GPS (parseFloat seguro o null)
    const parsedLatitude = (latitude !== null && latitude !== undefined && latitude !== '' && !isNaN(parseFloat(latitude)))
      ? parseFloat(latitude)
      : null;

    const parsedLongitude = (longitude !== null && longitude !== undefined && longitude !== '' && !isNaN(parseFloat(longitude)))
      ? parseFloat(longitude)
      : null;

    // 4. Validar y sanear preferencias de búsqueda
    const sanitizedTargetGenders = Array.isArray(targetGenders)
      ? targetGenders.filter((g) => VALID_GENDERS.includes(g))
      : [];

    const sanitizedMinAge = Math.max(18, parseInt(minAge, 10) || 18);
    const sanitizedMaxAge = Math.min(99, Math.max(sanitizedMinAge, parseInt(maxAge, 10) || 99));
    const sanitizedMaxDistance = Math.min(500, Math.max(1, parseInt(maxDistanceKm, 10) || 50));

    // 5. Ejecutar transacción atómica de Prisma
    const result = await prisma.$transaction(async (tx) => {
      // Upsert de Usuario con datos de Telegram + datos de Onboarding
      const user = await tx.user.upsert({
        where: {
          telegramId,
        },
        update: {
          firstName,
          username,
          genderIdentity,
          birthDate: parsedBirthDate,
          bio: bio ? String(bio).trim().slice(0, 500) : null,
          city: city ? String(city).trim().slice(0, 100) : null,
          latitude: parsedLatitude,
          longitude: parsedLongitude,
        },
        create: {
          telegramId,
          firstName,
          username,
          genderIdentity,
          birthDate: parsedBirthDate,
          bio: bio ? String(bio).trim().slice(0, 500) : null,
          city: city ? String(city).trim().slice(0, 100) : null,
          latitude: parsedLatitude,
          longitude: parsedLongitude,
        },
      });

      // Upsert de Preferencias asociadas al usuario
      const preference = await tx.preference.upsert({
        where: {
          userId: user.id,
        },
        update: {
          targetGenders: sanitizedTargetGenders.length > 0 ? sanitizedTargetGenders : VALID_GENDERS,
          minAge: sanitizedMinAge,
          maxAge: sanitizedMaxAge,
          maxDistanceKm: sanitizedMaxDistance,
        },
        create: {
          userId: user.id,
          targetGenders: sanitizedTargetGenders.length > 0 ? sanitizedTargetGenders : VALID_GENDERS,
          minAge: sanitizedMinAge,
          maxAge: sanitizedMaxAge,
          maxDistanceKm: sanitizedMaxDistance,
        },
      });

      // Obtener fotos si existen
      const photos = await tx.userPhoto.findMany({
        where: { userId: user.id },
        orderBy: { orderIndex: 'asc' },
      });

      return {
        user: {
          ...user,
          age: calculatedAge,
        },
        preference,
        photos,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Onboarding completado exitosamente',
      isNewUser: false,
      data: result,
    });
  } catch (error) {
    const errorMessage = error.meta?.message || error.message || 'Error desconocido en base de datos';
    console.error('[Onboarding Catch Error]:', error);
    return res.status(error.status || 400).json({
      success: false,
      error: errorMessage,
      details: error.meta || null,
    });
  }
}

export default {
  getMe,
  completeOnboarding,
};
