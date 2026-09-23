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

/**
 * Sends one of the stored CV files as a download.
 * @param {string[]} slots media keys to try, in order of preference
 */
async function sendCv(res, slots) {
  const profile = store.get();
  const media = profile.media || {};

  const stored = slots.map((slot) => media[slot]).find((value) => value && value.startsWith('/uploads/'));
  if (!stored) {
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
  return res.download(target, `${slug}-CV${path.extname(target)}`);
}

// PDF first: it is what most recruiters and applicant tracking systems expect.
router.get('/cv', (_req, res) => sendCv(res, ['cvPdf', 'cv']));
router.get('/cv/pdf', (_req, res) => sendCv(res, ['cvPdf']));
router.get('/cv/docx', (_req, res) => sendCv(res, ['cv']));

module.exports = router;
