/* Admin area: sign in, edit every section of the profile, upload photo/CV/background. */
(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    profile: null,
    csrfToken: '',
    username: '',
    dirty: false,
    saving: false,
  };

  /* ------------------------------------------------------------------
     Small DOM helper. Text always goes through textContent.
     ------------------------------------------------------------------ */

  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.attrs) {
      for (const [key, value] of Object.entries(options.attrs)) {
        if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
      }
    }
    if (options.dataset) {
      for (const [key, value] of Object.entries(options.dataset)) node.dataset[key] = value;
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function toast(message, kind = 'info') {
    const node = $('#toast');
    node.textContent = message;
    node.dataset.kind = kind;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      node.hidden = true;
    }, kind === 'error' ? 6000 : 3200);
  }

  function bytes(value) {
    const mb = value / (1024 * 1024);
    if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
    return `${Math.round(value / 1024)} KB`;
  }

  /* ------------------------------------------------------------------
     API layer
     ------------------------------------------------------------------ */

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && state.csrfToken) headers['x-csrf-token'] = state.csrfToken;

    const response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      showLogin('Your session expired. Please sign in again.');
      throw new ApiError('Session expired', 401);
    }
    if (!response.ok) {
      throw new ApiError((payload && payload.error) || `Request failed (${response.status})`, response.status);
    }
    return payload;
  }

  function uploadMedia(kind, file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);

      const request = new XMLHttpRequest();
      request.open('POST', `/api/admin/media/${kind}`, true);
      request.withCredentials = true;
      request.setRequestHeader('Accept', 'application/json');
      request.setRequestHeader('x-csrf-token', state.csrfToken);

      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) onProgress((event.loaded / event.total) * 100);
      });

      request.addEventListener('load', () => {
        let payload = null;
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          payload = null;
        }
        if (request.status === 401) {
          showLogin('Your session expired. Please sign in again.');
          reject(new ApiError('Session expired', 401));
          return;
        }
        if (request.status >= 200 && request.status < 300) resolve(payload);
        else reject(new ApiError((payload && payload.error) || 'Upload failed', request.status));
      });

      request.addEventListener('error', () => reject(new ApiError('Network error during upload', 0)));
      request.send(form);
    });
  }

  /* ------------------------------------------------------------------
     Field definitions
     ------------------------------------------------------------------ */

  const BASIC_FIELDS = [
    { key: 'name', label: 'Full name', placeholder: 'Juan Dela Cruz' },
    { key: 'headline', label: 'Headline / job title', placeholder: 'Senior Software Engineer' },
    {
      key: 'tagline',
      label: 'Short tagline',
      placeholder: 'I build reliable, human friendly software.',
      span: true,
    },
    { key: 'location', label: 'Location', placeholder: 'Manila, Philippines' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone', placeholder: '+63 900 000 0000' },
    { key: 'website', label: 'Website', type: 'url', placeholder: 'https://example.com' },
    {
      key: 'availability',
      label: 'Availability badge',
      placeholder: 'Open to new opportunities',
      hint: 'Leave empty to hide the green status pill.',
    },
    {
      key: 'summary',
      label: 'About me',
      type: 'textarea',
      span: true,
      hint: 'Line breaks are kept on the site.',
    },
  ];

  const THEME_FIELDS = [
    { key: 'accent', label: 'Accent colour', type: 'color' },
    {
      key: 'mode',
      label: 'Default theme for visitors',
      type: 'select',
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ],
    },
  ];

  const INTEREST_FIELDS = [
    {
      key: 'interests',
      label: 'Interests',
      type: 'tags',
      hint: 'One per line, or separated by commas.',
    },
  ];

  const REPEATERS = {
    socials: {
      target: '#socials-editor',
      title: 'Social links',
      desc: 'GitHub, LinkedIn, X, personal blog — anything you want visitors to open.',
      addLabel: 'Add link',
      empty: 'No social links yet.',
      labelKey: 'label',
      fields: [
        { key: 'label', label: 'Label', placeholder: 'GitHub' },
        { key: 'url', label: 'URL', type: 'url', placeholder: 'https://github.com/you' },
      ],
    },
    skills: {
      target: '#skills-editor',
      title: 'Skill groups',
      desc: 'For example: Languages, Frameworks, Cloud, Tools.',
      addLabel: 'Add group',
      empty: 'No skill groups yet.',
      labelKey: 'category',
      fields: [
        { key: 'category', label: 'Group name', placeholder: 'Languages' },
        { key: 'items', label: 'Skills', type: 'lines', hint: 'One per line.', span: true },
      ],
    },
    experience: {
      target: '#experience-editor',
      title: 'Roles',
      desc: 'Most recent role first.',
      addLabel: 'Add role',
      empty: 'No roles yet.',
      labelKey: 'role',
      fields: [
        { key: 'role', label: 'Job title', placeholder: 'Software Engineer' },
        { key: 'company', label: 'Company', placeholder: 'Acme Inc.' },
        { key: 'location', label: 'Location', placeholder: 'Remote' },
        { key: 'start', label: 'Start', placeholder: 'Jan 2023' },
        { key: 'end', label: 'End', placeholder: 'Dec 2024' },
        { key: 'current', label: 'This is my current role', type: 'checkbox' },
        { key: 'summary', label: 'Role summary', type: 'textarea', span: true },
        {
          key: 'bullets',
          label: 'Achievements',
          type: 'lines',
          span: true,
          hint: 'One per line. Numbers and results work best.',
        },
      ],
    },
    projects: {
      target: '#projects-editor',
      title: 'Projects',
      desc: 'Side projects, client work, open source.',
      addLabel: 'Add project',
      empty: 'No projects yet.',
      labelKey: 'title',
      fields: [
        { key: 'title', label: 'Title', placeholder: 'Inventory dashboard' },
        { key: 'url', label: 'Live URL', type: 'url', placeholder: 'https://…' },
        { key: 'repo', label: 'Repository URL', type: 'url', placeholder: 'https://github.com/…' },
        { key: 'highlight', label: 'Feature this project', type: 'checkbox' },
        { key: 'description', label: 'Description', type: 'textarea', span: true },
        { key: 'tech', label: 'Tech used', type: 'tags', span: true, hint: 'One per line or comma separated.' },
      ],
    },
    education: {
      target: '#education-editor',
      title: 'Education',
      desc: 'Degrees, diplomas, bootcamps.',
      addLabel: 'Add entry',
      empty: 'No education entries yet.',
      labelKey: 'degree',
      fields: [
        { key: 'degree', label: 'Degree / programme', placeholder: 'BS Computer Science' },
        { key: 'school', label: 'School', placeholder: 'University of the Philippines' },
        { key: 'location', label: 'Location', placeholder: 'Quezon City' },
        { key: 'start', label: 'Start', placeholder: '2016' },
        { key: 'end', label: 'End', placeholder: '2020' },
        { key: 'details', label: 'Details', type: 'textarea', span: true },
      ],
    },
    certifications: {
      target: '#certifications-editor',
      title: 'Certifications',
      desc: 'Optional. Add a verification link if you have one.',
      addLabel: 'Add certification',
      empty: 'No certifications yet.',
      labelKey: 'name',
      fields: [
        { key: 'name', label: 'Name', placeholder: 'AWS Solutions Architect' },
        { key: 'issuer', label: 'Issuer', placeholder: 'Amazon Web Services' },
        { key: 'year', label: 'Year', placeholder: '2025' },
        { key: 'url', label: 'Verification URL', type: 'url', placeholder: 'https://…' },
      ],
    },
    languages: {
      target: '#languages-editor',
      title: 'Languages',
      desc: 'Spoken languages and your level.',
      addLabel: 'Add language',
      empty: 'No languages yet.',
      labelKey: 'name',
      fields: [
        { key: 'name', label: 'Language', placeholder: 'Filipino' },
        { key: 'level', label: 'Level', placeholder: 'Native' },
      ],
    },
  };

  /* ------------------------------------------------------------------
     Field rendering + collection
     ------------------------------------------------------------------ */

  function buildField(spec, value) {
    const id = `f-${spec.key}-${Math.random().toString(36).slice(2, 8)}`;
    const labelText = el('span', { className: 'field__label', text: spec.label });
    const hint = spec.hint ? el('span', { className: 'field__hint', text: spec.hint }) : null;

    if (spec.type === 'checkbox') {
      const input = el('input', {
        attrs: { type: 'checkbox', id, ...(value ? { checked: 'checked' } : {}) },
        dataset: { key: spec.key, kind: 'checkbox' },
      });
      input.checked = Boolean(value);
      const wrapper = el('label', { className: 'field field--check', attrs: { for: id } }, [
        input,
        el('span', { className: 'field__label', text: spec.label }),
      ]);
      if (spec.span) wrapper.classList.add('span-2');
      return wrapper;
    }

    let control;
    if (spec.type === 'textarea' || spec.type === 'lines' || spec.type === 'tags') {
      control = el('textarea', {
        className: 'field__textarea',
        attrs: { id, rows: spec.type === 'textarea' ? 5 : 4, placeholder: spec.placeholder || '' },
        dataset: { key: spec.key, kind: spec.type },
      });
      const text = Array.isArray(value) ? value.join('\n') : value || '';
      control.value = text;
    } else if (spec.type === 'select') {
      control = el(
        'select',
        { className: 'field__select', attrs: { id }, dataset: { key: spec.key, kind: 'text' } },
        (spec.options || []).map((option) =>
          el('option', { text: option.label, attrs: { value: option.value } }),
        ),
      );
      control.value = value || (spec.options && spec.options[0] && spec.options[0].value) || '';
    } else if (spec.type === 'color') {
      const colorInput = el('input', {
        attrs: { type: 'color', id },
        dataset: { key: spec.key, kind: 'text' },
      });
      colorInput.value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#6c8cff';
      const textInput = el('input', {
        className: 'field__input',
        attrs: { type: 'text', 'aria-label': 'Accent colour hex value', maxlength: '7' },
      });
      textInput.value = colorInput.value;
      colorInput.addEventListener('input', () => {
        textInput.value = colorInput.value;
        document.documentElement.style.setProperty('--accent', colorInput.value);
      });
      textInput.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(textInput.value)) {
          colorInput.value = textInput.value;
          document.documentElement.style.setProperty('--accent', textInput.value);
        }
      });
      const wrapper = el('div', { className: 'field' }, [
        labelText,
        el('span', { className: 'field--color' }, [colorInput, textInput]),
        hint,
      ]);
      if (spec.span) wrapper.classList.add('span-2');
      return wrapper;
    } else {
      control = el('input', {
        className: 'field__input',
        attrs: { type: spec.type || 'text', id, placeholder: spec.placeholder || '' },
        dataset: { key: spec.key, kind: 'text' },
      });
      control.value = value || '';
    }

    const wrapper = el('label', { className: 'field', attrs: { for: id } }, [labelText, control, hint]);
    if (spec.span) wrapper.classList.add('span-2');
    return wrapper;
  }

  function splitLines(text) {
    return String(text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function splitTags(text) {
    return String(text || '')
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function collectFrom(scope, fields) {
    const result = {};
    for (const spec of fields) {
      const control = scope.querySelector(`[data-key="${spec.key}"]`);
      if (!control) continue;
      if (spec.type === 'checkbox') result[spec.key] = control.checked;
      else if (spec.type === 'lines') result[spec.key] = splitLines(control.value);
      else if (spec.type === 'tags') result[spec.key] = splitTags(control.value);
      else result[spec.key] = control.value.trim();
    }
    return result;
  }

  function renderFields(container, fields, data) {
    container.replaceChildren(...fields.map((spec) => buildField(spec, data[spec.key])));
  }

  /* ------------------------------------------------------------------
     Repeaters
     ------------------------------------------------------------------ */

  function reindex(itemsNode) {
    const rows = $$('.row', itemsNode);
    rows.forEach((row, index) => {
      $('.row__index', row).textContent = `#${index + 1}`;
      $('[data-move="up"]', row).disabled = index === 0;
      $('[data-move="down"]', row).disabled = index === rows.length - 1;
    });
    const empty = itemsNode.parentElement.querySelector('.repeater__empty');
    if (empty) empty.hidden = rows.length > 0;
  }

  function buildRow(config, item) {
    const grid = el(
      'div',
      { className: 'grid grid--2' },
      config.fields.map((spec) => buildField(spec, item[spec.key])),
    );

    const row = el('article', { className: 'row' }, [
      el('div', { className: 'row__head' }, [
        el('span', { className: 'row__index', text: '#' }),
        el('div', { className: 'row__tools' }, [
          el('button', {
            className: 'row__tool',
            text: '↑',
            attrs: { type: 'button', 'aria-label': 'Move up' },
            dataset: { move: 'up' },
          }),
          el('button', {
            className: 'row__tool',
            text: '↓',
            attrs: { type: 'button', 'aria-label': 'Move down' },
            dataset: { move: 'down' },
          }),
          el('button', {
            className: 'row__tool row__tool--danger',
            text: '✕',
            attrs: { type: 'button', 'aria-label': 'Remove this entry' },
            dataset: { action: 'remove' },
          }),
        ]),
      ]),
      grid,
    ]);

    return row;
  }

  function renderRepeater(name) {
    const config = REPEATERS[name];
    const container = $(config.target);
    const items = Array.isArray(state.profile[name]) ? state.profile[name] : [];

    const itemsNode = el('div', { className: 'repeater__items' }, items.map((item) => buildRow(config, item)));
    const emptyNode = el('p', { className: 'repeater__empty', text: config.empty, attrs: { hidden: items.length > 0 ? 'hidden' : false } });

    const addButton = el('button', {
      className: 'btn btn--ghost btn--sm',
      text: `+ ${config.addLabel}`,
      attrs: { type: 'button' },
    });

    addButton.addEventListener('click', () => {
      const row = buildRow(config, {});
      itemsNode.append(row);
      reindex(itemsNode);
      markDirty();
      const firstInput = row.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
    });

    itemsNode.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const row = button.closest('.row');
      if (!row) return;

      if (button.dataset.action === 'remove') {
        row.remove();
        reindex(itemsNode);
        markDirty();
        return;
      }
      if (button.dataset.move === 'up' && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
        reindex(itemsNode);
        markDirty();
      }
      if (button.dataset.move === 'down' && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
        reindex(itemsNode);
        markDirty();
      }
    });

    container.replaceChildren(
      el('div', { className: 'repeater__head' }, [
        el('div', {}, [
          el('p', { className: 'repeater__title', text: config.title }),
          el('p', { className: 'repeater__desc', text: config.desc }),
        ]),
        addButton,
      ]),
      emptyNode,
      itemsNode,
    );

    reindex(itemsNode);
  }

  function collectRepeater(name) {
    const config = REPEATERS[name];
    const container = $(config.target);
    return $$('.row', container)
      .map((row) => collectFrom(row, config.fields))
      .filter((item) => Object.values(item).some((value) => (Array.isArray(value) ? value.length : value && value !== false)));
  }

  /* ------------------------------------------------------------------
     Uploads UI
     ------------------------------------------------------------------ */

  const UPLOAD_LABELS = {
    photo: 'Profile photo',
    background: 'Background image',
    cv: 'CV',
  };

  function paintMedia() {
    const media = (state.profile && state.profile.media) || {};

    $$('.upload').forEach((card) => {
      const kind = card.dataset.kind;
      const value = media[kind];
      const preview = $('[data-preview]', card);
      const empty = $('[data-empty]', card);
      const remove = $('[data-remove]', card);
      const fileLabel = $('[data-file]', card);
      const open = $('[data-open]', card);

      const hasValue = Boolean(value);
      if (remove) remove.hidden = !hasValue;
      if (empty) empty.hidden = hasValue;

      if (preview) {
        if (hasValue) {
          // Cache-busting so a replaced image shows up immediately.
          preview.src = `${value}?v=${Date.now()}`;
          preview.hidden = false;
        } else {
          preview.removeAttribute('src');
          preview.hidden = true;
        }
      }

      if (fileLabel) {
        fileLabel.textContent = media.cvName || (hasValue ? 'Uploaded CV' : '');
        fileLabel.hidden = !hasValue;
      }
      if (open) open.hidden = !hasValue;
    });
  }

  async function handleFile(kind, file) {
    if (!file) return;
    const card = $(`.upload[data-kind="${kind}"]`);
    const progress = $('[data-progress]', card);

    card.classList.add('is-busy');
    progress.hidden = false;
    progress.value = 0;

    try {
      const result = await uploadMedia(kind, file, (percent) => {
        progress.value = percent;
      });
      state.profile.media = result.media;
      paintMedia();
      toast(`${UPLOAD_LABELS[kind]} updated.`);
    } catch (error) {
      if (error.status !== 401) toast(error.message, 'error');
    } finally {
      card.classList.remove('is-busy');
      progress.hidden = true;
      const input = $('[data-input]', card);
      if (input) input.value = '';
    }
  }

  async function removeMedia(kind) {
    const card = $(`.upload[data-kind="${kind}"]`);
    if (!window.confirm(`Remove the current ${UPLOAD_LABELS[kind].toLowerCase()}? This cannot be undone.`)) return;

    card.classList.add('is-busy');
    try {
      const result = await api(`/api/admin/media/${kind}`, { method: 'DELETE' });
      state.profile.media = result.media;
      paintMedia();
      toast(`${UPLOAD_LABELS[kind]} removed.`);
    } catch (error) {
      if (error.status !== 401) toast(error.message, 'error');
    } finally {
      card.classList.remove('is-busy');
    }
  }

  function initUploads(limits) {
    $$('.upload').forEach((card) => {
      const kind = card.dataset.kind;
      const input = $('[data-input]', card);
      const drop = $('[data-drop]', card);
      const rules = limits && limits[kind];

      if (rules) {
        $('[data-hint]', card).textContent = `${rules.extensions
          .join(', ')
          .toUpperCase()
          .replace(/\./g, '')} · up to ${bytes(rules.maxBytes)}`;
      }

      $('[data-pick]', card).addEventListener('click', () => input.click());
      drop.addEventListener('click', () => input.click());
      drop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      });

      ['dragenter', 'dragover'].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.classList.add('is-over');
        }),
      );
      ['dragleave', 'dragend'].forEach((type) =>
        drop.addEventListener(type, () => drop.classList.remove('is-over')),
      );
      drop.addEventListener('drop', (event) => {
        event.preventDefault();
        drop.classList.remove('is-over');
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) handleFile(kind, file);
      });

      input.addEventListener('change', () => handleFile(kind, input.files && input.files[0]));
      $('[data-remove]', card).addEventListener('click', () => removeMedia(kind));
    });
  }

  /* ------------------------------------------------------------------
     Dirty state + saving
     ------------------------------------------------------------------ */

  function setDirty(value) {
    state.dirty = value;
    $('#dirty-flag').hidden = !value;
    const status = $('#save-status');
    status.textContent = value ? 'You have unsaved changes' : 'All changes saved';
    status.classList.toggle('is-dirty', value);
  }

  function markDirty() {
    if (!state.dirty) setDirty(true);
  }

  function collectProfile() {
    const next = { ...state.profile };
    Object.assign(next, collectFrom($('#basics-fields'), BASIC_FIELDS));
    next.theme = collectFrom($('#appearance-fields'), THEME_FIELDS);
    next.interests = collectFrom($('#interests-fields'), INTEREST_FIELDS).interests;
    for (const name of Object.keys(REPEATERS)) next[name] = collectRepeater(name);
    return next;
  }

  async function save() {
    if (state.saving) return;
    state.saving = true;
    const buttons = [$('#save-button'), $('#save-button-2')];
    buttons.forEach((button) => {
      button.disabled = true;
      button.textContent = 'Saving…';
    });

    try {
      const payload = collectProfile();
      const result = await api('/api/admin/profile', { method: 'PUT', body: payload });
      state.profile = result.profile;
      setDirty(false);
      toast('Saved. Your site is updated.');
    } catch (error) {
      if (error.status !== 401) toast(error.message, 'error');
    } finally {
      state.saving = false;
      buttons.forEach((button) => {
        button.disabled = false;
        button.textContent = 'Save changes';
      });
    }
  }

  /* ------------------------------------------------------------------
     Views
     ------------------------------------------------------------------ */

  function showLogin(message) {
    $('#admin-view').hidden = true;
    $('#login-view').hidden = false;
    state.csrfToken = '';
    const error = $('#login-error');
    if (message) {
      error.textContent = message;
      error.hidden = false;
    } else {
      error.hidden = true;
    }
    $('#login-username').focus();
  }

  function renderEditor() {
    $('#admin-user').textContent = state.username;
    renderFields($('#basics-fields'), BASIC_FIELDS, state.profile);
    renderFields($('#appearance-fields'), THEME_FIELDS, state.profile.theme || {});
    renderFields($('#interests-fields'), INTEREST_FIELDS, state.profile);
    for (const name of Object.keys(REPEATERS)) renderRepeater(name);
    paintMedia();
    setDirty(false);

    if (state.profile.theme && state.profile.theme.accent) {
      document.documentElement.style.setProperty('--accent', state.profile.theme.accent);
    }
  }

  async function showEditor() {
    $('#login-view').hidden = true;
    $('#admin-view').hidden = false;

    const [profile, limits] = await Promise.all([
      api('/api/admin/profile'),
      api('/api/admin/media/limits').catch(() => null),
    ]);
    state.profile = profile;
    renderEditor();
    initUploads(limits);
  }

  function initTabs() {
    const tabs = $$('.tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((other) => other.classList.toggle('is-active', other === tab));
        $$('.panel').forEach((panel) => {
          const active = panel.dataset.panel === tab.dataset.tab;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  function initLogin() {
    const form = $('#login-form');
    const error = $('#login-error');
    const submit = $('#login-submit');

    $('#toggle-password').addEventListener('click', () => {
      const input = $('#login-password');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      $('#toggle-password').setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      input.focus();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Signing in…';

      const username = $('#login-username').value.trim();
      const password = $('#login-password').value;

      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ username, password }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          error.textContent = (payload && payload.error) || 'Sign in failed';
          error.hidden = false;
          return;
        }

        state.csrfToken = payload.csrfToken;
        state.username = payload.username;
        $('#login-password').value = '';
        await showEditor();
      } catch {
        error.textContent = 'Could not reach the server. Please try again.';
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = 'Sign in';
      }
    });
  }

  function initShell() {
    initTabs();

    [$('#save-button'), $('#save-button-2')].forEach((button) => button.addEventListener('click', save));

    $('#logout-button').addEventListener('click', async () => {
      if (state.dirty && !window.confirm('You have unsaved changes. Sign out anyway?')) return;
      try {
        await api('/api/admin/logout', { method: 'POST' });
      } catch {
        /* already signed out */
      }
      setDirty(false);
      state.profile = null;
      showLogin('You are signed out.');
    });

    // Any edit inside the panels marks the form dirty.
    $('.admin__panels').addEventListener('input', (event) => {
      if (event.target.closest('.upload')) return;
      markDirty();
    });

    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!$('#admin-view').hidden) save();
      }
    });

    window.addEventListener('beforeunload', (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  async function boot() {
    initLogin();
    initShell();

    try {
      const session = await fetch('/api/admin/session', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      }).then((response) => response.json());

      if (session && session.authenticated) {
        state.csrfToken = session.csrfToken;
        state.username = session.username;
        await showEditor();
      } else {
        showLogin();
      }
    } catch {
      showLogin('Could not reach the server.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
