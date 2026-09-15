'use strict';

/**
 * Whitelist based normalisation for the profile document.
 * Anything not described here is dropped, so admin input can never inject
 * unexpected keys, oversized payloads or non-string values into storage.
 */

const LIMITS = {
  short: 120,
  medium: 300,
  long: 4000,
  url: 500,
  listItems: 50,
  bullets: 20,
};

function str(value, max = LIMITS.medium) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

/** Only http(s), mailto and tel links survive; blocks javascript: and data: URLs. */
function link(value) {
  const raw = str(value, LIMITS.url);
  if (!raw) return '';
  if (/^(mailto:|tel:)/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    // Bare domain typed without a scheme: assume https rather than dropping it.
    if (!/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(raw)) return '';
    try {
      return new URL(`https://${raw}`).toString();
    } catch {
      return '';
    }
  }
}

function hexColor(value, fallback) {
  const raw = str(value, 9);
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : fallback;
}

function list(value, mapper, max = LIMITS.listItems) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(mapper).filter(Boolean);
}

function stringList(value, max = LIMITS.listItems, itemMax = LIMITS.short) {
  return list(value, (item) => str(item, itemMax) || null, max);
}

const normalise = {
  social(item) {
    if (!item || typeof item !== 'object') return null;
    const url = link(item.url);
    const label = str(item.label, LIMITS.short);
    if (!url || !label) return null;
    return { label, url, icon: str(item.icon, 40).toLowerCase() };
  },

  skillGroup(item) {
    if (!item || typeof item !== 'object') return null;
    const category = str(item.category, LIMITS.short);
    const items = stringList(item.items, 40);
    if (!category && !items.length) return null;
    return { category, items };
  },

  job(item) {
    if (!item || typeof item !== 'object') return null;
    const role = str(item.role, LIMITS.short);
    const company = str(item.company, LIMITS.short);
    if (!role && !company) return null;
    return {
      role,
      company,
      location: str(item.location, LIMITS.short),
      start: str(item.start, 40),
      end: str(item.end, 40),
      current: Boolean(item.current),
      summary: str(item.summary, LIMITS.long),
      bullets: stringList(item.bullets, LIMITS.bullets, LIMITS.medium),
    };
  },

  school(item) {
    if (!item || typeof item !== 'object') return null;
    const degree = str(item.degree, LIMITS.short);
    const school = str(item.school, LIMITS.short);
    if (!degree && !school) return null;
    return {
      degree,
      school,
      location: str(item.location, LIMITS.short),
      start: str(item.start, 40),
      end: str(item.end, 40),
      details: str(item.details, LIMITS.long),
    };
  },

  project(item) {
    if (!item || typeof item !== 'object') return null;
    const title = str(item.title, LIMITS.short);
    if (!title) return null;
    return {
      title,
      description: str(item.description, LIMITS.long),
      tech: stringList(item.tech, 20),
      url: link(item.url),
      repo: link(item.repo),
      highlight: Boolean(item.highlight),
    };
  },

  certification(item) {
    if (!item || typeof item !== 'object') return null;
    const name = str(item.name, LIMITS.short);
    if (!name) return null;
    return {
      name,
      issuer: str(item.issuer, LIMITS.short),
      year: str(item.year, 20),
      url: link(item.url),
    };
  },

  language(item) {
    if (!item || typeof item !== 'object') return null;
    const name = str(item.name, LIMITS.short);
    if (!name) return null;
    return { name, level: str(item.level, LIMITS.short) };
  },
};

/**
 * @param {unknown} input raw admin payload
 * @param {object} current stored document, used to preserve server-owned fields
 */
function normaliseProfile(input, current = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const currentMedia = (current && current.media) || {};

  return {
    name: str(source.name, LIMITS.short),
    headline: str(source.headline, LIMITS.medium),
    tagline: str(source.tagline, LIMITS.medium),
    location: str(source.location, LIMITS.short),
    email: str(source.email, LIMITS.short),
    phone: str(source.phone, 40),
    website: link(source.website),
    availability: str(source.availability, LIMITS.short),
    summary: str(source.summary, LIMITS.long),
    socials: list(source.socials, normalise.social, 12),
    skills: list(source.skills, normalise.skillGroup, 12),
    experience: list(source.experience, normalise.job, 30),
    education: list(source.education, normalise.school, 15),
    projects: list(source.projects, normalise.project, 30),
    certifications: list(source.certifications, normalise.certification, 30),
    languages: list(source.languages, normalise.language, 12),
    interests: stringList(source.interests, 20),
    theme: {
      accent: hexColor(source.theme && source.theme.accent, '#6c8cff'),
      mode: ['light', 'dark'].includes(source.theme && source.theme.mode) ? source.theme.mode : 'dark',
    },
    // Media is only ever changed through the upload endpoints.
    media: {
      photo: typeof currentMedia.photo === 'string' ? currentMedia.photo : '',
      background: typeof currentMedia.background === 'string' ? currentMedia.background : '',
      cv: typeof currentMedia.cv === 'string' ? currentMedia.cv : '',
      cvName: typeof currentMedia.cvName === 'string' ? currentMedia.cvName : '',
      cvUpdatedAt: typeof currentMedia.cvUpdatedAt === 'string' ? currentMedia.cvUpdatedAt : '',
    },
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { normaliseProfile, LIMITS };
