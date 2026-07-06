# 🚀 Affiliate Launch Kit — Complete Setup & Deployment Guide

> **What this is:** A full-stack platform that generates 5 AI-powered affiliate marketing assets per campaign (Review Page, Bonus Page, Email Sequence, Social Posts, CTA) — with user accounts, JVZoo license management, and ZIP export. Built with NestJS + PostgreSQL + Redis (backend) and React + TypeScript (frontend).

---

## 📋 Table of Contents

1. [Credentials You Need](#-credentials-you-need)
2. [Deploy on a VPS / Linux Server](#-option-a-vps--linux-server-recommended)
3. [Deploy on Render](#-option-b-render-easiest-no-server-management)
4. [Deploy on Railway](#-option-c-railway)
5. [Deploy on Fly.io](#-option-d-flyio)
6. [First Launch Checklist](#-first-launch-checklist)
7. [Troubleshooting](#-troubleshooting)

---

## 🔑 Credentials You Need

> All security secrets (JWT, encryption keys, database password) are **generated automatically** by `deploy.sh` on VPS, or by the platform on Render. You only need to provide the keys below that require a real account.

### Legend
> 🔴 **REQUIRED** — App will not start without this
> 🟡 **OPTIONAL** — Has a built-in fallback, add later if needed
> 💸 **PAID** — Costs money
> 🆓 **FREE** — No credit card required

---

### 1 — AI Provider Key
> 🔴 REQUIRED &nbsp;|&nbsp; 🆓 FREE (Groq) or 💸 PAID (others)

The engine that generates your affiliate content. **Groq is recommended** — it's free, fast, and high quality.

**How to get your Groq key (2 minutes, no card):**
1. Go to → **[console.groq.com](https://console.groq.com)**
2. Sign up with any email
3. Click **"API Keys"** in the left sidebar → **"Create API Key"**
4. Copy the key (starts with `gsk_...`)

**Where to put it:**
```
File:     project/.env
Variable: GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxx
Also set: AI_PROVIDER=groq
          AI_USE_REAL_LLM=true
```

**Alternative providers (if you prefer):**

| Provider | Key Format | Free Tier | Get Key |
|---|---|---|---|
| **Groq** ✅ Recommended | `gsk_...` | Yes — generous | [console.groq.com](https://console.groq.com) |
| Anthropic Claude | `sk-ant-...` | No | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | `sk-...` | No | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | `AI...` | Yes — limited | [aistudio.google.com](https://aistudio.google.com) |

> 💡 If you skip the AI key, the app still runs in **mock mode** — it returns placeholder text instead of real AI content. Fine for testing, not for real use.

---

### 2 — JVZoo Secret Key
> 🔴 REQUIRED (only if selling via JVZoo) &nbsp;|&nbsp; Skippable at deploy time

Used to verify the signature JVZoo sends with every purchase (IPN webhook). Without the real key, license activation from JVZoo purchases won't work — but the app itself boots fine with a temporary placeholder until you add it.

**How to get it:**
1. Log in to → **[jvzoo.com](https://www.jvzoo.com)**
2. Go to **Vendors → Settings → Secret Key**
3. Copy the value shown

**Where to put it:**
```
File:     project/.env
Variable: JVZOO_SECRET_KEY=your_real_key_from_jvzoo_dashboard
```

Then restart the backend:
```bash
docker compose restart backend
```

> 💡 **Not selling via JVZoo?** Skip it entirely — the deploy script sets a temporary value so the app starts, and you can ignore this key forever.

---

### 3 — Email Provider (Resend)
> 🟡 OPTIONAL &nbsp;|&nbsp; 🆓 FREE up to 3,000 emails/month

Used to automatically email license keys to customers after a JVZoo purchase. Without this, license keys are only written to the server log — you'd need to send them manually.

**How to get your Resend key:**
1. Go to → **[resend.com](https://resend.com)** → Sign up free
2. Go to **API Keys** → **Create API Key**
3. Copy the key (starts with `re_...`)
4. In Resend, go to **Domains** → **Add Domain** → verify your sending domain

**Where to put it:**
```
File:     project/.env
Variable: EMAIL_PROVIDER_API_KEY=re_xxxxxxxxxxxxxxxxxx
          EMAIL_FROM_ADDRESS=noreply@yourdomain.com
```

> 💡 Without a key, the app logs emails to the console instead of sending them. Zero errors — just no real delivery.

---

### 4 — Object Storage (S3 / Cloudflare R2)
> 🟡 OPTIONAL &nbsp;|&nbsp; 💸 PAID (very cheap) or 🆓 FREE (Cloudflare R2 up to 10 GB)

Stores exported ZIP files. Without S3, ZIPs are saved to the server's local disk — fine for a single VPS, but files are lost if the server restarts on ephemeral platforms (Render free tier, Fly.io).

**Best option — Cloudflare R2 (free up to 10 GB, no egress fees):**
1. Go to → **[dash.cloudflare.com](https://dash.cloudflare.com)** → Sign up free
2. In the left sidebar: **R2 Object Storage** → **Create Bucket**
3. Name your bucket (e.g. `alk-exports`)
4. Go to **R2 → Manage R2 API Tokens** → **Create API Token** → select your bucket, allow "Object Read & Write"
5. Copy Access Key ID and Secret Access Key

**Where to put it:**
```
File:     project/.env
Variable: S3_BUCKET_NAME=alk-exports
          S3_ACCESS_KEY_ID=your_r2_access_key
          S3_SECRET_ACCESS_KEY=your_r2_secret
          S3_REGION=auto
```

> 💡 No S3 credentials = local filesystem storage. Fully functional on a VPS. Skip this initially and add it later if needed.

---

## 🖥️ Option A: VPS / Linux Server (Recommended)

A VPS (Virtual Private Server) is a Linux machine in the cloud that you control completely. This is the **most reliable and flexible** option.

**Recommended providers and pricing:**

| Provider | Cheapest Plan | RAM | Link |
|---|---|---|---|
| **Hetzner** ✅ Best value | ~€4/month | 2 GB | [hetzner.com](https://hetzner.com) |
| DigitalOcean | $6/month | 1 GB | [digitalocean.com](https://digitalocean.com) |
| Vultr | $6/month | 1 GB | [vultr.com](https://vultr.com) |
| Contabo | ~€5/month | 4 GB | [contabo.com](https://contabo.com) |

**Minimum requirements:** 1 vCPU, 1 GB RAM, Ubuntu 22.04 or 24.04

---

### Step-by-Step: VPS Deployment

#### Step 1 — Get a VPS

1. Sign up on Hetzner (or any provider above)
2. Create a new server → choose **Ubuntu 24.04** → smallest plan
3. Once created, copy your server's **IP address**

#### Step 2 — Connect to your server

```bash
# From your computer (Mac/Linux terminal or Windows PowerShell):
ssh root@YOUR_SERVER_IP
```

#### Step 3 — Upload the project

```bash
# From your computer (not inside the server):
scp -r /path/to/project root@YOUR_SERVER_IP:/root/alk
```

Or clone from your Git repo if you pushed it there:
```bash
# Inside the server:
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /root/alk
```

#### Step 4 — Run the one-command deployer

```bash
# Inside the server:
cd /root/alk
sudo bash deploy.sh
```

The script will automatically:
- ✅ Install Docker if not present
- ✅ Generate all security secrets (JWT, encryption, database password)
- ✅ Ask for your AI key (Groq) → paste and press Enter, or skip for mock mode
- ✅ Ask for your JVZoo secret key → paste and press Enter, or skip for now
- ✅ Build and start all 4 services (DB, Redis, Backend, Frontend)
- ✅ Run database migrations and seed
- ✅ Verify everything is working

When it finishes, your app is live at `http://YOUR_SERVER_IP`

#### Step 5 — Add HTTPS (free, automatic)

```bash
# Install Caddy (handles SSL automatically):
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# Create Caddy config:
cat > /etc/caddy/Caddyfile << 'EOF'
yourdomain.com {
    reverse_proxy localhost:80
}
EOF

# Start Caddy:
systemctl restart caddy
```

> 💡 Caddy automatically gets a free SSL certificate from Let's Encrypt. Your app will be at `https://yourdomain.com` within seconds.

#### Step 6 — Update your app URL in .env

```bash
cd /root/alk
nano .env
# Change: FRONTEND_BASE_URL=https://yourdomain.com
# Then restart:
docker compose restart backend
```

---

## ☁️ Option B: Render (Easiest, No Server Management)

Render reads the included `render.yaml` Blueprint file and provisions everything automatically: PostgreSQL, Redis, backend, and frontend.

### Step-by-Step: Render Deployment

#### Step 1 — Push your project to GitHub

```bash
cd /path/to/project
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

#### Step 2 — Create the Blueprint on Render

1. Go to → **[render.com](https://render.com)** → Sign up (GitHub login is easiest)
2. Click **New +** → **Blueprint**
3. Select your GitHub repo → Render detects `render.yaml` automatically
4. Render shows you the 4 services it will create: `affiliate-backend`, `affiliate-frontend`, `affiliate-redis`, `affiliate-db`

#### Step 3 — Fill in the required keys

On the same screen, Render asks for the keys marked `sync: false` in `render.yaml`:

| Key | Required? | Where to get it |
|---|---|---|
| `GROQ_API_KEY` | 🔴 Required | Your Groq key (`gsk_...`) |
| `JVZOO_SECRET_KEY` | 🔴 Always required | From JVZoo Vendor Dashboard. Not selling via JVZoo yet? Enter any random string (e.g. `openssl rand -hex 24`) — the app will not start without a value here. |
| `EMAIL_PROVIDER_API_KEY` | 🟡 Optional | Your Resend key (`re_...`) |
| `S3_*` (3 keys) | 🟡 Optional | Cloudflare R2 credentials |

Everything else (JWT secrets, encryption keys, database password) is generated automatically by Render — you never need to touch them.

#### Step 4 — Deploy

Click **"Apply"**. Render builds and deploys everything. Takes ~5-10 minutes on first deploy.

Your app URLs will appear on each service's page in the Render dashboard, in the format:
```
Frontend: https://affiliate-frontend-xxxx.onrender.com
Backend:  https://affiliate-backend-xxxx.onrender.com
```
> ℹ️ The random suffix (`-xxxx`) is normal — it appears whenever the plain name is already taken by another Render account. The app detects its real URL automatically at runtime (`RENDER_EXTERNAL_URL`), so this doesn't require any manual configuration.

> ⚠️ **Free tier limitation:** Render's free services spin down after 15 minutes of inactivity and take ~30 seconds to wake up on the next request. Upgrade to the $7/month paid plan to avoid this.

---

## 🚂 Option C: Railway

Railway can read the `docker-compose.yml` directly and run all 4 services.

### Step-by-Step: Railway Deployment

#### Step 1 — Push to GitHub (same as Render Step 1 above)

#### Step 2 — Create Railway project

1. Go to → **[railway.app](https://railway.app)** → Sign up (GitHub login)
2. Click **"New Project"** → **"Deploy from GitHub repo"** → select your repo
3. Railway detects `docker-compose.yml` automatically

#### Step 3 — Set environment variables BEFORE first deploy

> ⚠️ **Important:** Unlike Render, Railway does not auto-generate secrets. You must set them manually before deploying.

Go to your project → **Settings → Shared Variables** → add these:

```bash
# Security secrets — generate each value by running this on your computer:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

JWT_SECRET          = <generated value 1>
JWT_REFRESH_SECRET  = <generated value 2>
ENCRYPTION_KEY      = <generated value 3>
HASH_SECRET         = <generated value 4>

# Keys that need a real account:
GROQ_API_KEY        = gsk_your_groq_key_here
AI_PROVIDER         = groq
AI_USE_REAL_LLM     = true
JVZOO_SECRET_KEY    = your_jvzoo_key  (or any random string if not using JVZoo)
FRONTEND_BASE_URL   = https://your-railway-app-url.railway.app
```

Railway auto-provides `DATABASE_URL` and `REDIS_URL` from the compose services.

#### Step 4 — Deploy

Click **"Deploy"**. Railway builds all services. Your app will be live at the Railway-provided URL (shown in the project dashboard).

---

## 🪰 Option D: Fly.io

Fly.io runs your Docker containers on its global network. Best if you want a VPS-like experience without managing servers.

### Step-by-Step: Fly.io Deployment

#### Step 1 — Install Fly CLI

```bash
# Mac/Linux:
curl -L https://fly.io/install.sh | sh

# Windows: download from https://fly.io/docs/getting-started/installing-flyctl/
```

#### Step 2 — Create account and login

```bash
fly auth signup   # or: fly auth login
```

#### Step 3 — Create the app

```bash
cd /path/to/project
fly launch --no-deploy
# When prompted:
# App name: affiliate-launch-kit (or any name)
# Region: pick closest to your users
# Don't deploy yet: Yes
```

#### Step 4 — Add PostgreSQL and Redis

```bash
# PostgreSQL (cheapest plan ~$0/month on free allowance):
fly postgres create --name alk-db --region your-region
fly postgres attach alk-db
# This auto-sets DATABASE_URL in your app's secrets

# Redis:
fly redis create --name alk-redis --region your-region
# Copy the Redis URL shown, then:
fly secrets set REDIS_URL=rediss://your-redis-url-here
```

#### Step 5 — Set secrets

```bash
fly secrets set \
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  HASH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  GROQ_API_KEY=gsk_your_key_here \
  AI_PROVIDER=groq \
  AI_USE_REAL_LLM=true \
  JVZOO_SECRET_KEY=your_jvzoo_key \
  NODE_ENV=production
```

#### Step 6 — Deploy

```bash
fly deploy
```

Your app will be live at `https://affiliate-launch-kit.fly.dev`

```bash
# Update FRONTEND_BASE_URL with your actual URL:
fly secrets set FRONTEND_BASE_URL=https://affiliate-launch-kit.fly.dev
fly deploy  # Redeploy to pick up the change
```

---

## ✅ First Launch Checklist

After deploying on any platform, do these steps before using the app:

**1 — Open the app and register an account**
- Use any email + password (8+ characters)

**2 — Activate with the test license key**
```
ALK-DEMO-TEST-0001-0001
```

**3 — Create a campaign and verify AI generation works**
- If content appears → AI key is working ✅
- If you see placeholder text → AI key is not set correctly

**4 — Test export**
- Generate a campaign → click Export → download the ZIP → verify it opens

**5 — Security: remove or replace the demo license key**

The demo key `ALK-DEMO-TEST-0001-0001` is seeded into every fresh install and is public knowledge. Delete or deactivate it from the `licenses` table in your database before going live:

```bash
# VPS with Docker:
docker compose exec postgres psql -U alk_user -d affiliate_launch_kit \
  -c "UPDATE licenses SET status='revoked' WHERE jvzoo_transaction_id = 'JVZ-TEST-0001';"

# Or connect with any PostgreSQL client using your DATABASE_URL
```

**6 — Verify your JVZoo webhook URL**

If you're selling via JVZoo, set the IPN URL in your JVZoo product settings to:
```
https://yourdomain.com/api/webhooks/jvzoo/ipn
```

---

## 🔧 Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| App doesn't open after deploy | Services still starting | Wait 40 seconds, then check logs |
| AI generates placeholder text | `AI_USE_REAL_LLM` is false or key is wrong | Verify `GROQ_API_KEY` starts with `gsk_` and `AI_USE_REAL_LLM=true` |
| Backend crashes on startup | Missing or placeholder secrets | Check that JWT_SECRET, ENCRYPTION_KEY etc. are not the default `change-me` values |
| License activation fails | Key doesn't match DB | Make sure the key you enter exactly matches what was seeded or created |
| Emails not sending | Resend key not set | Check `EMAIL_PROVIDER_API_KEY` starts with `re_`; without it, emails log to console only |
| ZIP export fails and no file | S3 misconfigured | Check S3 credentials, or remove S3 vars entirely to fall back to local storage |
| JVZoo IPN returns 400 | Wrong `JVZOO_SECRET_KEY` | Must match exactly what's in JVZoo Vendor Dashboard → Settings → Secret Key |

**View live logs:**
```bash
# VPS / Docker:
docker compose logs -f backend       # Backend logs
docker compose logs -f frontend      # Frontend logs
docker compose logs -f postgres      # Database logs

# Render: Dashboard → your service → Logs tab
# Railway: Dashboard → your service → Logs tab
# Fly.io: fly logs
```

---

## 📦 Keys You Must Provide

Only these keys require a real account — everything else is handled automatically.

```bash
# ─── 🔴 REQUIRED — App won't generate real content without these ──────────────
GROQ_API_KEY=                  # Free at console.groq.com | format: gsk_...
AI_PROVIDER=groq               # Options: groq | anthropic | openai | gemini
AI_USE_REAL_LLM=true

# ─── 🔴 REQUIRED (if selling via JVZoo) ──────────────────────────────────────
JVZOO_SECRET_KEY=              # JVZoo → Vendor Dashboard → Settings → Secret Key
                               # Skip at deploy time — add later when ready to sell

# ─── 🟡 OPTIONAL — working fallbacks exist without these ─────────────────────
EMAIL_PROVIDER_API_KEY=        # Resend key (re_...) | Fallback: emails logged to console
EMAIL_FROM_ADDRESS=            # Your verified sender domain in Resend

S3_BUCKET_NAME=                # Fallback: local disk storage
S3_ACCESS_KEY_ID=              # Cloudflare R2 or AWS S3
S3_SECRET_ACCESS_KEY=
S3_REGION=auto                 # Use "auto" for Cloudflare R2

# ─── 🟡 OPTIONAL — alternative AI providers (pick one only) ──────────────────
ANTHROPIC_API_KEY=             # If using Claude | console.anthropic.com
OPENAI_API_KEY=                # If using GPT-4o | platform.openai.com
GEMINI_API_KEY=                # If using Gemini | aistudio.google.com
```

---

*Built with NestJS 11 · React 18 · PostgreSQL 17 · Redis 7 · TypeScript*
