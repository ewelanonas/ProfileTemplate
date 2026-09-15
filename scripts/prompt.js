'use strict';

const readline = require('node:readline');
const { Writable } = require('node:stream');

/**
 * Prompt helpers with one rule: answers must land on the question that asked for
 * them. Getting this wrong once wrote a password into SITE_URL, so the two input
 * modes are handled separately rather than hoping one path covers both.
 *
 * Interactive terminal: a single shared readline interface, with output muted for
 * secrets so the typed characters never appear.
 *
 * Piped or redirected input: readline would emit every buffered line the moment
 * the first question is asked and drop the rest, so stdin is read once up front
 * and answers are served from a queue.
 */

const interactive = Boolean(process.stdin.isTTY);

let rl = null;
let output = null;
let queue = null;

function getInterface() {
  if (rl) return rl;

  output = new Writable({
    write(chunk, encoding, callback) {
      if (!output.muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  output.muted = false;

  rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return rl;
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

async function nextQueuedLine() {
  if (!queue) queue = await readAllStdin();
  return queue.length ? queue.shift() : '';
}

function askInteractive(question, secret) {
  const iface = getInterface();
  return new Promise((resolve) => {
    if (secret) {
      process.stdout.write(question);
      output.muted = true;
    }
    iface.question(secret ? '' : question, (answer) => {
      if (secret) {
        output.muted = false;
        process.stdout.write('\n');
      }
      resolve(String(answer).trim());
    });
  });
}

async function askQueued(question, secret) {
  const answer = await nextQueuedLine();
  // Echo the prompt so piped runs are still readable in logs, never the secret.
  process.stdout.write(`${question}${secret ? '' : answer}\n`);
  return String(answer).trim();
}

function ask(question) {
  return interactive ? askInteractive(question, false) : askQueued(question, false);
}

/** Same ordering guarantees as ask(), but the answer is never echoed. */
function askSecret(question) {
  return interactive ? askInteractive(question, true) : askQueued(question, true);
}

function close() {
  if (rl) {
    rl.close();
    rl = null;
    output = null;
  }
}

module.exports = { ask, askSecret, close };
