import prisma from '../services/prisma.js';
import { uploadImageBuffer, deleteImage } from '../services/storage.service.js';

const MAX_PHOTOS_PER_USER = 6;

/**
 * POST /api/user/photos
 * Sube una foto a Cloudflare R2 y guarda el registro en UserPhoto asociado al usuario autenticado.
 */
export async function uploadUserPhoto(req, res, next) {
  try {
    const telegramId = req.telegramUser?.id;

    if (!telegramId) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se ha proporcionado ningún archivo en el campo "photo".',
      });
    }

    // 1. Obtener usuario de la base de datos
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: {
        photos: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Perfil de usuario no encontrado. Sincroniza primero tu cuenta.',
      });
    }

    // 2. Validar límite máximo de fotos por usuario
    if (user.photos.length >= MAX_PHOTOS_PER_USER) {
      return res.status(400).json({
        success: false,
        error: `Has alcanzado el límite máximo de ${MAX_PHOTOS_PER_USER} fotos de perfil.`,
      });
    }

    // 3. Determinar el orderIndex seguro y dinámico para evitar colisiones P2002
    const existingIndexes = user.photos.map((p) => p.orderIndex);
    let finalOrderIndex = 0;

    if (req.body.orderIndex !== undefined && req.body.orderIndex !== null && req.body.orderIndex !== '') {
      const requestedIndex = parseInt(req.body.orderIndex, 10);
      // Si el índice solicitado ya está ocupado, buscar el siguiente índice libre disponible
      if (existingIndexes.includes(requestedIndex)) {
        while (existingIndexes.includes(finalOrderIndex)) {
          finalOrderIndex++;
        }
      } else {
        finalOrderIndex = requestedIndex;
      }
    } else {
      // Si no viene en la petición, calcular el siguiente slot libre disponible
      while (existingIndexes.includes(finalOrderIndex)) {
        finalOrderIndex++;
      }
    }

    // 4. Subir la imagen en búfer a Cloudflare R2
    const uploadResult = await uploadImageBuffer({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      folder: 'profile',
      userId: user.id,
      originalName: req.file.originalname,
    });

    // 5. Guardar o actualizar registro con upsert para evitar error P2002
    let savedPhoto;
    try {
      savedPhoto = await prisma.userPhoto.upsert({
        where: {
          uq_user_photo_order: {
            userId: user.id,
            orderIndex: finalOrderIndex,
          },
        },
        update: {
          url: uploadResult.url,
        },
        create: {
          userId: user.id,
          url: uploadResult.url,
          orderIndex: finalOrderIndex,
        },
      });
    } catch (p2002Error) {
      if (p2002Error.code === 'P2002') {
        // Reintento calculando el conteo actual de fotos
        const photoCount = await prisma.userPhoto.count({ where: { userId: user.id } });
        savedPhoto = await prisma.userPhoto.create({
          data: {
            userId: user.id,
            url: uploadResult.url,
            orderIndex: photoCount + 1,
          },
        });
      } else {
        throw p2002Error;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Foto de perfil subida y guardada exitosamente.',
      data: {
        photo: savedPhoto,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Conflicto: Ya existe una foto con ese orden de posición. Por favor, intenta de nuevo.',
      });
    }
    next(error);
  }
}

/**
 * DELETE /api/user/photos/:photoId
 * Elimina la foto de Cloudflare R2 y de la base de datos UserPhoto.
 */
export async function deleteUserPhoto(req, res, next) {
  try {
    const telegramId = req.telegramUser?.id;
    const { photoId } = req.params;

    if (!telegramId) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    // 1. Obtener usuario
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
    }

    // 2. Buscar la foto y verificar pertenencia al usuario
    const photo = await prisma.userPhoto.findFirst({
      where: {
        id: photoId,
        userId: user.id,
      },
    });

    if (!photo) {
      return res.status(404).json({
        success: false,
        error: 'Foto no encontrada o no pertenece a tu cuenta',
      });
    }

    // 3. Eliminar objeto de Cloudflare R2
    await deleteImage(photo.url);

    // 4. Eliminar registro de base de datos
    await prisma.userPhoto.delete({
      where: { id: photo.id },
    });

    return res.status(200).json({
      success: true,
      message: 'Foto eliminada correctamente de R2 y del perfil.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/user/photos
 * Devuelve la lista de fotos del usuario autenticado ordenadas por orderIndex.
 */
export async function getUserPhotos(req, res, next) {
  try {
    const telegramId = req.telegramUser?.id;

    if (!telegramId) {
      return res.status(401).json({
        success: false,
        error: 'No Telegram authentication context found',
      });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: {
        photos: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        photos: user.photos,
      },
    });
  } catch (error) {
    next(error);
  }
}

export default {
  uploadUserPhoto,
  deleteUserPhoto,
  getUserPhotos,
};
