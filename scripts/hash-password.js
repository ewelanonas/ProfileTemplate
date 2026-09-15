'use strict';

const bcrypt = require('bcryptjs');

const { askSecret, close } = require('./prompt');

const MIN_LENGTH = 12;
const ROUNDS = 12;

async function main() {
  console.log('Generate a bcrypt hash for ADMIN_PASSWORD_HASH.');
  console.log(`The password itself is never stored. Minimum length: ${MIN_LENGTH} characters.\n`);

  const password = await askSecret('Password: ');
  if (password.length < MIN_LENGTH) {
    console.error(`\nPassword too short (${password.length} characters). Use at least ${MIN_LENGTH}.`);
    process.exit(1);
  }
  const confirm = await askSecret('Confirm password: ');
  if (password !== confirm) {
    console.error('\nPasswords do not match.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, ROUNDS);
  console.log('\nAdd this line to your .env file (keep it out of git):\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(close);
