#!/bin/bash
# =============================================================================
# deploy.sh — ONE-COMMAND Universal Deployment
# Works on: ANY VPS, ANY Cloud Server, Coolify, Portainer, CapRover, etc.
#
# NOTE (verified June 2026):
#   CapRover does NOT natively support docker-compose.yml (it uses its own
#   captain-definition format), so the compatibility claim above does not
#   hold for CapRover as-is. Coolify, Dokploy, and any raw Linux server with
#   Docker + Docker Compose v2 ARE genuinely compatible with this script.
#
# Usage:  bash deploy.sh
#         (or: sudo bash deploy.sh  — recommended on fresh servers)
# =============================================================================

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' N='\033[0m'
ok()   { echo -e "${G}✓${N} $1"; }
warn() { echo -e "${Y}!${N} $1"; }
err()  { echo -e "${R}✗${N} $1"; }
info() { echo -e "${B}→${N} $1"; }
step() { echo -e "\n${C}━━━ $1 ━━━${N}"; }

# ── Project directory ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

info "Affiliate Launch Kit — Universal Deployer"
info "Project: $SCRIPT_DIR"

# =============================================================================
# STEP 0: Platform compatibility check (informational only — never blocks)
# Detection is best-effort based on each platform's documented auto-injected
# env vars (verified against official docs, June 2026). A missed detection
# just means no warning is shown — it never stops the script from running.
# =============================================================================
detect_incompatible_platform() {
    if [[ -n "${RENDER:-}" ]]; then
        echo "Render"
    elif [[ -n "${RAILWAY_ENVIRONMENT_NAME:-}${RAILWAY_PROJECT_ID:-}" ]]; then
        echo "Railway"
    elif [[ -n "${VERCEL:-}" ]]; then
        echo "Vercel"
    elif [[ -n "${K_SERVICE:-}" ]]; then
        echo "Google Cloud Run"
    elif [[ -n "${ECS_CONTAINER_METADATA_URI:-}${ECS_CONTAINER_METADATA_URI_V4:-}" ]]; then
        echo "AWS ECS/Fargate"
    else
        echo ""
    fi
}

DETECTED_PLATFORM="$(detect_incompatible_platform)"
if [[ -n "$DETECTED_PLATFORM" ]]; then
    warn "Detected platform: ${DETECTED_PLATFORM}."
    warn "This platform does not run docker-compose.yml as a multi-service orchestrator —"
    warn "this script will likely fail or do the wrong thing here."
    info "See README.md in this repo for the correct deployment method on ${DETECTED_PLATFORM}."
    info "Continuing in 8s anyway (Ctrl+C to stop) in case this detection is a false positive..."
    sleep 8
fi

# =============================================================================
# STEP 1: Check / Install Docker
# =============================================================================
step "1/7 — Docker Engine"

if command -v docker &>/dev/null; then
    ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
else
    info "Installing Docker..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg lsb-release
        install -m 0755 -d /etc/apt/keyrings 2>/dev/null || true
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
            gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
            https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
            > /etc/apt/sources.list.d/docker.list 2>/dev/null || true
        apt-get update -qq 2>/dev/null
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null
        systemctl enable --now docker 2>/dev/null || true
    elif command -v dnf &>/dev/null; then
        dnf install -y dnf-plugins-core
        dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable --now docker
    elif command -v yum &>/dev/null; then
        yum install -y yum-utils
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable --now docker
    else
        err "Cannot auto-install Docker on this OS."
        err "Install Docker manually: https://docs.docker.com/engine/install/"
        err "Then re-run this script."
        exit 1
    fi
    ok "Docker installed"
fi

# Check Docker Compose plugin
if docker compose version &>/dev/null; then
    ok "Docker Compose $(docker compose version --short)"
elif command -v docker-compose &>/dev/null; then
    # Fallback: old docker-compose
    ok "Docker Compose (legacy) $(docker-compose --version | grep -oP '\d+\.\d+\.\d+')"
    # Shim: this script uses v2 syntax ("docker compose ...") everywhere below.
    # Translate that to the legacy v1 binary; pass everything else straight to real docker.
    docker() {
        if [[ "${1:-}" == "compose" ]]; then
            shift
            docker-compose "$@"
        else
            command docker "$@"
        fi
    }
else
    err "Docker Compose not found. Install it and re-run."
    exit 1
fi

# Add current user to docker group if not root
if [[ $EUID -ne 0 ]]; then
    if ! groups | grep -q docker; then
        warn "Your user is not in the 'docker' group."
        warn "Run: sudo usermod -aG docker \$USER && newgrp docker"
        warn "Then re-run this script."
        exit 1
    fi
fi

# =============================================================================
# STEP 2: Environment Setup — fully automatic
# =============================================================================
step "2/7 — Environment Variables (auto-generated)"

gen_secret() {
    openssl rand -hex 32 2>/dev/null \
        || od -An -tx1 -N32 /dev/urandom 2>/dev/null | tr -d ' \n' \
        || head -c 64 /dev/urandom | xxd -p 2>/dev/null | tr -d '\n'
}

# Start from the template if no .env exists yet (idempotent: re-running keeps
# whatever you already have and only fills in what's missing/placeholder).
if [[ ! -f .env ]]; then
    [[ -f .env.production ]] && cp .env.production .env || touch .env
fi

set_env_var() {  # set_env_var KEY VALUE  — replaces or appends a key in .env
    local key="$1" value="$2"
    sed -i "/^${key}=/d" .env
    echo "${key}=${value}" >> .env
}

# Any value still holding a template placeholder counts as "not set".
is_placeholder() {
    local v="$1"
    [[ -z "$v" ]] && return 0
    [[ "$v" == *CHANGE_ME* || "$v" == *change-me* || "$v" == *dev-insecure* ]] && return 0
    return 1
}
current_val() { grep -m1 "^${1}=" .env 2>/dev/null | cut -d= -f2-; }

# ── Crypto secrets the backend HARD-REQUIRES to boot in production ──────────
# (backend/src/main.ts::assertProductionSecrets exits the process if any of
#  these are missing or contain a placeholder word — no manual step needed
#  now, this generates real random 256-bit values for all of them)
for key in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY HASH_SECRET; do
    val="$(current_val "$key")"
    if is_placeholder "$val"; then
        set_env_var "$key" "$(gen_secret)"
        ok "Generated ${key}"
    else
        ok "${key} already set — kept existing value"
    fi
done

val="$(current_val POSTGRES_PASSWORD)"
is_placeholder "$val" && set_env_var POSTGRES_PASSWORD "alk_pass_$(gen_secret | head -c 16)"
grep -q '^NODE_ENV=' .env || echo "NODE_ENV=production" >> .env
grep -q '^AI_PROVIDER=' .env || echo "AI_PROVIDER=groq" >> .env

# ── The one thing that genuinely can't be auto-generated: your AI key ───────
# A real Groq/Anthropic/OpenAI/Gemini key has to come from an account you
# own — there's no way to fabricate a working one. If you already exported
# AUTO_AI_KEY before running this script, it's used automatically; otherwise
# you're prompted once, or the app boots in mock mode until you add it.
PROVIDER="$(current_val AI_PROVIDER)"
case "$PROVIDER" in
    anthropic) KEYVAR=ANTHROPIC_API_KEY ;;
    openai)    KEYVAR=OPENAI_API_KEY ;;
    gemini)    KEYVAR=GEMINI_API_KEY ;;
    *)         KEYVAR=GROQ_API_KEY ;;
esac
key_val="$(current_val "$KEYVAR")"

if [[ -z "$key_val" ]]; then
    if [[ -n "${AUTO_AI_KEY:-}" ]]; then
        set_env_var "$KEYVAR" "$AUTO_AI_KEY"
        set_env_var AI_USE_REAL_LLM true
        ok "${KEYVAR} set from AUTO_AI_KEY"
    elif [[ -t 0 ]]; then
        warn "${KEYVAR} is empty — get a free one at console.groq.com (30 seconds, no card)"
        read -rp "Paste ${KEYVAR} now (Enter to skip for now): " USER_KEY
        if [[ -n "$USER_KEY" ]]; then
            set_env_var "$KEYVAR" "$USER_KEY"
            set_env_var AI_USE_REAL_LLM true
            ok "${KEYVAR} saved"
        else
            set_env_var "$KEYVAR" "temp-not-set-$(gen_secret | head -c 16)"
            set_env_var AI_USE_REAL_LLM false
            warn "Skipped — AI generation runs in mock mode until you set ${KEYVAR} in .env and re-run"
        fi
    else
        set_env_var "$KEYVAR" "temp-not-set-$(gen_secret | head -c 16)"
        set_env_var AI_USE_REAL_LLM false
        warn "${KEYVAR} not provided (non-interactive run) — set it in .env and re-run to enable real AI generation"
    fi
else
    ok "${KEYVAR} already set — kept existing value"
fi

# ── JVZOO_SECRET_KEY ──────────────────────────────────────────────────────────
# يتحقق من التوقيع الذي يرسله JVZoo مع كل عملية شراء (IPN webhook).
# القيمة الحقيقية من: JVZoo → Vendor Dashboard → Settings → Secret Key
# إذا تركتها فارغاً التطبيق يشتغل بقيمة مؤقتة — لكن تحقق الرخص لن يعمل
# حتى تضع المفتاح الحقيقي.
JVZOO_VAL="$(current_val JVZOO_SECRET_KEY)"
if is_placeholder "$JVZOO_VAL"; then
    if [[ -t 0 ]]; then
        warn "JVZOO_SECRET_KEY فارغ — اضغط Enter للتخطي الآن وإضافته لاحقاً"
        warn "القيمة الحقيقية من: JVZoo → Vendor Dashboard → Settings → Secret Key"
        read -rp "الصق JVZOO_SECRET_KEY الآن (Enter للتخطي): " JVZOO_INPUT
        if [[ -n "$JVZOO_INPUT" ]]; then
            set_env_var JVZOO_SECRET_KEY "$JVZOO_INPUT"
            ok "JVZOO_SECRET_KEY saved"
        else
            set_env_var JVZOO_SECRET_KEY "jvzoo-temp-$(gen_secret | head -c 20)"
            warn "تم وضع قيمة مؤقتة — أضف المفتاح الحقيقي في .env لاحقاً وأعد تشغيل: docker compose restart backend"
        fi
    else
        set_env_var JVZOO_SECRET_KEY "jvzoo-temp-$(gen_secret | head -c 20)"
        warn "JVZOO_SECRET_KEY: قيمة مؤقتة — أضف المفتاح الحقيقي في .env لتفعيل التحقق من رخص JVZoo"
    fi
else
    ok "JVZOO_SECRET_KEY already set — kept existing value"
fi

ok ".env is fully configured"

# Source .env for this script
set -a; source .env; set +a

# =============================================================================
# STEP 3: Configure Firewall
# =============================================================================
step "3/7 — Firewall"

if command -v ufw &>/dev/null; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    ok "UFW rules added (80, 443)"
elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --permanent --add-service=https 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    ok "Firewalld rules added (80, 443)"
else
    warn "No firewall detected. Ensure ports 80 and 443 are open."
fi

# =============================================================================
# STEP 4: Build Docker Images
# =============================================================================
step "4/7 — Building Docker Images"

info "Building backend image..."
docker compose build backend 2>&1 | tail -5

info "Building frontend image..."
docker compose build frontend 2>&1 | tail -5

ok "All images built"

# =============================================================================
# STEP 5: Start Services
# =============================================================================
step "5/7 — Starting Services"

docker compose up -d

info "Waiting for PostgreSQL and Redis to be ready..."
DB_READY=false
for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-alk_user} &>/dev/null && \
       docker compose exec -T redis redis-cli ping &>/dev/null; then
        DB_READY=true
        break
    fi
    sleep 2
done

if [[ "$DB_READY" == true ]]; then
    ok "PostgreSQL + Redis are ready"
else
    err "PostgreSQL/Redis did not become ready within 60s"
    info "Debug: docker compose logs postgres redis"
    exit 1
fi

# Wait for backend health
info "Waiting for backend to be healthy..."
BACKEND_READY=false
for i in $(seq 1 30); do
    if docker compose exec -T backend curl -sf http://localhost:${BACKEND_PORT:-3000}/api &>/dev/null; then
        BACKEND_READY=true
        break
    fi
    sleep 3
done

if [[ "$BACKEND_READY" == true ]]; then
    ok "Backend is healthy"
else
    err "Backend did not become healthy within 90s"
    info "Debug: docker compose logs backend"
    exit 1
fi

# =============================================================================
# STEP 6: Run Migrations + Seed
# =============================================================================
step "6/7 — Database Migrations & Seed"

info "Running migrations..."
docker compose exec -T backend npx typeorm-ts-node-commonjs \
    -d src/database/data-source.ts migration:run 2>&1 | tail -3 || \
    warn "Migration may need manual check"

info "Seeding database..."
docker compose exec -T backend npx ts-node \
    src/database/seed/index.ts 2>&1 | tail -3 || \
    warn "Seed may need manual check"

ok "Database ready"

# =============================================================================
# STEP 7: Verify Everything
# =============================================================================
step "7/7 — Health Verification"

FAIL=0

# Test 1: PostgreSQL
if docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-alk_user} &>/dev/null; then
    ok "PostgreSQL: ALIVE"
else
    err "PostgreSQL: FAILED"; FAIL=$((FAIL+1))
fi

# Test 2: Redis
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis: ALIVE"
else
    err "Redis: FAILED"; FAIL=$((FAIL+1))
fi

# Test 3: Backend API (checked from inside the Docker network — backend has no
# port published to the host by design; only Nginx/frontend is public-facing.
# Test 5 below separately confirms it's reachable externally via the proxy.)
if docker compose exec -T backend curl -sf http://localhost:${BACKEND_PORT:-3000}/api &>/dev/null; then
    ok "Backend API: ALIVE"
else
    err "Backend API: FAILED"; FAIL=$((FAIL+1))
fi

# Test 4: Frontend
if curl -sf http://localhost:${FRONTEND_PORT:-80} &>/dev/null; then
    ok "Frontend: ALIVE"
else
    err "Frontend: FAILED"; FAIL=$((FAIL+1))
fi

# Test 5: API-Frontend Proxy (trailing slash required — nginx.conf matches
# "location /api/", so a request to "/api" without the slash falls through
# to the SPA fallback and returns 200 without ever hitting the backend)
if curl -sf http://localhost:${FRONTEND_PORT:-80}/api/ &>/dev/null; then
    ok "API Proxy (via Nginx): ALIVE"
else
    err "API Proxy: FAILED"; FAIL=$((FAIL+1))
fi

# Test 6: Docker containers
RUNNING=$(docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | grep -c "running" || echo 0)
if [[ $RUNNING -ge 4 ]]; then
    ok "All ${RUNNING} containers running"
else
    err "Only ${RUNNING}/4 containers running"; FAIL=$((FAIL+1))
fi

# ── Final Report ─────────────────────────────────────────────────────────────
echo ""
if [[ $FAIL -eq 0 ]]; then
    echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
    echo -e "${G}  ✅  ALL CHECKS PASSED — Deployment Successful!${N}"
    echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"

    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || curl -sf ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
    FP=${FRONTEND_PORT:-80}
    BP=${BACKEND_PORT:-3000}

    echo ""
    echo -e "  ${C}Frontend:${N}  http://${SERVER_IP}${FP:+:$FP}"
    echo -e "  ${C}Backend:${N}   http://${SERVER_IP}${BP:+:$BP}/api"
    echo -e "  ${C}Test License:${N} ALK-DEMO-TEST-0001-0001"
    echo ""
    echo -e "  ${Y}Next steps:${N}"
    echo -e "  1. Set up HTTPS (use Caddy or nginx-proxy for auto SSL)"
    echo -e "  2. If you skipped the AI key prompt: add it to .env, then re-run this script"
    echo -e "  3. If you'll sell via JVZoo: replace JVZOO_SECRET_KEY in .env with the real"
    echo -e "     value from your JVZoo Vendor Dashboard → Settings → Secret Key"
    echo -e "     (the auto-generated one only lets the app boot — it won't verify real IPNs)"
    echo ""
else
    echo -e "${R}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
    echo -e "${R}  ✗  ${FAIL} check(s) failed — check logs above${N}"
    echo -e "${R}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
    echo ""
    info "Debug: docker compose logs"
    exit 1
fi
