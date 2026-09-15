'use strict';

const path = require('node:path');
const fs = require('node:fs');

require('dotenv').config({ quiet: true });

const root = path.resolve(__dirname, '..');

function resolveDir(value, fallback) {
  const target = value && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(target) ? target : path.resolve(root, target);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const config = {
  root,
  nodeEnv,
  isProduction,
  port: toInt(process.env.PORT, 3000),
  siteUrl: (process.env.SITE_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`).replace(/\/$/, ''),
  admin: {
    username: process.env.ADMIN_USERNAME || '',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
  },
  session: {
    secret: process.env.SESSION_SECRET || '',
    cookieSecure: toBool(process.env.COOKIE_SECURE, isProduction),
    maxAgeMs: 1000 * 60 * 60 * 8,
  },
  paths: {
    data: resolveDir(process.env.DATA_DIR, './data'),
    uploads: resolveDir(process.env.UPLOAD_DIR, './uploads'),
    public: path.join(root, 'public'),
  },
  limits: {
    imageBytes: toInt(process.env.MAX_IMAGE_BYTES, 5 * 1024 * 1024),
    docBytes: toInt(process.env.MAX_DOC_BYTES, 10 * 1024 * 1024),
  },
  trustedOrigins: (process.env.TRUSTED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean),
};

/**
 * Fail closed: the app refuses to boot without an admin identity and a session
 * secret, so it can never accidentally run with an open or guessable admin area.
 */
function assertReady() {
  const problems = [];

  if (!config.admin.username) problems.push('ADMIN_USERNAME is missing');
  if (!config.admin.passwordHash) {
    problems.push('ADMIN_PASSWORD_HASH is missing');
  } else if (!/^\$2[aby]\$\d{2}\$/.test(config.admin.passwordHash)) {
    problems.push('ADMIN_PASSWORD_HASH must be a bcrypt hash (run: npm run hash-password)');
  }
  if (!config.session.secret || config.session.secret.length < 32) {
    problems.push('SESSION_SECRET is missing or shorter than 32 characters');
  }
  if (config.isProduction && !config.session.cookieSecure) {
    problems.push('COOKIE_SECURE must be true in production (site must be served over HTTPS)');
  }

  if (problems.length) {
    const message = [
      'Configuration is incomplete, refusing to start:',
      ...problems.map((problem) => `  - ${problem}`),
      '',
      'Run `npm run setup` to create a valid .env file.',
    ].join('\n');
    throw new Error(message);
  }
}

function ensureDirs() {
  for (const dir of [config.paths.data, config.paths.uploads]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { config, assertReady, ensureDirs };
