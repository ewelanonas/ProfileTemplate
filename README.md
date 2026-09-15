# Portfolio &amp; CV site

A personal portfolio website with a private admin area. The public page renders your
profile, experience, projects and a downloadable CV. The admin area, protected by a single
username and password, lets you edit every section and upload your photo, background image
and CV file without touching any code.

- **Public portfolio** at `/` — hero, about, skills, experience timeline, projects,
  education, certifications, languages, contact. Responsive, dark/light theme.
- **CV download** at `/cv` — always serves the latest file you uploaded.
- **Print-friendly** — `Ctrl/Cmd + P` on the public page produces a clean one-page CV.
- **Admin area** at `/admin` — edit content in tabs, drag-and-drop uploads with progress,
  reorder entries, `Ctrl/Cmd + S` to save.
- **No database** — content is one JSON file, uploads are files on disk.

---

## Table of contents

- [Requirements](#requirements)
- [Running it on your computer](#running-it-on-your-computer)
- [Filling in your profile](#filling-in-your-profile)
- [Uploading photo, background and CV](#uploading-photo-background-and-cv)
- [Changing your username or password](#changing-your-username-or-password)
- [Where your content is stored](#where-your-content-is-stored)
- [Everyday commands](#everyday-commands)
- [Hosting options](#hosting-options)
- [Troubleshooting](#troubleshooting)
- [Configuration reference](#configuration-reference)
- [Security notes](#security-notes)
- [Project layout](#project-layout)

---

## Requirements

| | Needed | Check with |
| --- | --- | --- |
| Node.js 20 or newer | yes | `node -v` |
| npm | comes with Node | `npm -v` |
| Git | only to clone or push | `git --version` |
| A browser | yes | — |

If Node is missing, install the LTS build from [nodejs.org](https://nodejs.org/), then
close and reopen your terminal so `node` is on your `PATH`.

---

## Running it on your computer

### Step 1 — Get the code

If you already have the project folder, open a terminal in it and skip to Step 2.

```powershell
git clone https://github.com/ewelanonas/ProfileTemplate.git
cd ProfileTemplate
```

### Step 2 — Install dependencies

```powershell
npm install
```

Downloads the packages into `node_modules`. Takes a few seconds.

### Step 3 — Create your admin account

```powershell
npm run setup
```

It asks for four things:

| Question | What to enter |
| --- | --- |
| Admin username | anything you will remember, at least 3 characters |
| Admin password | at least 12 characters, typed twice |
| Port | `3000`, or another port if 3000 is busy (see note below) |
| Site URL | `http://localhost:3000`, matching the port you chose |

This writes a `.env` file containing your username, a **bcrypt hash** of your password
(never the password itself) and a fresh random session secret. The file is git-ignored, so
it never reaches GitHub.

> **Note on ports.** Some corporate laptops already run something on port 3000. If the app
> will not start, or the page shows a strange error, pick another port such as `4173`
> during setup. To check what holds a port on Windows:
> `Get-NetTCPConnection -LocalPort 3000 -State Listen`

### Step 4 — Start the server

```powershell
npm start
```

You should see:

```
[server] portfolio running at http://localhost:3000
[server] admin area at http://localhost:3000/admin
```

Leave this terminal open — closing it stops the site. `Ctrl + C` stops it on purpose.

While editing code, `npm run dev` restarts the server automatically on every file change.

### Step 5 — Open it

- Public site: <http://localhost:3000>
- Admin area: <http://localhost:3000/admin>

Sign in with the username and password from Step 3.

---

## Filling in your profile

Everything is edited in the admin area, organised into tabs:

| Tab | What lives there |
| --- | --- |
| 🖼 Photo, CV & background | File uploads. These save immediately |
| 👤 Basics | Name, headline, tagline, location, email, phone, website, availability badge, about text, social links |
| 🛠 Skills | Skill groups, one skill per line inside each group |
| 💼 Experience | Roles, newest first. Achievements one per line |
| 🚀 Projects | Project cards. Ticking *Feature this project* highlights it |
| 🎓 Education & certificates | Degrees and certifications |
| 🌍 Languages & interests | Optional extras |
| 🎨 Appearance | Accent colour and the default theme visitors see |

How editing works:

1. Change anything. A yellow **Unsaved changes** pill appears in the top bar.
2. Press **Save changes** (or `Ctrl + S`).
3. Refresh the public page to see the result.

Inside repeating lists like Experience or Projects, each entry has three buttons: **↑** and
**↓** to reorder, and **✕** to delete. `+ Add role`, `+ Add project` and so on create a new
empty entry. Leaving an entry completely blank drops it when you save.

Sections with no content hide themselves on the public page, so an empty Projects or
Languages section leaves no gap.

---

## Uploading photo, background and CV

Open the **🖼 Photo, CV & background** tab, then either drag a file onto the dashed box or
click it to pick a file. Uploads save on their own — no need to press Save changes. A
progress bar runs while the file transfers and a preview appears when it finishes.

| Slot | Formats | Max size | Advice |
| --- | --- | --- | --- |
| Profile photo | JPG, PNG, WebP | 5 MB | Square, around 800×800. It is cropped to centre, so keep your face centred |
| Hero background | JPG, PNG, WebP | 5 MB | Wide, 1920×1080 or larger. Darker, simpler images read best because your name sits on top |
| CV | PDF, DOCX | 10 MB | PDF is safer: formatting never shifts and some companies block Word files |

**Remove** deletes the current file and clears the slot. The background is optional; without
one the hero falls back to a gradient and still looks finished.

Files are checked three ways before being accepted: the declared type, the file extension,
and the actual bytes inside the file. A file renamed to `.png` that is not really a PNG is
rejected and deleted. iPhone `.HEIC` photos are not accepted — export them as JPG first.

---

## Changing your username or password

The credentials live in `.env` at the project root, as `ADMIN_USERNAME` and
`ADMIN_PASSWORD_HASH`. The hash cannot be reversed into your password, and there is
deliberately no password-change screen inside the website: the only way to change it is on
the machine that runs the app.

**Easiest — rewrite `.env`:**

```powershell
npm run setup
```

Answer the questions again. Your content is untouched: it lives in `data/` and `uploads/`,
not in `.env`. Restart the server afterwards (`Ctrl + C`, then `npm start`).

**Only change the password, keep everything else:**

```powershell
npm run hash-password
```

It prints a line like `ADMIN_PASSWORD_HASH=$2b$12$...`. Replace that line in `.env`, save,
and restart the server.

Forgot the password? There is nothing to recover — run `npm run setup` and set a new one.

Changing `SESSION_SECRET` in `.env` signs out every active session immediately. That is the
fastest way to lock out a session you are unsure about.

---

## Where your content is stored

| What | Where |
| --- | --- |
| All profile text | `data/profile.json` |
| Profile photo | `uploads/photo/` |
| Background image | `uploads/background/` |
| CV file | `uploads/cv/` |
| Credentials and settings | `.env` |

All four are git-ignored — your personal details, CV and photos never end up in the
repository, even though the repository is public.

**Back them up.** Copy `data/`, `uploads/` and `.env` somewhere safe (a zip in your
personal cloud storage is plenty). Restoring is just copying them back.

```powershell
Compress-Archive -Path .\data, .\uploads, .\.env -DestinationPath ..\portfolio-backup.zip -Force
```

---

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the site |
| `npm run dev` | Runs the site and restarts on file changes |
| `npm run setup` | Creates or replaces `.env` with your admin credentials |
| `npm run hash-password` | Prints a bcrypt hash for a new password |
| `npm run check` | Parses every JS file to catch syntax errors |

---

## Hosting options

The app writes files to disk (your photo, CV and `profile.json`). That single fact decides
which host suits you, because many free platforms give you a fresh, empty filesystem on
every deploy or restart.

| Option | Cost | Always online | Uploads survive a redeploy | Custom domain | Best for |
| --- | --- | --- | --- | --- | --- |
| **Cloudflare Pages** (static publish) | free | yes | yes | yes | the link you put on your CV |
| **GitHub Pages** (static publish) | free | yes | yes | yes | same, if you prefer staying on GitHub |
| **Oracle Cloud Always Free** | free | yes | yes | yes | free forever *and* editing from any browser |
| **DigitalOcean Droplet + Docker** | from ~$6/mo | yes | yes | yes | least fuss with full control |
| **Render** (free web service) | free | no, sleeps | no | yes | quick demo, throwaway |
| **DigitalOcean App Platform** | from ~$5/mo | yes | no | yes | simplest paid deploy, re-upload after deploys |
| **ngrok tunnel** | free | only while your laptop runs | yes, files stay local | paid plans only | showing the site during a call |

Full step-by-step instructions for the server-based options live in
[DEPLOY.md](DEPLOY.md).

### Cloudflare Pages or GitHub Pages — static publish

You keep editing on your laptop in the admin area, then publish the finished result as
static files. Nothing to maintain, nothing to keep awake, no server bill.

- Cloudflare Pages free: unlimited bandwidth and 500 builds per month, up to 20,000 files
  per site ([limits](https://developers.cloudflare.com/pages/platform/limits/)).
- GitHub Pages free: 1 GB published site and a
  [soft bandwidth limit of 100 GB per month](https://docs.github.com/pages/getting-started-with-github-pages/github-pages-limits).
  Intended for personal and project sites rather than commercial storefronts.

Trade-off: you edit locally and publish, instead of editing from any browser. For a
portfolio that changes a few times a year, that is a small price for a link that is always
instant.

> This route needs one small addition that is **not in the repository yet**: an
> `npm run export` command that turns your current content into a publishable `dist/`
> folder. Ask for it and it can be added.

### Oracle Cloud Always Free — a real server, free

The only free option where the app runs exactly as it does locally, including uploads that
persist. You get an always-free virtual machine, install Docker, and run the same
`docker compose up -d` described in DEPLOY.md.

Caveats: signup requires card verification, Oracle sometimes has no capacity for new ARM
instances in a region, and the allowance was
[halved in June 2026 from 4 OCPU / 24 GB to 2 OCPU / 12 GB](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits)
— still far more than this site needs. You are the sysadmin: updates and backups are yours.

### DigitalOcean Droplet + Docker — recommended paid route

A small Droplet, `docker compose up -d`, and Caddy in front for automatic HTTPS. Content
lives in Docker volumes, so it survives rebuilds. This is the setup documented in
[DEPLOY.md](DEPLOY.md), Option A.

### Render — free, but it sleeps

Connects to the GitHub repo and builds the Dockerfile. Two things to know: a free web
service [spins down after 15 minutes without traffic and takes about a minute to wake](https://render.com/docs/free),
so a recruiter clicking your link may stare at a blank tab; and the free plan has no
persistent disk, so uploads and edits are lost whenever the service restarts. Fine for a
demo, wrong for a CV link.

### DigitalOcean App Platform — simple, but forgets your uploads

Connect the repo and deploy. No persistent disk either, so treat uploads as disposable and
re-upload after each deploy. Spec ready at [`.do/app.yaml`](.do/app.yaml), steps in
DEPLOY.md, Option B.

### ngrok — temporary sharing only

Publishes your local server through a tunnel. Free tier shows an interstitial warning page
to browser visitors before your site loads, and the link dies when your laptop sleeps.
Great for a live demo, unsuitable as a permanent link. Steps in DEPLOY.md, Option C.

### Which one should you pick?

- Want a link for your CV that just works, for free → **Cloudflare Pages**.
- Want to edit from any browser without paying → **Oracle Cloud Always Free**.
- Happy to pay a few dollars for the least hassle → **DigitalOcean Droplet**.
- Just showing someone right now → **ngrok**.

---

## Troubleshooting

**The server refuses to start and lists missing settings.**
That is intentional: the app will not run without admin credentials and a session secret.
Run `npm run setup`.

**`Error: listen EADDRINUSE`.**
Another program holds the port. Run `npm run setup` again and choose a different port, such
as `4173`.

**The page loads but content is missing, or shows a "Could not load profile" toast.**
The browser could not reach `/api/profile`. Check the terminal running `npm start` for
errors, and confirm the address matches the port in `.env`.

**I cannot sign in.**
Check the username in `.env`, and that you are using the exact URL from the terminal. If
you have forgotten the password, `npm run setup` sets a new one.

**"Too many login attempts."**
Eight failed attempts in 15 minutes triggers the limiter. Wait, or restart the server to
reset the counter.

**An upload is rejected.**
The red message says why. Common causes: HEIC from an iPhone (export as JPG), a file over
the size limit, or a file whose contents do not match its extension.

**Login works locally but not after deploying behind HTTPS.**
Set `COOKIE_SECURE=true` and `SITE_URL` to the real public URL. Over HTTPS with
`COOKIE_SECURE=false`, or with a mismatched `SITE_URL`, the browser drops the session
cookie and login appears to silently fail.

---

## Configuration reference

`.env` is created by `npm run setup`; `.env.example` documents every key.

| Variable | Purpose |
| --- | --- |
| `ADMIN_USERNAME` | The only account that can sign in |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of your password |
| `SESSION_SECRET` | Signs the session cookie; must be long and random |
| `COOKIE_SECURE` | `true` when served over HTTPS, required in production |
| `SITE_URL` | Public URL, used for links and origin checks |
| `PORT` | Port to listen on |
| `DATA_DIR`, `UPLOAD_DIR` | Where content is written; point at a mounted volume in production |
| `MAX_IMAGE_BYTES`, `MAX_DOC_BYTES` | Upload size limits |
| `TRUSTED_ORIGINS` | Extra origins allowed to send state-changing requests, usually empty |

The server refuses to start when credentials or the session secret are missing, or when
`NODE_ENV=production` without `COOKIE_SECURE=true`.

---

## Security notes

- The password is stored only as a bcrypt hash (cost 12). Login comparison is
  constant-time and returns the same vague error for a wrong username or a wrong password.
- Login is rate limited to 8 failed attempts per 15 minutes per IP.
- The session is a signed, `httpOnly`, `SameSite=Strict` cookie with a sliding 8 hour
  window.
- Every state-changing admin request needs a per-session CSRF token and passes a
  same-origin check.
- Uploads are validated by declared type, extension and magic bytes; stored file names are
  generated server side; deletes cannot escape the uploads directory.
- Content Security Policy, `nosniff`, `frame-ancestors 'none'`, HSTS in production, no
  `X-Powered-By`.
- Admin input is normalised against a whitelist schema: unknown fields are dropped, strings
  are length-capped, and only `http(s)`, `mailto:` and `tel:` links survive.

---

## Project layout

```
src/
  server.js            Express app, security middleware, error handling
  config.js            Environment loading and fail-closed validation
  lib/                 Profile store, whitelist schema, upload rules
  middleware/          Auth, CSRF, origin guard
  routes/              Public routes and admin API
public/
  index.html           Public portfolio
  admin/index.html     Login and admin dashboard
  assets/              CSS and JS
scripts/               Setup, password hashing, syntax check
.do/app.yaml           DigitalOcean App Platform spec
Dockerfile             Production image
docker-compose.yml     Droplet deployment with persistent volumes
DEPLOY.md              Hosting instructions
```
