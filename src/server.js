'use strict';

const path = require('node:path');
const fs = require('node:fs');

const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const multer = require('multer');

const { config, assertReady, ensureDirs } = require('./config');
const store = require('./lib/profile-store');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { originGuard } = require('./middleware/security');
const { UploadError } = require('./lib/uploads');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind DigitalOcean's load balancer / nginx: trust one proxy hop so secure
  // cookies and rate limiting see the real client protocol and IP.
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          scriptSrc: ["'self'"],
          // Inline styles are needed for the accent colour and background image
          // that the admin sets at runtime. Scripts stay strictly same-origin.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // Signed cookie sessions: nothing sensitive is stored client side beyond the
  // admin username and a CSRF token, the cookie is tamper proof, httpOnly and
  // SameSite=Strict, and there is no server side session state to lose on
  // restart or to share between instances.
  app.use(
    cookieSession({
      name: 'sid',
      keys: [config.session.secret],
      maxAge: config.session.maxAgeMs,
      httpOnly: true,
      sameSite: 'strict',
      secure: config.session.cookieSecure,
      path: '/',
      signed: true,
      overwrite: true,
    }),
  );

  app.use(originGuard);

  // User uploaded files: served read-only, never executed, no directory listing.
  app.use(
    '/uploads',
    express.static(config.paths.uploads, {
      index: false,
      dotfiles: 'deny',
      maxAge: '1h',
      setHeaders: (res) => {
        res.set('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.use(express.static(config.paths.public, { index: 'index.html', maxAge: config.isProduction ? '1h' : 0 }));

  app.use(publicRoutes);
  app.use('/api/admin', adminRoutes);

  const adminPage = path.join(config.paths.public, 'admin', 'index.html');
  app.get(['/admin', '/admin/login', '/admin/dashboard'], (_req, res) => res.sendFile(adminPage));

  // Extensionless URL for the unlisted tool, matching how it is published.
  app.get('/tools/letter', (_req, res) =>
    res.sendFile(path.join(config.paths.public, 'tools', 'letter.html')),
  );
  app.get('/tools/letter-gate.json', (_req, res) => {
    const gate = path.join(config.paths.data, 'letter-gate.json');
    return fs.existsSync(gate) ? res.sendFile(gate) : res.status(404).json({ error: 'Not configured' });
  });

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    return res.status(404).sendFile(path.join(config.paths.public, '404.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, _next) => {
    // A response already on the wire cannot be rewritten: log and drop it.
    if (res.headersSent) {
      console.error('[error] after response sent:', error.message);
      return res.destroy();
    }

    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        error.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than the allowed limit' : 'Upload rejected';
      return res.status(status).json({ error: message });
    }

    if (error instanceof UploadError || error.expose) {
      return res.status(error.status || 400).json({ error: error.message });
    }

    // Log internally, return something generic: no stack traces to the client.
    console.error('[error]', error);
    return res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}

async function start() {
  assertReady();
  ensureDirs();
  await store.init();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] portfolio running at ${config.siteUrl}`);
    console.log(`[server] admin area at ${config.siteUrl}/admin`);
    if (!config.isProduction) console.log('[server] mode: development');
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { createApp, start };
