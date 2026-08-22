import { Router } from 'express';
import { telegramAuth } from '../middlewares/telegramAuth.js';
import { validateAndSyncUser, getCurrentUser } from '../controllers/authController.js';

const router = Router();

// Protect all auth routes with telegramAuth middleware
router.use(telegramAuth());

// POST /api/auth/telegram - Validate initData and upsert user in database
router.post('/telegram', validateAndSyncUser);

// GET /api/auth/me - Return the currently authenticated Telegram user
router.get('/me', getCurrentUser);

export default router;
