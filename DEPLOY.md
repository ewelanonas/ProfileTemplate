# Publishing the site

Four routes, in the order most people should consider them.

| | Cloudflare Pages | Droplet + Docker | App Platform | ngrok |
| --- | --- | --- | --- | --- |
| Cost | free | from ~$6/month | from ~$5/month | free |
| Always online | yes | yes | yes | only while your laptop runs |
| Uploads survive publishing | yes | yes | no, filesystem is wiped | yes, files stay local |
| Edit from any browser | no, edit locally then publish | yes | yes | yes |
| HTTPS | included | Caddy handles it | included | included |
| Effort | lowest | medium, you run a server | low | lowest |

Recommendation: **Cloudflare Pages** (Option D) while a permanent, free, always-fast link
matters most. Move to a **Droplet** (Option A) when you want to edit content from any
browser without publishing again.

---

## Option A — Droplet with Docker (recommended)

### 1. Create the Droplet

- Marketplace image: **Docker on Ubuntu**
- Size: the smallest shared CPU plan is enough
- Add your SSH key
- Region: closest to your visitors

### 2. Point your domain at it

In DigitalOcean **Networking → Domains**, add an `A` record for your domain to the
Droplet's IP. Wait for DNS to resolve before requesting certificates.

### 3. Get the code onto the server

```bash
ssh root@YOUR_DROPLET_IP

adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
su - deploy

git clone https://github.com/ewelanonas/YOUR_REPO_NAME.git portfolio
cd portfolio
```

### 4. Create the production `.env`

```bash
npm install --omit=dev   # only needed to run the helper script
npm run setup            # enter your admin username, password, and https://yourdomain.com
```

Then open `.env` and confirm:

```
NODE_ENV=production
COOKIE_SECURE=true
SITE_URL=https://yourdomain.com
PORT=8080
```

Lock the file down: `chmod 600 .env`

If you would rather not install Node on the server, run `npm run hash-password` on your
laptop and write `.env` by hand from `.env.example`.

### 5. Start the app

```bash
docker compose up -d --build
docker compose ps
curl -s localhost:8080/api/health
```

`docker-compose.yml` binds the container to `127.0.0.1:8080`, so it is not reachable
from the internet until you put a reverse proxy in front of it. Content lives in the
`profile-data` and `profile-uploads` volumes and survives `docker compose up --build`.

### 6. Add HTTPS with Caddy

Caddy requests and renews Let's Encrypt certificates on its own.

```bash
sudo apt update && sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
yourdomain.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
    request_body {
        max_size 12MB
    }
}
```

`max_size` must be at least your largest allowed upload (`MAX_DOC_BYTES`, 10 MB by
default) or CV uploads will be rejected by the proxy before reaching the app.

```bash
sudo systemctl reload caddy
```

### 7. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

Port 8080 stays closed: only Caddy talks to the app.

### 8. Updating later

```bash
cd ~/portfolio
git pull
docker compose up -d --build
```

Your content is untouched because it lives in the volumes.

### 9. Backups

```bash
# Profile text and uploads
docker run --rm -v portfolio_profile-data:/data -v portfolio_profile-uploads:/uploads \
  -v $PWD:/backup alpine \
  tar czf /backup/portfolio-backup-$(date +%F).tar.gz -C / data uploads
```

Copy the archive off the server (or enable Droplet backups in the DigitalOcean panel).

---

## Option B — App Platform

Fastest path, with the caveat above: **uploads and edits are lost on every deploy or
restart**, because App Platform has no persistent disk. Fine if you treat the starter
content as disposable and re-upload after deploys.

1. In DigitalOcean, **Apps → Create App → GitHub**, authorise access, pick the repo and
   the `main` branch.
2. It is detected as a Node app. Set the **HTTP port** to `8080` and the run command to
   `npm start`.
3. Add these environment variables, marking the last three as **encrypted**:

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `COOKIE_SECURE` | `true` |
   | `SITE_URL` | your app URL, for example `https://yourapp.ondigitalocean.app` |
   | `ADMIN_USERNAME` | your admin username |
   | `ADMIN_PASSWORD_HASH` | output of `npm run hash-password` |
   | `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

4. Health check path: `/api/health`.
5. Deploy, then open `/admin` and sign in.

There is also a ready spec at [`.do/app.yaml`](.do/app.yaml). Replace the repo name and
the placeholder secrets, then:

```bash
doctl apps create --spec .do/app.yaml
```

### Making uploads persistent on App Platform

If you want App Platform *and* durable uploads, the app needs to store files in
DigitalOcean Spaces (S3 compatible) instead of on local disk. That is a code change to
`src/lib/uploads.js` and the static `/uploads` route — happy to add it if you decide to
go that way.

---

## Option C — Sharing from your laptop with ngrok (temporary)

Useful for showing the site live during a call, testing on your phone, or getting quick
feedback. Not a good permanent link for a CV, for three reasons:

1. On the free tier ngrok shows an [interstitial warning page in front of all HTML browser
   traffic](https://ngrok.com/docs/pricing-limits/free-plan-limits). A visitor must click
   **Visit** before reaching your site; a cookie then suppresses it for that domain for
   7 days. The `ngrok-skip-browser-warning` header only helps programmatic clients, not a
   recruiter opening the link in a browser.
2. The site is only up while your laptop is on and the agent is running.
3. Free quotas: 1 GB data transfer out and 20,000 HTTP requests per month, up to 3 online
   endpoints, and one automatically assigned `*.ngrok-free.app` dev domain.

### Before you expose anything

The admin login becomes reachable from the internet the moment the tunnel opens. Set your
own credentials first:

```powershell
npm run setup
```

### Run it

Two terminals. First the app, told that it is being served over HTTPS under the ngrok
hostname:

```powershell
$env:NODE_ENV = "production"
$env:COOKIE_SECURE = "true"
$env:SITE_URL = "https://YOUR-DEV-DOMAIN.ngrok-free.app"
npm start
```

`SITE_URL` matters: state-changing admin requests are checked against it, and secure
cookies need the app to know it is behind HTTPS. Then the tunnel, pointing at the same
port the app is listening on:

```powershell
ngrok http 4173
```

ngrok prints the public URL. Open `https://YOUR-DEV-DOMAIN.ngrok-free.app` to check the
public page, and `/admin` to sign in.

### Notes

- Uploads and profile edits stay on your laptop in `data/` and `uploads/`, so nothing is
  lost when the tunnel closes.
- `Ctrl + C` in the ngrok terminal takes the site offline immediately. That is the fastest
  way to pull the link if you ever need to.
- A permanent, always-on link is still worth having. Cloudflare Pages (static publish) or
  a Droplet both avoid the interstitial and the laptop dependency.

---

## Option D — Cloudflare Pages (free, recommended)

You keep editing locally in the admin area. When you are happy with the result you export
the site to plain files and upload them. Cloudflare serves them from its CDN with HTTPS,
for free, with no server to keep awake.

Free plan: unlimited bandwidth, 500 builds per month, up to 20,000 files per site
([limits](https://developers.cloudflare.com/pages/platform/limits/)).

### 1. Fill in your content first

```powershell
npm start
```

Sign in at `/admin`, complete every tab, and upload your photo, background and CV. What you
see on `http://localhost:PORT` is exactly what gets published.

### 2. Export the site

```powershell
npm run export
```

This writes `dist/`:

- `index.html` with your name, headline and description baked into the page title and the
  social preview tags, so a link shared on LinkedIn shows something meaningful
- `profile.json` with all your content
- `uploads/` containing **only** the photo, background and CV your profile points at, so
  old files you replaced are never published
- `assets/`, `404.html`, `robots.txt`
- `_headers` with the same security headers the Node app sends
- no admin area, since it cannot work without the server

Once you know your public URL, pass it so the canonical and social tags are exact:

```powershell
npm run export -- https://your-project.pages.dev
```

`dist/` is git-ignored. It holds your CV and photos, so it is published, never committed.

### 3. Publish

**First time, through the dashboard:**

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com/) (create a free account if
   you need one).
2. **Compute (Workers) → Workers & Pages → Create → Pages → Upload assets**.
3. Name the project, for example `emmanuel-anonas`. That gives you
   `https://emmanuel-anonas.pages.dev`.
4. Drag the whole `dist` folder onto the upload area, then **Deploy site**.

**Afterwards, from the terminal:**

```powershell
npx wrangler@4 pages deploy dist --project-name=YOUR-PROJECT-NAME
```

The first run opens a browser to authorise your Cloudflare account. Every later publish is
that one command.

### 4. Updating your site later

```powershell
npm start                 # edit in /admin, upload files, save
npm run export -- https://your-project.pages.dev
npx wrangler@4 pages deploy dist --project-name=YOUR-PROJECT-NAME
```

Three commands, about a minute.

### 5. Custom domain, optional

In the Pages project: **Custom domains → Set up a domain**. If the domain is already on
Cloudflare the DNS record is created for you; otherwise you point a CNAME at the
`pages.dev` hostname. The certificate is issued automatically.

### What you give up

Editing happens on your laptop, not from any browser, and your published site only changes
when you export and upload again. If that becomes annoying, Option A runs the full app with
a live admin area.

---

## After deploying, check these

```bash
curl -I https://yourdomain.com                      # 200, and security headers present
curl -s https://yourdomain.com/api/health           # {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" \
  https://yourdomain.com/api/admin/profile          # 401 without a session
```

Then in a browser: sign in at `/admin`, upload a photo and your CV, save, and confirm
the public page shows them and `/cv` downloads the file.

## Operational notes

- Changing `SESSION_SECRET` signs everyone out, which is the fastest way to kill a
  session you are unsure about.
- `COOKIE_SECURE=true` requires HTTPS. Over plain HTTP the browser drops the session
  cookie and login appears to silently fail.
- The app trusts one proxy hop in production (`trust proxy = 1`), which matches both
  Caddy/Nginx on a Droplet and the App Platform load balancer. Rate limiting and secure
  cookies depend on that being correct.
- Logs: `docker compose logs -f web` on a Droplet, or the Runtime Logs tab on App Platform.
