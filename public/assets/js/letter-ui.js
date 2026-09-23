/**
 * Cover letter generator UI.
 *
 * Mounted twice with the same code: inside the admin area, and on the standalone
 * tool page. Everything runs in the browser; nothing is uploaded or stored.
 */
(function attach(root) {
  'use strict';

  const FIELDS = [
    { key: 'company', label: 'Company', placeholder: 'American Express' },
    { key: 'role', label: 'Role title', placeholder: 'Quality Engineer III' },
    { key: 'location', label: 'Location', placeholder: 'Burgess Hill, West Sussex' },
    { key: 'jobId', label: 'Job ID', placeholder: '26014270' },
    { key: 'hiringManager', label: 'Addressed to', placeholder: 'Hiring Manager' },
    { key: 'date', label: 'Date', placeholder: '' },
  ];

  function el(tag, options, children) {
    const node = document.createElement(tag);
    const settings = options || {};
    if (settings.className) node.className = settings.className;
    if (settings.text !== undefined) node.textContent = settings.text;
    if (settings.attrs) {
      for (const [name, value] of Object.entries(settings.attrs)) {
        if (value !== undefined && value !== null && value !== false) node.setAttribute(name, value);
      }
    }
    for (const child of [].concat(children || [])) if (child) node.append(child);
    return node;
  }

  function field(spec, value) {
    const id = `letter-${spec.key}`;
    const input = el('input', {
      className: 'field__input',
      attrs: { id, type: 'text', placeholder: spec.placeholder || '' },
    });
    input.value = value || '';
    input.dataset.letterField = spec.key;
    return el('label', { className: 'field', attrs: { for: id } }, [
      el('span', { className: 'field__label', text: spec.label }),
      input,
    ]);
  }

  function download(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Prints through a hidden iframe: no popup blocker, no new tab to close. */
  function printLetter(letter) {
    const blocks = letter.blocks;
    const paragraphs = blocks.paragraphs.map((text) => `<p class="body">${escapeHtml(text)}</p>`).join('');
    const recipient = blocks.recipient.map((line) => `<p>${escapeHtml(line)}</p>`).join('');

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>${escapeHtml(blocks.name)} ${escapeHtml('-')} cover letter</title>
      <style>
        @page { size: A4; margin: 2.2cm 2.4cm; }
        body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.22; color: #000; margin: 0; }
        .name { font-size: 18pt; font-weight: 700; margin: 0 0 2pt; }
        .meta { font-size: 10pt; color: #595959; margin: 0 0 2pt; }
        .block { margin-top: 16pt; }
        .block p { margin: 0; }
        .subject { margin-top: 16pt; font-weight: 700; }
        .salutation { margin-top: 16pt; }
        p.body { margin: 12pt 0 0; }
        .signoff { margin-top: 12pt; }
        .signature { margin-top: 20pt; font-weight: 700; }
      </style></head><body>
      <p class="name">${escapeHtml(blocks.name)}</p>
      ${blocks.headline ? `<p class="meta">${escapeHtml(blocks.headline)}</p>` : ''}
      ${blocks.contact ? `<p class="meta">${escapeHtml(blocks.contact)}</p>` : ''}
      ${blocks.links ? `<p class="meta">${escapeHtml(blocks.links)}</p>` : ''}
      <div class="block"><p>${escapeHtml(blocks.date)}</p></div>
      <div class="block">${recipient}</div>
      <p class="subject">${escapeHtml(blocks.subject)}</p>
      <p class="salutation">${escapeHtml(blocks.salutation)}</p>
      ${paragraphs}
      <p class="signoff">${escapeHtml(blocks.signOff)}</p>
      <p class="signature">${escapeHtml(blocks.signature)}</p>
    </body></html>`;

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.append(frame);

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    frame.contentWindow.focus();
    setTimeout(() => {
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    }, 250);
  }

  /**
   * @param {object} options
   * @param {HTMLElement} options.container where to render
   * @param {function(): Promise<object>|object} options.getProfile supplies the profile
   * @param {function(string, string=): void} [options.notify] toast callback
   */
  function mount(options) {
    const container = options.container;
    const notify = options.notify || ((message) => console.log(message));

    let profile = null;
    let letter = null;

    /* ---------- markup ---------- */

    const jobInput = el('textarea', {
      className: 'field__textarea letter__jd',
      attrs: {
        id: 'letter-jd',
        rows: 12,
        placeholder:
          'Paste the whole job advert here, then press Generate draft.\n\n' +
          'The more of it you paste, the better the match: the draft picks the parts of your ' +
          'profile the advert actually asks for.',
      },
    });

    const generateButton = el('button', {
      className: 'btn btn--primary',
      text: 'Generate draft',
      attrs: { type: 'button' },
    });

    const clearButton = el('button', {
      className: 'btn btn--ghost btn--sm',
      text: 'Clear',
      attrs: { type: 'button' },
    });

    const detailsGrid = el('div', { className: 'grid grid--2 letter__details' });
    const matchesNote = el('p', { className: 'letter__matches', attrs: { hidden: 'hidden' } });

    const bodyInput = el('textarea', {
      className: 'field__textarea letter__body',
      attrs: { id: 'letter-body', rows: 16, placeholder: 'The generated paragraphs appear here, ready to edit.' },
    });

    const docxButton = el('button', {
      className: 'btn btn--primary',
      text: 'Download .docx',
      attrs: { type: 'button' },
    });
    const pdfButton = el('button', {
      className: 'btn btn--ghost',
      text: 'Save as PDF',
      attrs: { type: 'button' },
    });
    const copyButton = el('button', {
      className: 'btn btn--ghost',
      text: 'Copy as text',
      attrs: { type: 'button' },
    });

    const outputActions = el('div', { className: 'letter__actions', attrs: { hidden: 'hidden' } }, [
      docxButton,
      pdfButton,
      copyButton,
    ]);

    container.replaceChildren(
      el('div', { className: 'letter' }, [
        el('section', { className: 'letter__pane' }, [
          el('h3', { className: 'letter__title', text: '1. Paste the job advert' }),
          jobInput,
          el('div', { className: 'letter__row' }, [generateButton, clearButton]),
          matchesNote,
        ]),
        el('section', { className: 'letter__pane' }, [
          el('h3', { className: 'letter__title', text: '2. Check the details' }),
          detailsGrid,
          el('h3', { className: 'letter__title', text: '3. Edit the letter' }),
          el('p', {
            className: 'letter__hint',
            text: 'One paragraph per block, separated by a blank line. Read it before you send it.',
          }),
          bodyInput,
          outputActions,
        ]),
      ]),
    );

    /* ---------- behaviour ---------- */

    function readFields() {
      const values = {};
      for (const input of detailsGrid.querySelectorAll('[data-letter-field]')) {
        values[input.dataset.letterField] = input.value.trim();
      }
      return values;
    }

    function renderFields(job) {
      detailsGrid.replaceChildren(...FIELDS.map((spec) => field(spec, job[spec.key])));
    }

    /** Rebuilds the letter object from the current form state, so edits always win. */
    function currentLetter() {
      if (!letter) return null;
      const overrides = readFields();
      const rebuilt = root.LetterCore.buildLetter({
        profile,
        jobText: jobInput.value,
        job: overrides,
      });
      const paragraphs = bodyInput.value
        .split(/\n\s*\n/)
        .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);
      if (paragraphs.length) rebuilt.blocks.paragraphs = paragraphs;
      return rebuilt;
    }

    async function ensureProfile() {
      if (profile) return profile;
      profile = await options.getProfile();
      return profile;
    }

    generateButton.addEventListener('click', async () => {
      const text = jobInput.value.trim();
      if (text.length < 80) {
        notify('Paste a bit more of the advert first, at least a few sentences.', 'error');
        return;
      }

      generateButton.disabled = true;
      generateButton.textContent = 'Generating…';
      try {
        await ensureProfile();
        letter = root.LetterCore.buildLetter({ profile, jobText: text });
        renderFields(letter.job);
        bodyInput.value = letter.blocks.paragraphs.join('\n\n');
        outputActions.hidden = false;

        const matched = letter.analysis.matchedKeywords.slice(0, 12);
        matchesNote.hidden = false;
        matchesNote.textContent = matched.length
          ? `Matched in the advert: ${matched.join(', ')}`
          : 'No specific tools matched, so the draft uses your general experience. Edit as needed.';
        notify('Draft ready. Check the details, edit, then download.');
      } catch (error) {
        notify(error.message || 'Could not build the draft', 'error');
      } finally {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate draft';
      }
    });

    clearButton.addEventListener('click', () => {
      jobInput.value = '';
      bodyInput.value = '';
      detailsGrid.replaceChildren();
      outputActions.hidden = true;
      matchesNote.hidden = true;
      letter = null;
    });

    docxButton.addEventListener('click', () => {
      const built = currentLetter();
      if (!built) return;
      const bytes = root.LetterCore.buildDocx(built);
      download(
        bytes,
        `${root.LetterCore.suggestFileName(built)}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      notify('Word document downloaded.');
    });

    pdfButton.addEventListener('click', () => {
      const built = currentLetter();
      if (!built) return;
      printLetter(built);
      notify('Choose "Save as PDF" as the printer destination.');
    });

    copyButton.addEventListener('click', async () => {
      const built = currentLetter();
      if (!built) return;
      const text = root.LetterCore.toPlainText(built);
      try {
        await navigator.clipboard.writeText(text);
        notify('Letter copied to the clipboard.');
      } catch {
        bodyInput.value = text;
        notify('Clipboard blocked, so the full text is in the editor instead.', 'error');
      }
    });

    return {
      focus: () => jobInput.focus(),
    };
  }

  root.CoverLetterUI = { mount };
})(window);
