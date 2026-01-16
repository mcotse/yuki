// Simple password wall authentication
// Uses HMAC-signed tokens stored in cookies

import crypto from 'crypto';

const COOKIE_NAME = 'yuki_auth';
const TOKEN_EXPIRY_DAYS = 7;

// Get the site password from env
function getSitePassword() {
  return process.env.SITE_PASSWORD;
}

// Get or generate a signing secret (uses SITE_PASSWORD + salt for simplicity)
function getSigningSecret() {
  const password = getSitePassword();
  if (!password) {
    throw new Error('SITE_PASSWORD environment variable not set');
  }
  // Use password + a fixed salt as the signing key
  return crypto.createHash('sha256').update(password + '_yuki_signing_key_v1').digest();
}

// Create a signed auth token
export function createAuthToken() {
  const secret = getSigningSecret();
  const expiresAt = Date.now() + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const payload = JSON.stringify({ expiresAt });
  const payloadBase64 = Buffer.from(payload).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

// Verify an auth token
export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'No token provided' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Invalid token format' };
  }

  const [payloadBase64, signature] = parts;

  try {
    const secret = getSigningSecret();

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadBase64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Decode and check expiry
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

    if (Date.now() > payload.expiresAt) {
      return { valid: false, reason: 'Token expired' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'Token verification failed' };
  }
}

// Verify the password
export function verifyPassword(password) {
  const sitePassword = getSitePassword();

  if (!sitePassword) {
    console.error('[Auth] SITE_PASSWORD not configured');
    return false;
  }

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(sitePassword)
    );
  } catch {
    // Lengths don't match
    return false;
  }
}

// Check if auth is required (returns false if SITE_PASSWORD not set)
export function isAuthRequired() {
  return !!getSitePassword();
}

// Get auth cookie options
export function getAuthCookieOptions() {
  return {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60 // in seconds
    }
  };
}

// Parse cookies from request
export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });

  return cookies;
}

// Check if request is authenticated
export function isAuthenticated(req) {
  // If no password configured, allow all requests
  if (!isAuthRequired()) {
    return { authenticated: true, reason: 'No password configured', shouldRefresh: false };
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];

  if (!token) {
    return { authenticated: false, reason: 'No auth cookie', shouldRefresh: false };
  }

  const result = verifyAuthToken(token);
  // Always refresh on authenticated activity (sliding expiration)
  return { authenticated: result.valid, reason: result.reason, shouldRefresh: result.valid };
}

// Middleware helper - returns 401 if not authenticated
// Also refreshes the cookie on each authenticated request (sliding expiration)
export function requireAuth(req, res) {
  const auth = isAuthenticated(req);

  if (!auth.authenticated) {
    res.status(401).json({
      error: 'Unauthorized',
      reason: auth.reason,
      loginRequired: true
    });
    return false;
  }

  // Refresh cookie on activity (sliding expiration - extends for another week)
  if (auth.shouldRefresh) {
    refreshAuthCookie(res);
  }

  return true;
}

// Set/refresh the auth cookie on response
export function refreshAuthCookie(res) {
  const token = createAuthToken();
  const { name, options } = getAuthCookieOptions();

  const cookieValue = `${name}=${token}; HttpOnly; Path=${options.path}; Max-Age=${options.maxAge}; SameSite=${options.sameSite}${options.secure ? '; Secure' : ''}`;

  res.setHeader('Set-Cookie', cookieValue);
}

// Clear the auth cookie (logout)
export function clearAuthCookie(res) {
  const { name } = getAuthCookieOptions();
  res.setHeader('Set-Cookie', `${name}=; HttpOnly; Path=/; Max-Age=0`);
}

export { COOKIE_NAME };
