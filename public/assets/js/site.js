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

  function dateRange(start, end, current) {
    const from = start || '';
    const to = current ? 'Present' : end || '';
    if (from && to) return `${from} — ${to}`;
    return from || to || '';
  }

  function show(section, visible) {
    if (section) section.hidden = !visible;
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

  function renderBasics(profile) {
    const name = profile.name || 'Portfolio';
    document.title = profile.headline ? `${name} — ${profile.headline}` : name;
    $$('[data-bind]').forEach((node) => {
      const value = profile[node.dataset.bind];
      if (typeof value === 'string') node.textContent = value;
    });

    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
    const initialsNode = $('#portrait-initials');
    if (initialsNode) initialsNode.textContent = initials || '·';

    if (profile.availability) {
      const status = $('#availability');
      status.textContent = profile.availability;
      status.hidden = false;
    }

    // Accent colour comes from admin settings; set through CSSOM, not inline HTML.
    if (profile.theme && profile.theme.accent) {
      document.documentElement.style.setProperty('--accent', profile.theme.accent);
    }

    const facts = $('#hero-facts');
    facts.replaceChildren(
      ...[
        profile.location ? el('li', { text: `📍 ${profile.location}` }) : null,
        profile.email ? el('li', { text: `✉ ${profile.email}` }) : null,
        profile.phone ? el('li', { text: `☎ ${profile.phone}` }) : null,
      ].filter(Boolean),
    );

    const socials = $('#socials');
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

    const meta = $('#about-meta');
    const entries = [
      ['Location', profile.location],
      ['Email', profile.email],
      ['Phone', profile.phone],
      ['Website', profile.website],
      ['Availability', profile.availability],
    ].filter(([, value]) => Boolean(value));
    meta.replaceChildren(
      ...entries.map(([label, value]) =>
        el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]),
      ),
    );
    meta.hidden = entries.length === 0;
  }

  function renderMedia(profile) {
    const media = profile.media || {};

    const portrait = $('#portrait-img');
    const photo = safeHref(media.photo);
    if (photo) {
      portrait.src = photo;
      portrait.alt = profile.name ? `Portrait of ${profile.name}` : 'Profile photo';
      portrait.hidden = false;
      $('#portrait-initials').hidden = true;
    }

    const background = safeHref(media.background);
    if (background) {
      const bg = $('#hero-bg');
      const preload = new Image();
      preload.addEventListener('load', () => {
        bg.style.backgroundImage = `url("${background}")`;
        bg.classList.add('is-loaded');
      });
      preload.src = background;
    }

    const hasCv = Boolean(media.cv);
    const cvHref = IS_STATIC ? safeHref(media.cv) : '/cv';
    ['#cv-download', '#cv-download-2'].forEach((selector) => {
      const button = $(selector);
      if (!button) return;
      button.hidden = !hasCv;
      if (hasCv && cvHref) {
        button.href = cvHref;
        if (IS_STATIC) button.setAttribute('download', media.cvName || 'cv');
      }
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

  function renderSkills(profile) {
    const groups = (profile.skills || []).filter((group) => group.category || (group.items || []).length);
    const grid = $('#skills-grid');
    grid.replaceChildren(
      ...groups.map((group) =>
        el('article', { className: 'skill-group' }, [
          el('h3', { text: group.category || 'Skills' }),
          el(
            'ul',
            { className: 'chips' },
            (group.items || []).map((item) => el('li', { className: 'chip', text: item })),
          ),
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
        const heading = el('h3', { className: 'timeline__role' }, [
          document.createTextNode(job.role || ''),
        ]);
        if (job.company) {
          heading.append(
            document.createTextNode(job.role ? ' · ' : ''),
            el('span', { className: 'timeline__company', text: job.company }),
          );
        }
        if (job.current) {
          heading.append(el('span', { className: 'badge', text: 'Current' }));
        }

        const children = [
          el('div', { className: 'timeline__top' }, [
            heading,
            el('span', { className: 'timeline__dates', text: dateRange(job.start, job.end, job.current) }),
          ]),
        ];
        if (job.location) children.push(el('p', { className: 'timeline__meta', text: job.location }));
        if (job.summary) children.push(el('p', { className: 'timeline__summary', text: job.summary }));
        if ((job.bullets || []).length) {
          children.push(
            el(
              'ul',
              { className: 'bullets' },
              job.bullets.map((bullet) => el('li', { text: bullet })),
            ),
          );
        }
        return el('li', { className: 'timeline__item' }, children);
      }),
    );
    show($('#experience'), jobs.length > 0);
  }

  function renderProjects(profile) {
    const projects = profile.projects || [];
    const cards = $('#project-cards');
    cards.replaceChildren(
      ...projects.map((project) => {
        const title = el('h3', { className: 'card__title' }, [
          document.createTextNode(project.title || 'Project'),
        ]);
        if (project.highlight) title.append(el('span', { className: 'badge', text: 'Featured' }));

        const children = [title];
        if (project.description) children.push(el('p', { className: 'card__desc', text: project.description }));
        if ((project.tech || []).length) {
          children.push(
            el(
              'ul',
              { className: 'chips' },
              project.tech.map((tech) => el('li', { className: 'chip', text: tech })),
            ),
          );
        }

        const links = [
          externalLink(project.url, 'View project ↗'),
          externalLink(project.repo, 'Source code ↗'),
        ].filter(Boolean);
        if (links.length) children.push(el('div', { className: 'card__links' }, links));

        return el(
          'article',
          { className: `card${project.highlight ? ' card--highlight' : ''}` },
          children,
        );
      }),
    );
    show($('#projects'), projects.length > 0);
  }

  function renderBackground(profile) {
    const education = profile.education || [];
    const certifications = profile.certifications || [];

    const eduList = $('#education-list');
    eduList.replaceChildren(
      ...(education.length ? [el('p', { className: 'stack__title', text: 'Education' })] : []),
      ...education.map((item) =>
        el('article', { className: 'entry' }, [
          el('h3', { text: item.degree || item.school }),
          item.degree && item.school ? el('p', { className: 'entry__sub', text: item.school }) : null,
          el('p', {
            className: 'entry__meta',
            text: [dateRange(item.start, item.end, false), item.location].filter(Boolean).join(' · '),
          }),
          item.details ? el('p', { className: 'entry__body', text: item.details }) : null,
        ].filter(Boolean)),
      ),
    );

    const certList = $('#certification-list');
    certList.replaceChildren(
      ...(certifications.length ? [el('p', { className: 'stack__title', text: 'Certifications' })] : []),
      ...certifications.map((item) => {
        const link = externalLink(item.url, 'Verify ↗');
        return el('article', { className: 'entry' }, [
          el('h3', { text: item.name }),
          item.issuer ? el('p', { className: 'entry__sub', text: item.issuer }) : null,
          item.year ? el('p', { className: 'entry__meta', text: item.year }) : null,
          link ? el('p', { className: 'entry__body' }, link) : null,
        ].filter(Boolean));
      }),
    );

    show($('#education'), education.length > 0 || certifications.length > 0);
  }

  function renderExtras(profile) {
    const languages = profile.languages || [];
    const interests = profile.interests || [];

    const langList = $('#language-list');
    langList.replaceChildren(
      ...(languages.length
        ? [
            el('p', { className: 'stack__title', text: 'Languages' }),
            el(
              'ul',
              { className: 'chips' },
              languages.map((lang) =>
                el('li', {
                  className: 'chip',
                  text: lang.level ? `${lang.name} — ${lang.level}` : lang.name,
                }),
              ),
            ),
          ]
        : []),
    );

    const interestList = $('#interest-list');
    interestList.replaceChildren(
      ...(interests.length
        ? [
            el('p', { className: 'stack__title', text: 'Interests' }),
            el(
              'ul',
              { className: 'chips' },
              interests.map((interest) => el('li', { className: 'chip', text: interest })),
            ),
          ]
        : []),
    );

    show($('#extras'), languages.length > 0 || interests.length > 0);
  }

  function renderContact(profile) {
    const links = [
      profile.email ? externalLink(`mailto:${profile.email}`, `✉ ${profile.email}`) : null,
      profile.phone ? externalLink(`tel:${profile.phone.replace(/\s+/g, '')}`, `☎ ${profile.phone}`) : null,
      profile.website ? externalLink(profile.website, '🌐 Website') : null,
      ...(profile.socials || []).map((social) => externalLink(social.url, social.label)),
    ].filter(Boolean);

    $('#contact-links').replaceChildren(...links.map((link) => el('li', {}, link)));
    const cta = $('#contact-cta');
    if (cta) cta.hidden = links.length === 0;
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
    document.body.dataset.loaded = 'true';
  }

  /* ---------- interactions ---------- */

  function initNav() {
    const nav = $('.nav');
    const toggle = $('#nav-toggle');

    toggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    $$('.nav__list a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
      });
    });

    const topbar = $('#topbar');
    const progress = $('#scroll-progress');
    const onScroll = () => {
      topbar.classList.toggle('is-stuck', window.scrollY > 8);
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = height > 0 ? Math.min(1, window.scrollY / height) : 0;
      progress.style.width = `${(ratio * 100).toFixed(2)}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );
    $$('.reveal').forEach((node) => revealer.observe(node));

    const links = $$('.nav__list a');
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

  /* ---------- boot ---------- */

  async function boot() {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    initTheme(prefersLight ? 'light' : 'dark');
    initNav();
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
