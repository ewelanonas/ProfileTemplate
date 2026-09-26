/* Public portfolio behaviour: fetch the profile, render it, add polish. */
(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /**
   * Where the profile comes from.
   *
   * Served by the Node app: the API. Published as a static export: a JSON file
   * next to the page, with the script tag carrying its path. Static builds have
   * no /cv route either, so the download button points straight at the file.
   */
  const staticSource = (document.querySelector('script[data-profile]') || { dataset: {} }).dataset.profile;
  const PROFILE_URL = staticSource || '/api/profile';
  const IS_STATIC = Boolean(staticSource);

  /* How many responsibility bullets show before the rest go behind a disclosure. */
  const BULLETS_SHOWN = 3;

  /* ---------- helpers ---------- */

  /** Builds an element and sets text through textContent, so profile data is never parsed as HTML. */
  function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.attrs) {
      for (const [key, value] of Object.entries(options.attrs)) {
        if (value !== undefined && value !== null && value !== '') node.setAttribute(key, value);
      }
    }
    for (const child of [].concat(children)) {
      if (child) node.append(child);
    }
    return node;
  }

  function safeHref(url) {
    if (typeof url !== 'string' || !url) return null;
    if (/^(mailto:|tel:|\/|#)/i.test(url)) return url;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function externalLink(url, label, className) {
    const href = safeHref(url);
    if (!href) return null;
    const isExternal = /^https?:/i.test(href) && !href.startsWith(window.location.origin);
    return el('a', {
      className,
      text: label,
      attrs: {
        href,
        ...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      },
    });
  }

  /** Host + path without the noise, so a link can show where it goes. */
  function prettyUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return `${parsed.host}${parsed.pathname}`.replace(/^www\./, '').replace(/\/$/, '');
    } catch {
      return String(url || '');
    }
  }

  function dateRange(start, end, current) {
    const from = start || '';
    const to = current ? 'Present' : end || '';
    if (from && to) return `${from} — ${to}`;
    return from || to || '';
  }

  function show(section, visible) {
    if (section) section.hidden = !visible;
  }

  /**
   * Monogram initials: first and last name only. Middle initials ("Emmanuel L.
   * Anonas") would otherwise win over the surname and read as "EL".
   */
  function initialsFrom(name) {
    const parts = String(name || '')
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean);
    if (!parts.length) return '';
    const picked = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
    return picked.map((part) => part[0].toUpperCase()).join('');
  }

  function toast(message) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      node.hidden = true;
    }, 4000);
  }

  /* ---------- theme ---------- */

  const THEME_KEY = 'portfolio-theme';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const button = $('#theme-toggle');
    const icon = $('#theme-icon');
    if (button) button.setAttribute('aria-pressed', String(theme === 'light'));
    if (icon) icon.textContent = theme === 'light' ? '☀' : '☾';
  }

  function initTheme(preferred) {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      stored = null;
    }
    applyTheme(stored || preferred || 'dark');

    $('#theme-toggle')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* storage blocked: theme simply resets on reload */
      }
    });
  }

  /* ---------- rendering ---------- */

  /** Label + value cell for the masthead spec strip. */
  function specCell(label, value) {
    if (!value) return null;
    return el('div', {}, [el('dt', { text: label }), el('dd', {}, [value])]);
  }

  function renderBasics(profile) {
    const name = profile.name || 'Portfolio';
    document.title = profile.headline ? `${name} — ${profile.headline}` : name;
    $$('[data-bind]').forEach((node) => {
      const value = profile[node.dataset.bind];
      if (typeof value === 'string') node.textContent = value;
    });

    const initials = initialsFrom(name);
    const initialsNode = $('#portrait-initials');
    if (initialsNode) initialsNode.textContent = initials || '·';

    // The bar mark is the monogram; the link itself carries the name for
    // assistive tech, so the visible wordmark can stay collapsed on first paint.
    const monogram = $('#brand-monogram');
    if (monogram) monogram.textContent = initials || '·';
    const brand = $('#brand');
    if (brand) brand.setAttribute('aria-label', `${name} — back to top`);

    if (profile.availability) {
      const status = $('#availability');
      status.textContent = profile.availability;
      status.hidden = false;
    }

    // Accent colour comes from admin settings; set through CSSOM, not inline HTML.
    if (profile.theme && profile.theme.accent) {
      document.documentElement.style.setProperty('--accent', profile.theme.accent);
    }

    // "Currently" is derived rather than typed twice: whichever role is marked
    // current, else the most recent one.
    const jobs = profile.experience || [];
    const currentJob = jobs.find((job) => job.current) || jobs[0] || null;

    const specs = $('#specs');
    if (specs) {
      const cells = [
        specCell('Based in', profile.location ? document.createTextNode(profile.location) : null),
        specCell('Currently', currentJob && currentJob.role ? document.createTextNode(currentJob.role) : null),
        specCell('Email', profile.email ? externalLink(`mailto:${profile.email}`, profile.email) : null),
      ].filter(Boolean);
      specs.replaceChildren(...cells);
      specs.hidden = cells.length === 0;
    }

    const caption = $('#portrait-caption');
    if (caption) {
      const text = currentJob && currentJob.company ? currentJob.company : profile.location || '';
      caption.textContent = text;
      caption.hidden = !text;
    }

    const socials = $('#socials');
    if (socials) {
      socials.replaceChildren(
        ...(profile.socials || [])
          .map((social) => {
            const link = externalLink(social.url, social.label);
            if (!link) return null;
            link.append(el('span', { text: '↗', attrs: { 'aria-hidden': 'true' } }));
            return el('li', {}, link);
          })
          .filter(Boolean),
      );
    }

    // Vitals in the Profile block. Email is deliberately absent: the spec strip
    // and the Contact block both carry it far more prominently.
    const facts = $('#facts');
    if (facts) {
      const entries = [
        ['Location', profile.location],
        ['Availability', profile.availability],
        ['Phone', profile.phone],
        ['Website', profile.website],
      ].filter(([, value]) => Boolean(value));
      facts.replaceChildren(
        ...entries.map(([label, value]) =>
          el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]),
        ),
      );
      facts.hidden = entries.length === 0;
    }
  }

  function renderMedia(profile) {
    const media = profile.media || {};

    const portrait = $('#portrait-img');
    const photo = safeHref(media.photo);
    if (portrait && photo) {
      portrait.src = photo;
      portrait.alt = profile.name ? `Portrait of ${profile.name}` : 'Profile photo';
      portrait.hidden = false;
      $('#portrait-initials').hidden = true;
    }

    const background = safeHref(media.background);
    const bg = $('#masthead-bg');
    if (background && bg) {
      const preload = new Image();
      preload.addEventListener('load', () => {
        bg.style.backgroundImage = `url("${background}")`;
        bg.classList.add('is-loaded');
      });
      preload.src = background;
    }

    // PDF is the format recruiters and ATS tools expect, so it leads. Word, when
    // present, is offered as a secondary link rather than a competing button.
    const primary = media.cvPdf
      ? { path: media.cvPdf, name: media.cvPdfName, format: 'PDF', route: '/cv/pdf' }
      : media.cv
        ? { path: media.cv, name: media.cvName, format: /\.pdf$/i.test(media.cv) ? 'PDF' : 'Word', route: '/cv/docx' }
        : null;

    const alternate =
      media.cvPdf && media.cv
        ? { path: media.cv, name: media.cvName, format: /\.pdf$/i.test(media.cv) ? 'PDF' : 'Word', route: '/cv/docx' }
        : null;

    const linkFor = (entry) => (IS_STATIC ? safeHref(entry.path) : entry.route);

    // Every download control is marked up the same way, so adding one to the
    // page needs no matching change here.
    $$('[data-cv="primary"]').forEach((button) => {
      button.hidden = !primary;
      if (!primary) return;

      const href = linkFor(primary);
      if (href) button.href = href;
      if (IS_STATIC) button.setAttribute('download', primary.name || 'cv');

      const label = $('[data-label]', button);
      if (label) label.textContent = `${button.dataset.cvLabel || 'Download CV'} (${primary.format})`;
    });

    $$('[data-cv-alt]').forEach((wrap) => {
      const link = $('[data-cv-alt-link]', wrap);
      wrap.hidden = !alternate || !link;
      if (!alternate || !link) return;

      const href = linkFor(alternate);
      if (href) link.href = href;
      if (IS_STATIC) link.setAttribute('download', alternate.name || 'cv');
      link.textContent = alternate.format === 'Word' ? 'Word document' : 'PDF';
    });

    const updated = $('#footer-updated');
    if (updated && profile.updatedAt) {
      const date = new Date(profile.updatedAt);
      if (!Number.isNaN(date.valueOf()) && date.getTime() > 0) {
        updated.textContent = `Updated ${date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}`;
      }
    }
  }

  function termList(items) {
    return el(
      'ul',
      { className: 'terms' },
      (items || []).filter(Boolean).map((item) => el('li', { className: 'term', text: item })),
    );
  }

  /** Skills read as a spec sheet: discipline in the margin, terms beside it. */
  function renderSkills(profile) {
    const groups = (profile.skills || []).filter((group) => group.category || (group.items || []).length);
    const matrix = $('#skills-matrix');
    matrix.replaceChildren(
      ...groups.map((group) =>
        el('div', { className: 'matrix__row' }, [
          el('dt', { className: 'matrix__label', text: group.category || 'Skills' }),
          el('dd', { className: 'matrix__terms' }, [termList(group.items)]),
        ]),
      ),
    );
    show($('#skills'), groups.length > 0);
  }

  function renderExperience(profile) {
    const jobs = profile.experience || [];
    const timeline = $('#timeline');
    timeline.replaceChildren(
      ...jobs.map((job) => {
        const when = [
          el('span', { className: 'ledger__date', text: dateRange(job.start, job.end, job.current) }),
          job.current ? el('span', { className: 'tag', text: 'Current' }) : null,
        ].filter(Boolean);

        const what = [
          el('h3', { className: 'ledger__role', text: job.role || job.company || 'Role' }),
          job.company || job.location
            ? el('p', {
                className: 'ledger__org',
                text: [job.company, job.location].filter(Boolean).join(' · '),
              })
            : null,
          job.summary ? el('p', { className: 'ledger__summary', text: job.summary }) : null,
        ].filter(Boolean);

        // A dozen bullets per role is a wall of text. Show a few, park the rest.
        const bullets = (job.bullets || []).filter(Boolean);
        if (bullets.length) {
          const first = bullets.slice(0, BULLETS_SHOWN);
          const rest = bullets.slice(BULLETS_SHOWN);
          what.push(el('ul', { className: 'points' }, first.map((bullet) => el('li', { text: bullet }))));
          if (rest.length) {
            what.push(
              el('details', { className: 'disclose' }, [
                el('summary', { text: `${rest.length} more` }),
                el('ul', { className: 'points' }, rest.map((bullet) => el('li', { text: bullet }))),
              ]),
            );
          }
        }

        return el('li', { className: 'ledger__row' }, [
          el('div', { className: 'ledger__when' }, when),
          el('div', { className: 'ledger__what' }, what),
        ]);
      }),
    );
    show($('#experience'), jobs.length > 0);
  }

  /** Projects as a numbered index; the numbers come from a CSS counter. */
  function renderProjects(profile) {
    const projects = profile.projects || [];
    const list = $('#work-list');
    list.replaceChildren(
      ...projects.map((project) => {
        const title = el('h3', { className: 'work__title' }, [
          document.createTextNode(project.title || 'Project'),
        ]);
        if (project.highlight) title.append(el('span', { className: 'tag', text: 'Featured' }));

        const body = [title];
        if (project.description) body.push(el('p', { className: 'work__desc', text: project.description }));
        if ((project.tech || []).length) body.push(termList(project.tech));

        const links = [
          externalLink(project.url, 'View project ↗'),
          externalLink(project.repo, 'Source code ↗'),
        ].filter(Boolean);
        if (links.length) body.push(el('p', { className: 'work__links' }, links));

        return el('li', { className: 'work__item' }, [el('div', { className: 'work__body' }, body)]);
      }),
    );
    show($('#projects'), projects.length > 0);
  }

  /** One ledger row: dates on the left, everything else on the right. */
  function ledgerRow(date, title, org, extra) {
    return el('li', { className: 'ledger__row' }, [
      el(
        'div',
        { className: 'ledger__when' },
        date ? [el('span', { className: 'ledger__date', text: date })] : [],
      ),
      el(
        'div',
        { className: 'ledger__what' },
        [
          el('h3', { className: 'ledger__role', text: title }),
          org ? el('p', { className: 'ledger__org', text: org }) : null,
          extra || null,
        ].filter(Boolean),
      ),
    ]);
  }

  function renderBackground(profile) {
    const education = profile.education || [];
    const certifications = profile.certifications || [];

    const eduList = $('#education-list');
    eduList.replaceChildren(
      ...(education.length
        ? [
            el('p', { className: 'eyebrow', text: 'Education' }),
            el(
              'ul',
              { className: 'ledger ledger--tight' },
              education.map((item) =>
                ledgerRow(
                  dateRange(item.start, item.end, false),
                  item.degree || item.school || 'Education',
                  [item.degree ? item.school : '', item.location].filter(Boolean).join(' · '),
                  item.details ? el('p', { className: 'ledger__summary', text: item.details }) : null,
                ),
              ),
            ),
          ]
        : []),
    );

    const certList = $('#certification-list');
    certList.replaceChildren(
      ...(certifications.length
        ? [
            el('p', { className: 'eyebrow', text: 'Certifications' }),
            el(
              'ul',
              { className: 'ledger ledger--tight' },
              certifications.map((item) => {
                const link = externalLink(item.url, 'Verify ↗');
                return ledgerRow(
                  item.year || '',
                  item.name || 'Certification',
                  item.issuer || '',
                  link ? el('p', { className: 'work__links' }, link) : null,
                );
              }),
            ),
          ]
        : []),
    );

    show($('#education'), education.length > 0 || certifications.length > 0);
  }

  function renderExtras(profile) {
    const languages = profile.languages || [];
    const interests = profile.interests || [];

    $('#language-list').replaceChildren(
      ...(languages.length
        ? [
            el('p', { className: 'eyebrow', text: 'Languages' }),
            termList(languages.map((lang) => (lang.level ? `${lang.name} — ${lang.level}` : lang.name))),
          ]
        : []),
    );

    $('#interest-list').replaceChildren(
      ...(interests.length
        ? [el('p', { className: 'eyebrow', text: 'Interests' }), termList(interests)]
        : []),
    );

    show($('#extras'), languages.length > 0 || interests.length > 0);
  }

  function renderContact(profile) {
    // The email is the headline of this block, so it is not repeated in the rows.
    const mail = $('#contact-email');
    if (mail) {
      mail.hidden = !profile.email;
      if (profile.email) {
        mail.href = `mailto:${profile.email}`;
        mail.textContent = profile.email;
      }
    }

    const rows = [
      profile.phone ? ['Phone', `tel:${profile.phone.replace(/\s+/g, '')}`, profile.phone] : null,
      profile.website ? ['Website', profile.website, prettyUrl(profile.website)] : null,
      ...(profile.socials || []).map((social) =>
        social && social.url ? [social.label || 'Profile', social.url, prettyUrl(social.url)] : null,
      ),
    ].filter(Boolean);

    const built = rows
      .map(([label, url, value]) => {
        const link = externalLink(url, value, 'reach__v');
        if (!link) return null;
        return el('li', {}, [el('span', { className: 'reach__k', text: label }), link]);
      })
      .filter(Boolean);

    const list = $('#reach-list');
    if (list) {
      list.replaceChildren(...built);
      list.hidden = built.length === 0;
    }

    const cta = $('#contact-cta');
    if (cta) cta.hidden = !profile.email && built.length === 0;
  }

  /**
   * Numbers the section index and the block headings from the same count, and
   * drops index entries whose section has no content — so the navigation never
   * offers a link to an empty page region.
   */
  function syncIndex() {
    let position = 0;
    $$('#nav-list a').forEach((link) => {
      const href = link.getAttribute('href') || '';
      const section = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
      const item = link.closest('li');
      const visible = Boolean(section) && !section.hidden;

      if (item) item.hidden = !visible;
      if (!visible) return;

      position += 1;
      const numbered = String(position).padStart(2, '0');
      const badge = $('.index__num', link);
      if (badge) badge.textContent = numbered;
      const heading = $('.block__num', section);
      if (heading) heading.textContent = numbered;
    });
  }

  function render(profile) {
    renderBasics(profile);
    renderMedia(profile);
    renderSkills(profile);
    renderExperience(profile);
    renderProjects(profile);
    renderBackground(profile);
    renderExtras(profile);
    renderContact(profile);
    syncIndex();
    document.body.dataset.loaded = 'true';
  }

  /* ---------- interactions ---------- */

  function initNav() {
    const index = $('#index');
    const toggle = $('#nav-toggle');

    toggle?.addEventListener('click', () => {
      const open = index.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close section index' : 'Open section index');
    });

    $$('#nav-list a').forEach((link) => {
      link.addEventListener('click', () => {
        index.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
      });
    });

    const bar = $('#bar');
    const progress = $('#scroll-progress');
    const mastheadName = $('#masthead-name');

    const onScroll = () => {
      bar.classList.toggle('is-stuck', window.scrollY > 8);

      // Reveal the bar wordmark only once the masthead name is behind the bar,
      // so the name is never shown twice at the same size.
      const passed = mastheadName
        ? mastheadName.getBoundingClientRect().bottom <= bar.offsetHeight
        : window.scrollY > 8;
      bar.classList.toggle('is-past-masthead', passed);

      // Above the first section nothing is "current", so the scroll spy's last
      // active entry is cleared rather than left highlighted.
      const firstBlock = $('.block:not([hidden])');
      if (firstBlock && firstBlock.getBoundingClientRect().top > window.innerHeight * 0.55) {
        $$('#nav-list a.is-active').forEach((link) => link.classList.remove('is-active'));
      }

      const height = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = height > 0 ? Math.min(1, window.scrollY / height) : 0;
      progress.style.width = `${(ratio * 100).toFixed(2)}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  function initObservers() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((node) => node.classList.add('is-visible'));
      return;
    }

    const revealer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    $$('.reveal').forEach((node) => revealer.observe(node));

    const links = $$('#nav-list a');
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    links.forEach((link) => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (target) spy.observe(target);
    });
  }

  /**
   * Bullets parked behind a disclosure still belong on a printed CV, so they
   * are opened for the print run and put back afterwards.
   */
  function initPrint() {
    const forced = new Set();

    window.addEventListener('beforeprint', () => {
      $$('details.disclose').forEach((node) => {
        if (node.open) return;
        node.open = true;
        forced.add(node);
      });
    });

    window.addEventListener('afterprint', () => {
      forced.forEach((node) => {
        node.open = false;
      });
      forced.clear();
    });
  }

  /* ---------- boot ---------- */

  async function boot() {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    initTheme(prefersLight ? 'light' : 'dark');
    initNav();
    initPrint();
    $('#footer-year').textContent = String(new Date().getFullYear());

    try {
      const response = await fetch(PROFILE_URL, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Profile request failed (${response.status})`);
      const profile = await response.json();
      render(profile);
      if (profile.theme && profile.theme.mode) {
        let stored = null;
        try {
          stored = localStorage.getItem(THEME_KEY);
        } catch {
          stored = null;
        }
        if (!stored) applyTheme(profile.theme.mode);
      }
    } catch (error) {
      console.error(error);
      toast('Could not load profile content. Please refresh the page.');
    } finally {
      initObservers();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
