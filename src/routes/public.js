'use strict';

const express = require('express');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { config } = require('../config');
const store = require('../lib/profile-store');

const router = express.Router();

router.get('/api/profile', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(store.get());
});

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

/** Friendly download URL that always points at the current CV file. */
router.get('/cv', async (req, res) => {
  const profile = store.get();
  const stored = profile.media && profile.media.cv;
  if (!stored || !stored.startsWith('/uploads/')) {
    return res.status(404).type('text/plain').send('No CV has been uploaded yet.');
  }

  const target = path.resolve(config.paths.uploads, stored.replace(/^\/uploads\//, ''));
  if (!target.startsWith(path.resolve(config.paths.uploads) + path.sep)) {
    return res.status(404).type('text/plain').send('Not found');
  }

  try {
    await fsp.access(target);
  } catch {
    return res.status(404).type('text/plain').send('No CV has been uploaded yet.');
  }

  const slug = (profile.name || 'cv').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'cv';
  const downloadName = `${slug}-CV${path.extname(target)}`;
  return res.download(target, downloadName);
});

module.exports = router;
