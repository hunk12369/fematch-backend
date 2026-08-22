import { Router } from 'express';
import { telegramAuth } from '../middlewares/telegramAuth.js';
import { getFeed, handleSwipe } from '../controllers/swipeController.js';

const router = Router();

// Todas las rutas de feed y swipes requieren autenticación de Telegram
router.use(telegramAuth());

/**
 * GET /api/feed
 * Obtiene el feed de candidatos para swipear
 */
router.get('/feed', getFeed);

/**
 * POST /api/swipe
 * Realiza un swipe sobre un usuario objetivo
 */
router.post('/swipe', handleSwipe);

export default router;
