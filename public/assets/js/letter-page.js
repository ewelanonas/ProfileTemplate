/**
 * Gate for the standalone cover letter tool.
 *
 * Honest about what this is: the page is unlisted and asks for a passphrase, and
 * the check runs in your browser against a PBKDF2 hash, so the passphrase itself
 * is not in the source. It keeps the tool out of sight and out of search results.
 * It is not server-side authentication: anyone determined enough can read the
 * page source and attack the hash offline. For real access control put the site
 * behind Cloudflare Access, or use the admin area, which authenticates properly.
 */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const GATE_URL = '/tools/letter-gate.json';
  const SESSION_KEY = 'letter-tool-unlocked';

  function toast(message, kind = 'info') {
    const node = $('#toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      node.hidden = true;
    }, kind === 'error' ? 6000 : 3200);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function derive(passphrase, saltBytes, iterations) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      keyMaterial,
      256,
    );
    return bytesToBase64(new Uint8Array(bits));
  }

  async function loadGate() {
    const response = await fetch(GATE_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('gate-missing');
    const gate = await response.json();
    if (!gate.salt || !gate.hash || !gate.iterations) throw new Error('gate-invalid');
    return gate;
  }

  async function getProfile() {
    for (const url of ['/profile.json', '/api/profile']) {
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (response.ok) return response.json();
      } catch {
        /* try the next source */
      }
    }
    throw new Error('Could not load your profile data');
  }

  function showTool() {
    $('#gate-view').hidden = true;
    $('#tool-view').hidden = false;

    const tool = window.CoverLetterUI.mount({
      container: $('#letter-mount'),
      getProfile,
      notify: toast,
    });
    tool.focus();
  }

  function initReveal() {
    $('#gate-reveal').addEventListener('click', () => {
      const input = $('#gate-password');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      $('#gate-reveal').setAttribute('aria-label', reveal ? 'Hide passphrase' : 'Show passphrase');
      input.focus();
    });
  }

  function initLock() {
    $('#lock-button').addEventListener('click', () => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* storage blocked */
      }
      window.location.reload();
    });
  }

  async function boot() {
    initReveal();
    initLock();

    const error = $('#gate-error');
    const submit = $('#gate-submit');

    let gate = null;
    try {
      gate = await loadGate();
    } catch (reason) {
      error.hidden = false;
      error.textContent =
        reason.message === 'gate-missing'
          ? 'This tool has no passphrase configured yet. Run `npm run letter:lock` and publish again.'
          : 'The passphrase configuration is unreadable.';
      submit.disabled = true;
      return;
    }

    // A refresh inside the same tab should not ask again.
    try {
      if (sessionStorage.getItem(SESSION_KEY) === gate.hash) {
        showTool();
        return;
      }
    } catch {
      /* storage blocked: just ask for the passphrase */
    }

    $('#gate-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Checking…';

      try {
        const candidate = await derive($('#gate-password').value, base64ToBytes(gate.salt), gate.iterations);
        if (candidate !== gate.hash) {
          error.hidden = false;
          error.textContent = 'That passphrase does not match.';
          return;
        }
        try {
          sessionStorage.setItem(SESSION_KEY, gate.hash);
        } catch {
          /* storage blocked: unlock lasts for this page view only */
        }
        $('#gate-password').value = '';
        showTool();
      } catch {
        error.hidden = false;
        error.textContent = 'Could not check the passphrase in this browser.';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Unlock';
      }
    });

    $('#gate-password').focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
