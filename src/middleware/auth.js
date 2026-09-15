'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const { config } = require('../config');

/** Constant-time username comparison, so timing cannot reveal the admin name. */
function usernameMatches(candidate) {
  const expected = Buffer.from(config.admin.username);
  const given = Buffer.from(String(candidate || ''));
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

/**
 * Always runs a bcrypt comparison, even for a wrong username, so both failure
 * paths take the same time and neither reveals whether the user exists.
 */
async function verifyCredentials(username, password) {
  const nameOk = usernameMatches(username);
  const passwordOk = await bcrypt.compare(String(password || ''), config.admin.passwordHash);
  return nameOk && passwordOk;
}

function isAuthenticated(req) {
  return Boolean(req.session && req.session.user && req.session.user.username);
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Touching the session refreshes the cookie, giving a sliding 8 hour window
  // while the admin is active.
  req.session.seenAt = Date.now();
  return next();
}

module.exports = { verifyCredentials, requireAuth, isAuthenticated };
