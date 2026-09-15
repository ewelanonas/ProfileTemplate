'use strict';

const crypto = require('node:crypto');

const { config } = require('../config');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function allowedOrigins(req) {
  const origins = new Set([config.siteUrl, ...config.trustedOrigins]);
  const host = req.headers.host;
  if (host) {
    origins.add(`https://${host}`);
    if (!config.isProduction) origins.add(`http://${host}`);
  }
  return origins;
}

/**
 * Rejects state-changing requests that come from another site. Together with the
 * SameSite=Strict session cookie and the CSRF token this closes cross-site writes.
 */
function originGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const source = req.headers.origin || req.headers.referer;
  if (!source) return next(); // non-browser client (curl, health check): no ambient cookies to abuse

  let origin;
  try {
    origin = new URL(source).origin;
  } catch {
    return res.status(403).json({ error: 'Request blocked' });
  }

  if (!allowedOrigins(req).has(origin)) {
    return res.status(403).json({ error: 'Request blocked' });
  }
  return next();
}

function ensureCsrfToken(session) {
  if (!session.csrfToken) {
    session.csrfToken = crypto.randomBytes(32).toString('base64url');
  }
  return session.csrfToken;
}

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Per-session CSRF token, sent back by the admin UI in the x-csrf-token header. */
function csrfGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  const provided = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  if (!req.session || !tokensMatch(req.session.csrfToken, provided)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  return next();
}

module.exports = { originGuard, csrfGuard, ensureCsrfToken };
