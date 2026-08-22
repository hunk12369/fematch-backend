/**
 * Catálogo de productos disponibles para compra con Telegram Stars (XTR)
 */
export const STARS_PRODUCTS = {
  VIP_MONTHLY: {
    itemType: 'VIP_MONTHLY',
    title: 'Membresía VIP (1 Mes)',
    description: 'Insignia VIP dorada, likes ilimitados y prioridad en el feed de descubrimiento.',
    starsAmount: 250, // Cantidad en Stars (XTR)
    durationDays: 30,
  },
  BOOST: {
    itemType: 'BOOST',
    title: 'Super Boost (24 Horas)',
    description: 'Coloca tu perfil en las primeras posiciones del feed de tu ciudad por 24 horas.',
    starsAmount: 75,
  },
  SUPERLIKE: {
    itemType: 'SUPERLIKE',
    title: 'Pack de 5 Superlikes',
    description: 'Envía 5 Superlikes para destacar de forma instantánea ante tus perfiles favoritos.',
    starsAmount: 50,
  },
};
