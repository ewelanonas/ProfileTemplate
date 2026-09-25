'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { config } = require('../config');
const store = require('../lib/profile-store');
const { verifyCredentials, requireAuth, isAuthenticated } = require('../middleware/auth');
const { csrfGuard, ensureCsrfToken } = require('../middleware/security');
const {
  KINDS,
  UploadError,
  buildUploader,
  verifyMagicBytes,
  removeFile,
  publicPathFor,
  kindOf,
} = require('../lib/uploads');

const router = express.Router();

/** Brute force protection: slow, per IP, and it does not count successful logins. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down a little.' },
});

router.get('/session', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    username: req.session.user.username,
    csrfToken: ensureCsrfToken(req.session),
  });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const ok = await verifyCredentials(username, password);
  if (!ok) {
    // Deliberately vague: never reveal which half of the credentials was wrong.
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Replace the whole session on login: no state is carried over from the
  // pre-login cookie, so a planted session cannot be upgraded to an admin one.
  req.session = {
    user: { username: config.admin.username, loggedInAt: new Date().toISOString() },
  };
  const csrfToken = ensureCsrfToken(req.session);

  return res.json({ authenticated: true, username: config.admin.username, csrfToken });
});

router.post('/logout', requireAuth, csrfGuard, (req, res) => {
  req.session = null;
  res.json({ authenticated: false });
});

router.get('/profile', requireAuth, (_req, res) => {
  res.json(store.get());
});

router.put('/profile', requireAuth, csrfGuard, writeLimiter, async (req, res) => {
  const saved = await store.replace(req.body);
  res.json({ ok: true, profile: saved });
});

function runUpload(kind, req, res) {
  return new Promise((resolve, reject) => {
    buildUploader(kind)(req, res, (error) => (error ? reject(error) : resolve(req.file)));
  });
}

router.post('/media/:kind', requireAuth, csrfGuard, writeLimiter, async (req, res) => {
  const { kind } = req.params;
  const rules = kindOf(kind); // throws 404 for unknown slots

  const file = await runUpload(kind, req, res);
  if (!file) throw new UploadError(`Please choose a file for the ${rules.label}`);

  // Content sniffing after the write: extension and mime type alone are not trusted.
  const looksRight = await verifyMagicBytes(file.path);
  if (!looksRight) {
    await removeFile(publicPathFor(kind, file.filename));
    throw new UploadError(`That file does not look like a valid ${rules.label}`);
  }

  const previous = store.get().media[kind];
  const publicPath = publicPathFor(kind, file.filename);

  const patch = { [kind]: publicPath };
  // Document slots also remember the original file name and when it changed.
  if (kind.startsWith('cv')) {
    patch[`${kind}Name`] = String(file.originalname || '').slice(0, 120);
    patch[`${kind}UpdatedAt`] = new Date().toISOString();
  }

  const profile = await store.setMedia(patch);
  if (previous && previous !== publicPath) await removeFile(previous);

  res.json({ ok: true, media: profile.media });
});

router.delete('/media/:kind', requireAuth, csrfGuard, writeLimiter, async (req, res) => {
  const { kind } = req.params;
  kindOf(kind);

  const previous = store.get().media[kind];
  const patch = { [kind]: '' };
  if (kind.startsWith('cv')) {
    patch[`${kind}Name`] = '';
    patch[`${kind}UpdatedAt`] = '';
  }

  const profile = await store.setMedia(patch);
  if (previous) await removeFile(previous);

  res.json({ ok: true, media: profile.media });
});

router.get('/media/limits', requireAuth, (_req, res) => {
  const limits = Object.fromEntries(
    Object.entries(KINDS).map(([kind, rules]) => [
      kind,
      { maxBytes: rules.maxBytes, extensions: rules.extensions, label: rules.label },
    ]),
  );
  res.json(limits);
});

module.exports = router;
