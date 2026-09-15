'use strict';

/** Lightweight guard: parses every project JS file so typos fail fast in CI. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const targets = ['src', 'scripts', path.join('public', 'assets', 'js')];

let checked = 0;
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.js')) {
      const source = fs.readFileSync(full, 'utf8');
      try {
        new vm.Script(source, { filename: full });
        checked += 1;
      } catch (error) {
        failures.push(`${path.relative(root, full)}: ${error.message}`);
      }
    }
  }
}

for (const target of targets) walk(path.join(root, target));

if (failures.length) {
  console.error('Syntax errors found:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Syntax OK (${checked} files checked).`);
