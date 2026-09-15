'use strict';

/**
 * Builds a static copy of the public site into dist/.
 *
 * The result is plain files: HTML, CSS, JS, your profile as JSON, and only the
 * media actually referenced by the profile. No server, no admin area — keep
 * editing locally with `npm start`, then run this and publish dist/ again.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { config } = require('../src/config');
const store = require('../src/lib/profile-store');

const OUT = path.resolve(config.root, 'dist');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function copyDir(from, to, skip = () => false) {
  await fsp.mkdir(to, { recursive: true });
  for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (skip(source, entry)) continue;
    if (entry.isDirectory()) await copyDir(source, target, skip);
    else await fsp.copyFile(source, target);
  }
}

/** Meta tags matter here: this is what LinkedIn and Google show for your link. */
function injectMeta(html, profile, siteUrl) {
  const name = profile.name || 'Portfolio';
  const title = profile.headline ? `${name} — ${profile.headline}` : name;
  const description =
    profile.tagline ||
    (profile.summary || '').split('\n')[0].slice(0, 200) ||
    'Personal portfolio, experience and downloadable CV.';

  const image = profile.media && profile.media.photo ? `${siteUrl}${profile.media.photo}` : '';

  const tags = [
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    siteUrl ? `<meta property="og:url" content="${escapeHtml(siteUrl)}/" />` : '',
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    siteUrl ? `<link rel="canonical" href="${escapeHtml(siteUrl)}/" />` : '',
  ].filter(Boolean);

  return html
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(title)}</title>`,
    )
    .replace(
      /<meta name="description"[^>]*\/>/,
      `<meta name="description" content="${escapeHtml(description)}" />\n    ${tags.join('\n    ')}`,
    )
    // Point the page at the exported JSON instead of the admin API.
    .replace(
      '<script src="/assets/js/site.js" defer></script>',
      '<script src="/assets/js/site.js" data-profile="/profile.json" defer></script>',
    )
    // No admin area on a static host, so drop the link to it.
    .replace(/\s*<a href="\/admin" rel="nofollow">Admin<\/a>\s*<span class="footer__dot" aria-hidden="true">·<\/span>/, '');
}

const HEADERS = `# Security headers for the static build, mirroring the Node app.
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; base-uri 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests

# Long cache for fingerprinted uploads and assets.
/uploads/*
  Cache-Control: public, max-age=3600

# Always download the CV rather than rendering it in the tab.
/uploads/cv/*
  Content-Disposition: attachment
`;

const ROBOTS = `User-agent: *
Allow: /
`;

async function main() {
  const siteUrlArg = process.argv.slice(2).find((arg) => /^https?:\/\//i.test(arg));
  const siteUrl = (siteUrlArg || '').replace(/\/$/, '');

  await store.init();
  const profile = store.get();

  if (!profile.name || profile.name === 'Your Name') {
    console.warn('Warning: the profile still has starter content. Run `npm start` and fill it in first.\n');
  }

  await fsp.rm(OUT, { recursive: true, force: true });
  await fsp.mkdir(OUT, { recursive: true });

  // 1. Public assets, minus everything that only the admin area uses.
  const adminOnly = new Set([
    'admin',
    path.join('assets', 'css', 'admin.css'),
    path.join('assets', 'js', 'admin.js'),
  ]);
  await copyDir(config.paths.public, OUT, (source) => {
    const relative = path.relative(config.paths.public, source);
    return adminOnly.has(relative) || relative.startsWith(`admin${path.sep}`);
  });

  // 2. The profile itself.
  await fsp.writeFile(path.join(OUT, 'profile.json'), JSON.stringify(profile, null, 2), 'utf8');

  // 3. Only the media the profile actually points at, so old uploads stay private.
  const media = profile.media || {};
  const referenced = [media.photo, media.background, media.cv].filter(
    (value) => typeof value === 'string' && value.startsWith('/uploads/'),
  );

  const copied = [];
  const missing = [];
  for (const publicPath of referenced) {
    const relative = publicPath.replace(/^\/uploads\//, '');
    const source = path.resolve(config.paths.uploads, relative);
    if (!source.startsWith(path.resolve(config.paths.uploads) + path.sep)) continue;
    if (!fs.existsSync(source)) {
      missing.push(publicPath);
      continue;
    }
    const target = path.join(OUT, 'uploads', relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target);
    copied.push(publicPath);
  }

  // 4. Rewrite the HTML: meta tags, static profile source, no admin link.
  const indexPath = path.join(OUT, 'index.html');
  const html = await fsp.readFile(indexPath, 'utf8');
  await fsp.writeFile(indexPath, injectMeta(html, profile, siteUrl), 'utf8');

  // 5. Host configuration.
  await fsp.writeFile(path.join(OUT, '_headers'), HEADERS, 'utf8');
  await fsp.writeFile(path.join(OUT, 'robots.txt'), ROBOTS, 'utf8');

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(OUT);
  const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);

  console.log(`Static site written to ${path.relative(config.root, OUT)}${path.sep}`);
  console.log(`  ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`  profile: ${profile.name}`);
  console.log(`  media:   ${copied.length ? copied.join(', ') : 'none'}`);
  if (missing.length) console.log(`  MISSING: ${missing.join(', ')} (re-upload in the admin area)`);
  if (siteUrl) console.log(`  meta:    canonical and social tags use ${siteUrl}`);
  else console.log('  meta:    pass your URL to add canonical/social tags, e.g. npm run export -- https://you.workers.dev');

  // A Wrangler config means the project is already wired up, so show the short command.
  const configured = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].some((file) =>
    fs.existsSync(path.join(config.root, file)),
  );
  console.log(
    configured
      ? '\nPublish it:  npx wrangler deploy'
      : '\nPublish it:  drag dist/ into the Cloudflare dashboard, or npx wrangler deploy dist',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
