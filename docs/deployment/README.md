# Production Deployment Guide

Deploy the MRB Learning Platform on a **single Ubuntu 24.04 VPS** using **Nginx + PM2 + MySQL + Redis**.

After initial server setup, every release is:

```bash
./deploy.sh
```

## Architecture

```
Internet → Nginx (443) → client/dist (static SPA)
                      → /api/* → PM2 → Node.js (127.0.0.1:4000)
                                    → MySQL
                                    → Redis (BullMQ, rate limits, sessions)
```

| Component | Role |
|-----------|------|
| **Nginx** | TLS termination, static files, reverse proxy, rate limits, compression |
| **PM2** | Process manager for API — auto-restart, reboot persistence, logs |
| **MySQL 8** | Primary datastore |
| **Redis** | Required in production — queues, rate limiting, webhook dedupe |
| **client/dist** | Vite production build (not a running Node process) |

## Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB+ SSD |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |

Software:

- Node.js **20 LTS** (via [NodeSource](https://github.com/nodesource/distributions) or `nvm`)
- PM2 (`npm i -g pm2`)
- Nginx
- MySQL 8.0
- Redis 7+
- Git, curl, certbot

## One-Time VPS Bootstrap

### 1. Create deploy user

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /var/www/mrb-learning
sudo chown deploy:deploy /var/www/mrb-learning
```

### 2. Clone repository

```bash
sudo -u deploy -i
cd /var/www/mrb-learning
git clone <your-repo-url> .
```

### 3. Configure environment

```bash
cp .env.example server/.env
nano server/.env   # fill all secrets — see server/.env.example for full reference
```

**Critical production values:**

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `CLIENT_URL` | `https://your-domain.example` |
| `TRUST_PROXY` | `1` |
| `LISTEN_HOST` | `127.0.0.1` |
| `REFRESH_COOKIE_SECURE` | `true` |
| `ACCESS_COOKIE_SECURE` | `true` |
| `REQUIRE_REDIS_IN_PRODUCTION` | `true` |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"  # ADMIN_SECRET_PATH
```

### 4. MySQL database

```bash
sudo mysql -e "
CREATE DATABASE mrb_learning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mrb_app'@'127.0.0.1' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON mrb_learning.* TO 'mrb_app'@'127.0.0.1';
FLUSH PRIVILEGES;"
```

Schema is applied automatically on first API boot (idempotent startup migrations).

### 5. Redis

```bash
sudo apt install redis-server
sudo systemctl enable --now redis-server
```

### 6. PM2 startup on reboot

```bash
cd /var/www/mrb-learning
./deploy.sh   # first deploy
pm2 startup systemd -u deploy --hp /home/deploy
# Run the command PM2 prints, then:
pm2 save
```

### 7. Nginx + TLS

Add rate-limit zones to `/etc/nginx/nginx.conf` inside the `http { }` block:

```nginx
include /var/www/mrb-learning/deployment/nginx/rate-limit-zones.conf;
```

Install site config (replace placeholders):

```bash
sudo sed -e 's|YOUR_DOMAIN|your-domain.example|g' \
         -e 's|APP_ROOT|/var/www/mrb-learning|g' \
  deployment/nginx/mrb-learning.conf | sudo tee /etc/nginx/sites-available/mrb-learning

sudo ln -sf /etc/nginx/sites-available/mrb-learning /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example -d www.your-domain.example
```

### 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Only ports **22**, **80**, **443** should be public. MySQL and Redis stay on loopback.

## Deployment Workflow

`deploy.sh` performs:

1. `git pull --ff-only`
2. Environment validation (`deployment/scripts/validate-env.sh`)
3. `npm ci --omit=dev` in `server/`
4. Frontend production build with admin shell injection
5. PM2 reload (`ecosystem.config.js --env production`)
6. Health checks (`/api/health`, `/api/ready`)
7. Automatic git rollback on failure

Logs: `logs/deploy/deploy-*.log`, `logs/pm2/mrb-api-*.log`

## Environment Strategy

| Environment | Config location | Notes |
|-------------|-----------------|-------|
| **Production VPS** | `server/.env` only | `NODE_ENV=production`, secure cookies, `TRUST_PROXY=1` |
| **Local development** | `server/.env` + optional `client/.env` | Vite dev server proxies `/api` to backend |
| **CI** | Injected secrets | Never commit `.env` files |

Frontend uses same-origin `/api` in production (no `VITE_API_BASE_URL` needed).  
`ADMIN_SECRET_PATH` must be identical in `server/.env` at build time — `deploy.sh` exports it automatically.

## Logging & Monitoring

| Log | Path |
|-----|------|
| PM2 stdout | `logs/pm2/mrb-api-out.log` |
| PM2 stderr | `logs/pm2/mrb-api-error.log` |
| Nginx access | `/var/log/nginx/mrb-learning.access.log` |
| Nginx errors | `/var/log/nginx/mrb-learning.error.log` |
| Deploy history | `logs/deploy/` |

**Recommended monitoring:**

- Uptime: poll `https://your-domain/api/health` every 60s
- Readiness: `https://your-domain/api/ready` (requires admin or internal access in production)
- PM2: `pm2 monit`, `pm2 logs mrb-api`
- Disk: uploads in `server/uploads/`, logs rotation via `logrotate`

**Crash reporting (recommended):**

- Sentry or similar for unhandled Node exceptions
- Alert on PM2 restart count: `pm2 jlist | jq '.[] | select(.name=="mrb-api") | .pm2_env.restart_time'`

## Backup Strategy

### MySQL (daily cron)

```bash
chmod +x deployment/scripts/backup-mysql.sh
crontab -e
# 0 2 * * * /var/www/mrb-learning/deployment/scripts/backup-mysql.sh
```

Output: `backups/mysql/*.sql.gz` — default retention **14 days**.

**Restore:**

```bash
gunzip -c backups/mysql/mrb_learning_YYYYMMDD_HHMMSS.sql.gz | \
  mysql -h 127.0.0.1 -u mrb_app -p mrb_learning
```

### Uploads (daily cron)

```bash
chmod +x deployment/scripts/backup-uploads.sh
# 30 2 * * * /var/www/mrb-learning/deployment/scripts/backup-uploads.sh
```

Covers `server/uploads/` and `server/data/` — retention **30 days**.

**Restore:** extract tarball into `server/` preserving paths.

### Off-site

Copy `backups/` to S3, Backblaze B2, or another VPS nightly (`rsync` / `rclone`).

## Scaling (Single VPS → Larger)

Current design targets one VPS. When load grows:

1. **Vertical scale** — increase RAM/CPU; tune `MYSQL_POOL_CONNECTION_LIMIT`
2. **Read replica** — MySQL read replica for reporting (no code change required for basic setup)
3. **Separate Redis** — managed Redis on another host; update `REDIS_URL`
4. **CDN** — Cloudflare in front of Nginx for static assets
5. **Multi-instance API** — PM2 `instances: max` + sticky sessions or stateless JWT (already stateless for access tokens; Redis required)

Do **not** introduce Kubernetes or microservices unless operational complexity is justified.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| 502 Bad Gateway | `pm2 status`, `pm2 logs mrb-api`, API listening on `127.0.0.1:4000` |
| CORS errors | `CLIENT_URL` matches browser origin exactly (scheme + host) |
| Cookie auth fails | `TRUST_PROXY=1`, secure cookies true, HTTPS working |
| Admin UI 404 | Rebuild frontend after changing `ADMIN_SECRET_PATH` |
| Webhook signature fail | Nginx must not buffer `/api/payments/webhook` body |

## Related Docs

- [Test Export / Import System](../test-transfer/README.md) — migration, rollback, operations, security
- [Security Findings Report](../SECURITY-FINDINGS.md)
- [Production Readiness Report](../PRODUCTION-READINESS-REPORT.md)
- [Security Deployment Checklist](../../server/docs/security-deployment-checklist.md)
