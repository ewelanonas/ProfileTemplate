'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { config } = require('../config');
const defaultProfile = require('./default-profile');
const { normaliseProfile } = require('./profile-schema');

const FILE = path.join(config.paths.data, 'profile.json');

let cache = null;
let writeQueue = Promise.resolve();

function readSync() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultProfile, ...parsed, media: { ...defaultProfile.media, ...(parsed.media || {}) } };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[store] profile.json unreadable, falling back to defaults:', error.message);
    }
    return { ...defaultProfile };
  }
}

function get() {
  if (!cache) cache = readSync();
  return cache;
}

/** Atomic write: temp file then rename, so a crash can never truncate the profile. */
async function persist(next) {
  const tmp = `${FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  await fsp.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await fsp.rename(tmp, FILE);
  cache = next;
  return next;
}

/** Serialised updates so two concurrent saves cannot interleave. */
function update(mutator) {
  writeQueue = writeQueue.then(async () => {
    const next = await mutator(get());
    return persist(next);
  });
  return writeQueue;
}

function replace(payload) {
  return update((current) => normaliseProfile(payload, current));
}

function setMedia(patch) {
  return update((current) => ({
    ...current,
    media: { ...current.media, ...patch },
    updatedAt: new Date().toISOString(),
  }));
}

async function init() {
  await fsp.mkdir(config.paths.data, { recursive: true });
  try {
    await fsp.access(FILE);
  } catch {
    await persist({ ...defaultProfile, updatedAt: new Date().toISOString() });
    console.log(`[store] created ${FILE} with starter content`);
  }
  cache = readSync();
}

module.exports = { init, get, replace, setMedia, FILE };
