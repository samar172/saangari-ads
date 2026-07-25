# Saangri — Deployment Guide

Everything you need to run, update, and maintain the production deployment.
Last set up: 2026-07-24.

---

## 1. Architecture at a glance

```
                    ┌─────────────────────────────────────────┐
   Vercel           │  Azure VM  (98.70.37.83, Ubuntu 24.04)   │
 (frontend) ──────► │                                          │
 React/Vite         │  nginx :443/:80  ──►  Node :4000 (PM2)   │
                    │  (SSL, reverse proxy)      saangri-api    │
                    │                              │            │
                    │                              ▼            │
                    │                   PostgreSQL 16 (:5432)   │
                    │                   DB "saangri" (internal) │
                    └─────────────────────────────────────────┘

  API domain:  https://api.saangariads.com   (Let's Encrypt SSL, auto-renew)
```

- **Frontend** → Vercel (static React/Vite build).
- **Backend** → Node/Express on the VM, managed by PM2, behind nginx.
- **Database** → PostgreSQL on the same VM, only reachable from inside the VM.

---

## 2. Connecting to the server

The SSH key is at `~/.ssh/saangri-key.pem` and an alias is set in `~/.ssh/config`.

```bash
ssh saangri
```

Full form (any machine without the config):

```bash
ssh -i ~/.ssh/saangri-key.pem azureuser@98.70.37.83
```

> ⚠️ **SSH is locked to a single IP** in the Azure NSG. If your internet IP changes
> (ISP reset, new location), SSH will time out. Fix it in **Azure Portal → VM →
> Network settings → the SSH inbound rule → update Source to your new IP**.
> Find your current IP with: `curl https://api.ipify.org`

---

## 3. Where everything lives

```
/opt/apps/
├── saangri/
│   ├── server/                ← backend code (Express + Prisma)
│   │   ├── src/               ← routes, middleware, index.js (entry point)
│   │   ├── prisma/            ← schema.prisma, sites.json, seed files
│   │   ├── .env               ← secrets: DB URL, JWT, Cloudinary  (chmod 600)
│   │   └── package.json
│   ├── logs/                  ← PM2 stdout/stderr logs
│   ├── ecosystem.config.js    ← PM2 process config
│   └── .dbpass                ← DB password (root-only file)
└── _backups/                  ← nightly DB dumps + backup script
```

Adding a **future app** → give it `/opt/apps/<newapp>/`, its own nginx server block
+ SSL cert, and a PM2 entry. Postgres already supports multiple databases.

---

## 4. Everyday commands

Run these after `ssh saangri`, or prefix remotely like `ssh saangri 'pm2 list'`.

| Task | Command |
|---|---|
| See running apps | `pm2 list` |
| Live backend logs | `pm2 logs saangri-api` |
| Last 100 log lines | `pm2 logs saangri-api --lines 100 --nostream` |
| Restart backend | `pm2 restart saangri-api` |
| Stop backend | `pm2 stop saangri-api` |
| Backend health check | `curl http://localhost:4000/api/health` |
| nginx status | `sudo systemctl status nginx` |
| Reload nginx (after config edit) | `sudo nginx -t && sudo systemctl reload nginx` |
| Postgres shell | `sudo -u postgres psql -d saangri` |
| Row counts | `sudo -u postgres psql -d saangri -c '\dt'` |

---

## 5. Redeploying the backend (after code changes)

Run these **from your Mac**, in the repo root (`~/Developer/saangri`):

```bash
# 1. Push local code to the VM (excludes node_modules, .git, uploads, .env)
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude 'uploads/*' --exclude .env --exclude '*.log' \
  -e ssh server/ saangri:/opt/apps/saangri/server/

# 2. Install deps, regen Prisma client, sync schema, restart
ssh saangri 'cd /opt/apps/saangri/server && \
  npm install --omit=dev && \
  npx prisma generate && \
  npx prisma db push && \
  pm2 restart saangri-api'
```

> `prisma db push` syncs the DB to `schema.prisma` (this project has no migrations dir).
> It is safe for additive changes; be careful with column drops/renames on live data.

---

## 6. Environment variables (`.env` on the VM)

Located at `/opt/apps/saangri/server/.env` (chmod 600). Keys:

| Key | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://saangri:<pass>@localhost:5432/saangri?schema=public` |
| `JWT_SECRET` | Token signing secret (generated on the VM) |
| `PORT` | `4000` (nginx proxies to this) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Photo uploads |

After editing `.env`: `pm2 restart saangri-api`.

---

## 7. Database

- **Engine:** PostgreSQL 16, database `saangri`, role `saangri`.
- **Password:** stored in `/opt/apps/saangri/.dbpass` (read with `sudo cat`).
- **Not exposed publicly** — port 5432 is internal to the VM only.

**Admin login (app):** `admin@saangri.com` / `Saangari@2025`
(change it in-app after first login).

**Seed data loaded:** 171 sites, 3 printing partners, 11 categories.

Re-seed sites only (idempotent — won't duplicate):
```bash
ssh saangri 'cd /opt/apps/saangri/server && node prisma/seed-master.js'
```

---

## 8. Backups

Nightly automatic backup via cron:

- **Schedule:** every day at 02:30 server time.
- **Script:** `/opt/apps/_backups/backup-saangri.sh`
- **Output:** `/opt/apps/_backups/saangri-YYYYMMDD-HHMMSS.sql.gz`
- **Retention:** keeps the 7 most recent, deletes older.

Manual backup now:
```bash
ssh saangri '/opt/apps/_backups/backup-saangri.sh && ls -lh /opt/apps/_backups/*.sql.gz'
```

Restore from a backup (⚠️ overwrites current data):
```bash
ssh saangri
gunzip -c /opt/apps/_backups/saangri-YYYYMMDD-HHMMSS.sql.gz | sudo -u postgres psql -d saangri
```

> 💡 **Recommended upgrade:** these backups live on the same VM. For real safety,
> copy them off-box (e.g. to Azure Blob Storage or download periodically).

---

## 9. Frontend (Vercel)

Settings in the Vercel project:

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Env var | `VITE_API_URL=https://api.saangariads.com/api` |

`client/src/api.js` reads `VITE_API_URL` (falls back to `/api` for local dev).

SPA routing — `client/vercel.json` must contain:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## 10. SSL / HTTPS

- Cert issued by Let's Encrypt for `api.saangariads.com`, **auto-renews** (certbot timer).
- HTTP automatically redirects to HTTPS.
- Check renewal: `ssh saangri 'sudo certbot certificates'`
- Force a renewal test: `ssh saangri 'sudo certbot renew --dry-run'`

---

## 11. Troubleshooting

| Symptom | Check |
|---|---|
| `ssh saangri` times out | Your IP changed → update Azure NSG SSH rule (see §2) |
| API returns 502 | Backend down → `ssh saangri 'pm2 restart saangri-api'`, then check `pm2 logs` |
| API unreachable from browser | nginx down → `ssh saangri 'sudo systemctl status nginx'` |
| DB errors in logs | `ssh saangri 'sudo systemctl status postgresql'` |
| Frontend can't reach API | Confirm `VITE_API_URL` is set in Vercel and redeploy |
| Cert expired | `ssh saangri 'sudo certbot renew'` |

**Everything survives a VM reboot** — PM2, nginx, and Postgres are all enabled on boot.

---

## Quick reference

| Item | Value |
|---|---|
| VM IP | `98.70.37.83` |
| SSH | `ssh saangri` |
| API | `https://api.saangariads.com` |
| App code | `/opt/apps/saangri/server` |
| Admin login | `admin@saangri.com` / `Saangari@2025` |
| Backups | `/opt/apps/_backups/` (nightly 02:30) |
