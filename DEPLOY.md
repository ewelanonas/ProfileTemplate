# Deploying to DigitalOcean

Two options. Pick based on one question: **do your uploads need to survive a redeploy?**

| | Droplet + Docker | App Platform |
| --- | --- | --- |
| Uploads and profile text survive redeploys | Yes, stored in volumes | No, filesystem is wiped |
| Setup effort | Medium (one server to maintain) | Low (connect the repo, done) |
| Cost | From ~$6/month | From ~$5/month |
| HTTPS | You run Caddy or Nginx (automatic with Caddy) | Included |

Recommendation: **Droplet + Docker**. This app keeps content on disk, and App Platform
gives every deploy a fresh filesystem, which means re-uploading your photo and CV each
time you push a change.

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
