'use strict';

const readline = require('node:readline');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Password prompt that keeps the typed characters off the screen. */
function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      const text = char.toString('utf8');
      if (['\n', '\r', '\u0004'].includes(text)) {
        process.stdin.removeListener('data', onData);
      }
    };

    process.stdout.write(question);
    rl.output.write = (chunk) => {
      // Suppress echo of the typed secret, but keep the prompt itself visible.
      if (typeof chunk === 'string' && chunk.includes(question)) process.stdout.write('');
    };
    process.stdin.on('data', onData);

    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

module.exports = { ask, askSecret };
