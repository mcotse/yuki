// Authentication utilities for API endpoints

/**
 * Get the allowed origins for CORS
 * In production, this should be set via environment variable
 * @returns {string[]} Array of allowed origins
 */
export function getAllowedOrigins() {
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) {
    return origins.split(',').map(o => o.trim()).filter(Boolean);
  }
  // Default to allowing the Vercel deployment URL
  return [];
}

/**
 * Check if the request origin is allowed
 * @param {string} origin - The Origin header value
 * @returns {boolean}
 */
export function isOriginAllowed(origin) {
  if (!origin) return false;

  const allowed = getAllowedOrigins();

  // If no origins configured, allow any (development mode)
  if (allowed.length === 0) {
    console.warn('[Auth] No ALLOWED_ORIGINS configured, allowing all origins');
    return true;
  }

  return allowed.includes(origin);
}

/**
 * Validate API key for write operations
 * @param {object} req - The request object
 * @returns {boolean}
 */
export function validateApiKey(req) {
  const apiKey = process.env.API_SECRET;

  // If no API key configured, skip validation (development mode)
  if (!apiKey) {
    console.warn('[Auth] No API_SECRET configured, skipping API key validation');
    return true;
  }

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader === `Bearer ${apiKey}`) {
    return true;
  }

  // Check X-API-Key header
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey && xApiKey === apiKey) {
    return true;
  }

  return false;
}

/**
 * Set secure CORS headers on the response
 * @param {object} req - The request object
 * @param {object} res - The response object
 * @param {string[]} allowedMethods - Allowed HTTP methods
 */
export function setCorsHeaders(req, res, allowedMethods = ['GET', 'OPTIONS']) {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();

  // Set allowed origin
  if (allowed.length === 0 || isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Check if the current environment is production
 * @returns {boolean}
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}
