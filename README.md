# Portfolio &amp; CV site

A personal portfolio website with a private admin area. The public page renders your
profile, experience, projects and a downloadable CV. The admin area, protected by a
single username and password, lets you edit every section and upload your photo,
background image and CV file without touching any code.

## What you get

- **Public portfolio** at `/` — hero, about, skills, experience timeline, projects,
  education, certifications, languages, contact. Responsive, dark/light theme,
  and `Ctrl/Cmd + P` prints a clean one-page CV.
- **CV download** at `/cv` — always serves the latest file you uploaded.
- **Admin area** at `/admin` — sign in, edit content in tabs, drag and drop
  uploads with progress, reorder entries, `Ctrl/Cmd + S` to save.
- **No database** — content is a single JSON file, uploads are files on disk.

## Quick start

```bash
npm install
npm run setup     # asks for your admin username and password, writes .env
npm start         # http://localhost:3000
```

Then open `http://localhost:3000/admin`, sign in, and start filling in your profile.

If port 3000 is already used on your machine, set `PORT` in `.env` to something else
(for example `4173`) and update `SITE_URL` to match.

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm start` | Runs the server |
| `npm run dev` | Runs the server and restarts on file changes |
| `npm run setup` | Creates `.env` with your admin credentials and a random session secret |
| `npm run hash-password` | Prints a bcrypt hash for `ADMIN_PASSWORD_HASH` |
| `npm run check` | Parses every JS file to catch syntax errors |

## How your content is stored

| What | Where | Notes |
| --- | --- | --- |
| Profile text | `data/profile.json` | Created on first boot from starter content |
| Photo, background, CV | `uploads/photo`, `uploads/background`, `uploads/cv` | File names are generated, never taken from the upload |

Both directories are git-ignored: your personal content never ends up in the
repository. Back them up (or mount them as volumes) when deploying.

## Configuration

Copy `.env.example` to `.env`, or let `npm run setup` build it for you.

| Variable | Purpose |
| --- | --- |
| `ADMIN_USERNAME` | The only account that can sign in |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of your password — the password itself is never stored |
| `SESSION_SECRET` | Signs the session cookie, must be long and random |
| `COOKIE_SECURE` | `true` when the site is served over HTTPS (required in production) |
| `SITE_URL` | Public URL, used for canonical links and origin checks |
| `PORT` | Port to listen on |
| `DATA_DIR`, `UPLOAD_DIR` | Where content is written; point these at a mounted volume in production |
| `MAX_IMAGE_BYTES`, `MAX_DOC_BYTES` | Upload size limits |
| `TRUSTED_ORIGINS` | Extra origins allowed to send state-changing requests (usually empty) |

The server refuses to start if the admin credentials or session secret are missing,
or if `NODE_ENV=production` without `COOKIE_SECURE=true`. That is deliberate: it can
never come up with an unprotected admin area.

## Security notes

- Password is stored only as a bcrypt hash (cost 12); login comparison is constant-time
  and returns the same vague error for a wrong username or a wrong password.
- Login is rate limited to 8 failed attempts per 15 minutes per IP.
- Session is a signed, `httpOnly`, `SameSite=Strict` cookie with a sliding 8 hour window.
- Every state-changing admin request needs a per-session CSRF token plus a same-origin check.
- Uploads are validated three ways: declared MIME type, file extension, and the actual
  magic bytes of the stored file. Anything that fails is deleted immediately.
- Stored file names are generated server side, and deletes are constrained to the
  uploads directory, so path traversal cannot escape it.
- Content Security Policy, `nosniff`, `frame-ancestors 'none'`, HSTS in production,
  and no `X-Powered-By` header.
- Admin input is normalised against a whitelist schema: unknown fields are dropped,
  strings are length-capped, and only `http(s)`, `mailto:` and `tel:` links survive.

If you ever need to change your password, run `npm run hash-password` and replace
`ADMIN_PASSWORD_HASH` (in `.env` locally, or in your host's secret settings).

## Deploying

See [DEPLOY.md](DEPLOY.md) for DigitalOcean instructions — both a Droplet with Docker
(recommended, keeps uploads) and App Platform (simpler, but the filesystem is wiped
on every deploy).

## Project layout

```
src/
  server.js            Express app, security middleware, error handling
  config.js            Environment loading and fail-closed validation
  lib/                 Profile store, whitelist schema, upload rules
  middleware/           Auth, CSRF, origin guard
  routes/              Public routes and admin API
public/
  index.html           Public portfolio
  admin/index.html     Login + admin dashboard
  assets/              CSS and JS
scripts/               Setup, password hashing, syntax check
```
