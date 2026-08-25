import { Router } from 'express';
import { telegramAuth } from '../middlewares/telegramAuth.js';
import { uploadSinglePhoto } from '../middlewares/upload.middleware.js';
import { getMe, completeOnboarding } from '../controllers/userController.js';
import {
  uploadUserPhoto,
  deleteUserPhoto,
  getUserPhotos,
} from '../controllers/userPhotoController.js';

const router = Router();

// Todas las rutas de usuario requieren validación criptográfica de initData
router.use(telegramAuth());

/**
 * GET /api/user/me
 * Obtiene el perfil completo con fotos y preferencias o { isNewUser: true } si no está registrado
 */
router.get('/me', getMe);

/**
 * POST /api/user/onboarding
 * Crea/actualiza el registro de User y Preference en una transacción de Prisma
 */
router.post('/onboarding', completeOnboarding);

/**
 * POST /api/user/photos
 * Sube una nueva foto a Cloudflare R2 y la guarda en la base de datos
 */
router.post('/photos', uploadSinglePhoto('photo'), uploadUserPhoto);

/**
 * GET /api/user/photos
 * Obtiene todas las fotos del usuario autenticado
 */
router.get('/photos', getUserPhotos);

/**
 * DELETE /api/user/photos/:photoId
 * Elimina una foto específica tanto de R2 como de la base de datos
 */
router.delete('/photos/:photoId', deleteUserPhoto);

export default router;
