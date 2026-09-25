'use strict';

/**
 * Sets the passphrase for the standalone cover letter tool.
 *
 * Writes data/letter-gate.json holding a random salt and a PBKDF2-SHA256 hash.
 * The passphrase itself is never stored, and the file lives under data/ which is
 * git-ignored, so it reaches the published site through `npm run export` without
 * ever entering the repository.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { config } = require('../src/config');
const { askSecret, close } = require('./prompt');

const ITERATIONS = 310000;
const MIN_LENGTH = 10;
const OUT = path.join(config.paths.data, 'letter-gate.json');

function derive(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha256');
}

async function main() {
  console.log('\nCover letter tool passphrase');
  console.log('-----------------------------');
  console.log('This protects the unlisted tool page on your published site.\n');

  const passphrase = await askSecret(`Passphrase (min ${MIN_LENGTH} characters): `);
  if (passphrase.length < MIN_LENGTH) {
    console.error(`Too short (${passphrase.length}). Use at least ${MIN_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }
  const confirm = await askSecret('Confirm passphrase: ');
  if (passphrase !== confirm) {
    console.error('Passphrases do not match.');
    process.exitCode = 1;
    return;
  }

  const salt = crypto.randomBytes(16);
  const hash = derive(passphrase, salt);

  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        algorithm: 'PBKDF2-SHA256',
        iterations: ITERATIONS,
        salt: salt.toString('base64'),
        hash: hash.toString('base64'),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );

  console.log(`\nSaved to ${path.relative(config.root, OUT)}`);
  console.log('The passphrase itself was not saved.');
  console.log('\nNext: npm run export -- https://YOUR-URL  then  npx wrangler deploy');
  console.log('The tool will be at  https://YOUR-URL/tools/letter\n');
  console.log('A reminder about what this protects:');
  console.log('  - the page is unlisted and excluded from search engines');
  console.log('  - the passphrase is checked in the browser against this hash');
  console.log('  - it is not server-side authentication; for that, put the site behind');
  console.log('    Cloudflare Access, or use the admin area, which authenticates properly.\n');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(close);
