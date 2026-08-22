import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Validates Telegram Mini App initData cryptographically.
 * 
 * Flow:
 * 1. Extract raw initData from Authorization header ('tma <initData>' or 'Bearer <initData>'),
 *    custom header 'x-telegram-init-data', or request body/query.
 * 2. Parse query parameters and extract 'hash' and 'auth_date'.
 * 3. Validate 'auth_date' within the max expiration window (24h).
 * 4. Build data-check-string from sorted key=value pairs (excluding 'hash').
 * 5. Generate HMAC-SHA256 secret key using bot token and 'WebAppData'.
 * 6. Compute HMAC-SHA256 of data-check-string and compare with crypto.timingSafeEqual.
 * 7. Parse user data and attach 'req.telegramUser' and 'req.telegramInitData'.
 */
export function telegramAuth(options = { maxAgeSeconds: 86400 }) {
  const { maxAgeSeconds = 86400 } = options; // Default: 24 hours

  return (req, res, next) => {
    try {
      const botToken = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        console.error('[telegramAuth] TELEGRAM_BOT_TOKEN is not configured.');
        return res.status(500).json({
          success: false,
          error: 'Server configuration error: Telegram Bot Token missing',
        });
      }

      // 1. Extract raw initData
      let rawInitData = '';
      const authHeader = req.headers['authorization'];

      if (authHeader) {
        const [scheme, credentials] = authHeader.split(' ');
        if (scheme && credentials && (scheme.toLowerCase() === 'tma' || scheme.toLowerCase() === 'bearer')) {
          rawInitData = credentials;
        } else {
          rawInitData = authHeader;
        }
      } else if (req.headers['x-telegram-init-data']) {
        rawInitData = req.headers['x-telegram-init-data'];
      } else if (req.body && req.body.initData) {
        rawInitData = req.body.initData;
      } else if (req.query && req.query.initData) {
        rawInitData = req.query.initData;
      }

      if (!rawInitData || typeof rawInitData !== 'string') {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Missing Telegram initData credentials',
        });
      }

      // 2. Parse URL encoded params
      const searchParams = new URLSearchParams(rawInitData);
      const receivedHash = searchParams.get('hash');
      const authDateStr = searchParams.get('auth_date');

      if (!receivedHash) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Missing hash in Telegram initData',
        });
      }

      if (!authDateStr) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Missing auth_date in Telegram initData',
        });
      }

      // 3. Verify expiration by auth_date
      const authDate = parseInt(authDateStr, 10);
      const currentTime = Math.floor(Date.now() / 1000);

      if (isNaN(authDate)) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid auth_date format',
        });
      }

      // Check max expiration (24h) and clock drift tolerance (+60s)
      if (currentTime - authDate > maxAgeSeconds || authDate > currentTime + 60) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Telegram initData session expired or timestamp invalid',
        });
      }

      // 4. Construct data-check-string (sort alphabetically, format 'key=value\n', exclude 'hash')
      const dataCheckPairs = [];
      for (const [key, value] of searchParams.entries()) {
        if (key !== 'hash') {
          dataCheckPairs.push(`${key}=${value}`);
        }
      }

      dataCheckPairs.sort((a, b) => a.localeCompare(b));
      const dataCheckString = dataCheckPairs.join('\n');

      // 5. Compute secret key = HMAC-SHA256("WebAppData", botToken)
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

      // 6. Compute signature = HMAC-SHA256(secretKey, dataCheckString)
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      // 7. Timing-safe comparison
      const receivedHashBuffer = Buffer.from(receivedHash, 'hex');
      const calculatedHashBuffer = Buffer.from(calculatedHash, 'hex');

      if (
        receivedHashBuffer.length !== calculatedHashBuffer.length ||
        !crypto.timingSafeEqual(receivedHashBuffer, calculatedHashBuffer)
      ) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid Telegram signature',
        });
      }

      // 8. Parse user and mount into request
      const rawUser = searchParams.get('user');
      let parsedUser = null;

      if (rawUser) {
        try {
          parsedUser = JSON.parse(rawUser);
        } catch {
          return res.status(400).json({
            success: false,
            error: 'Bad Request: Malformed user JSON in Telegram initData',
          });
        }
      }

      req.telegramUser = parsedUser;
      req.telegramInitData = Object.fromEntries(searchParams.entries());

      return next();
    } catch (error) {
      console.error('[telegramAuth] Error during validation:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal authentication error',
      });
    }
  };
}

export default telegramAuth;
