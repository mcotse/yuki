// Authentication API endpoint
// POST - login with password
// DELETE - logout
// GET - check auth status

import { verifyPassword, isAuthenticated, refreshAuthCookie, clearAuthCookie, isAuthRequired } from '../src/lib/auth.js';

export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  // No CORS headers needed for auth - same origin only
  // But we need to allow credentials
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - check if authenticated
  if (req.method === 'GET') {
    const authRequired = isAuthRequired();

    if (!authRequired) {
      return res.status(200).json({
        authenticated: true,
        authRequired: false,
        message: 'No password configured - auth disabled'
      });
    }

    const auth = isAuthenticated(req);

    // Refresh cookie on status check if authenticated
    if (auth.authenticated && auth.shouldRefresh) {
      refreshAuthCookie(res);
    }

    return res.status(200).json({
      authenticated: auth.authenticated,
      authRequired: true
    });
  }

  // POST - login
  if (req.method === 'POST') {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    if (!isAuthRequired()) {
      return res.status(200).json({
        success: true,
        message: 'No password configured - auth disabled'
      });
    }

    if (verifyPassword(password)) {
      refreshAuthCookie(res);
      return res.status(200).json({ success: true });
    }

    // Add a small delay on failed attempts to slow down brute force
    await new Promise(resolve => setTimeout(resolve, 500));
    return res.status(401).json({ error: 'Invalid password' });
  }

  // DELETE - logout
  if (req.method === 'DELETE') {
    clearAuthCookie(res);
    return res.status(200).json({ success: true, message: 'Logged out' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
