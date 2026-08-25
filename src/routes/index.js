import { Router } from 'express';
import authRoutes from './authRoutes.js';
import swipeRoutes from './swipeRoutes.js';
import starsRoutes from './starsRoutes.js';
import userRoutes from './userRoutes.js';

const apiRouter = Router();

// Autenticación y perfil Telegram (/api/auth/...)
apiRouter.use('/auth', authRoutes);

// Gestión de usuario y fotos (/api/user/photos, ...)
apiRouter.use('/user', userRoutes);

// Feed y Swipes (/api/feed, /api/swipe)
apiRouter.use('/', swipeRoutes);

// Pagos con Telegram Stars (/api/stars/create-invoice-link, /api/stars/webhook)
apiRouter.use('/stars', starsRoutes);

export default apiRouter;
