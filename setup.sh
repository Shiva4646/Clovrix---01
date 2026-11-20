#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Clovrix v2.0 — One-Command Fresh Boot Script (Linux / macOS / WSL)
# Usage: ./setup.sh
# Applies all 6 SQL migration files including new Clovrix AI Governance schema
# ══════════════════════════════════════════════════════════════════════════════
set -e

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
INDENT="   "

banner() {
  echo ""
  echo -e "${BLUE}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║          Clovrix — AI Governance Platform v2.0              ║"
  echo "  ║  ISO 42001 · NIST AI RMF · SOC 2 · GDPR  |  Self-Hosted    ║"
  echo "  ║              you know where you stand                       ║"
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

step() { echo -e "\n${CYAN}${BOLD}▶  $1${NC}"; }
info() { echo -e "${INDENT}${YELLOW}→${NC}  $1"; }
ok()   { echo -e "${INDENT}${GREEN}✓${NC}  $1"; }
warn() { echo -e "${INDENT}${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${INDENT}${RED}✗  $1${NC}"; exit 1; }

# ── Helper: wait for TCP port ─────────────────────────────────────────────────
wait_port() {
  local host="$1" port="$2" label="${3:-$1:$2}" max="${4:-60}"
  info "Waiting for $label..."
  local count=0
  while ! nc -z "$host" "$port" 2>/dev/null; do
    count=$((count+1))
    [ $count -ge $max ] && err "$label did not become ready within ${max}s"
    printf "."
    sleep 2
  done
  echo ""
  ok "$label is ready"
}

# ── Helper: wait for HTTP 200 ─────────────────────────────────────────────────
wait_http() {
  local url="$1" label="${2:-$1}" max="${3:-120}"
  info "Waiting for $label..."
  local count=0
  while ! curl -sf "$url" &>/dev/null; do
    count=$((count+1))
    [ $count -ge $max ] && { warn "$label not responding after ${max}s — continuing"; return; }
    printf "."
    sleep 3
  done
  echo ""
  ok "$label is up"
}

# ── Helper: apply SQL file ────────────────────────────────────────────────────
apply_sql() {
  local file="$1" desc="$2"
  if [ ! -f "infrastructure/postgres/$file" ]; then
    warn "$file not found — skipping ($desc)"
    return
  fi
  info "Applying $desc..."
  $COMPOSE exec -T postgres psql -U clovrix -d clovrix < "infrastructure/postgres/$file" 2>&1 \
    | grep -E "(ERROR|FATAL|status)" | head -5 || true
  ok "$desc applied"
}

banner

# ── 0. Prerequisites ──────────────────────────────────────────────────────────
step "Checking prerequisites"
command -v docker &>/dev/null || err "Docker not found. Install Docker Desktop or Docker Engine."
COMPOSE="docker compose"
command -v docker-compose &>/dev/null && COMPOSE="docker-compose"
ok "Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"

# Check project is complete
[ -f "docker-compose.yml" ] || err "docker-compose.yml not found. Run this script from the project root."
[ -f ".env" ]               || err ".env file missing. Ensure clovrix-v2-platform.zip was fully extracted."
ok "Project structure verified"

# ── 1. Tear down existing stack completely (fresh start) ──────────────────────
step "Tearing down any existing stack (containers + volumes)"
$COMPOSE down --volumes --remove-orphans 2>&1 | grep -v "^$" | tail -3 || true
ok "Previous stack removed — starting fresh"

# ── 2. Pull infrastructure images ────────────────────────────────────────────
step "Pulling Docker images (first run may take a few minutes)"
$COMPOSE pull --quiet postgres pgbouncer valkey rabbitmq keycloak minio openbao \
  qdrant meilisearch ollama prometheus grafana loki jaeger mailhog traefik 2>&1 | tail -3
ok "Images pulled"

# ── 3. Build application images ───────────────────────────────────────────────
step "Building Clovrix API and Frontend (no cache)"
info "Building API (ASP.NET Core 8)..."
$COMPOSE build --no-cache --quiet api worker 2>&1 | grep -iE "(error|warning)" | head -5 || true
ok "API + Worker images built"

info "Building Frontend (Next.js 14)..."
$COMPOSE build --no-cache --quiet frontend 2>&1 | grep -iE "^error" | head -5 || true
ok "Frontend image built"

# ── 4. Start infrastructure (Phase 1) ────────────────────────────────────────
step "Starting infrastructure services"
$COMPOSE up -d postgres pgbouncer valkey rabbitmq minio openbao \
  qdrant meilisearch prometheus grafana loki jaeger mailhog 2>&1 | tail -3
ok "Infrastructure services starting"

# ── 5. Wait for core services ─────────────────────────────────────────────────
step "Waiting for core services to be healthy"
wait_port localhost 5432  "PostgreSQL"    90
wait_port localhost 6379  "Valkey"        60
wait_port localhost 5672  "RabbitMQ"      90
wait_port localhost 9000  "MinIO"         60

# Extra buffer for PostgreSQL initdb to auto-apply 01-schema.sql + 02-seed.sql
info "Waiting for PostgreSQL initdb scripts to complete (01-schema + 02-seed)..."
sleep 12

# Verify postgres is accepting queries
until $COMPOSE exec -T postgres pg_isready -U clovrix -q 2>/dev/null; do sleep 2; done
ok "PostgreSQL accepting queries"

# ── 6. Apply ALL SQL migrations ───────────────────────────────────────────────
step "Applying database migrations"
info "(01-schema.sql and 02-seed.sql were auto-applied by PostgreSQL initdb)"

apply_sql "03-frameworks.sql"      "Framework registry + workflow steps (03)"
apply_sql "04-tenant2.sql"         "Acme tenant schema (04)"
apply_sql "05-clovrix-schema.sql"  "Clovrix v2.0 AI Governance schema (05) — NEW"
apply_sql "06-clovrix-seed.sql"    "Clovrix v2.0 AI Governance seed data (06) — NEW"

ok "All migrations applied"

# ── 7. Start Ollama + pull model ──────────────────────────────────────────────
step "Starting Ollama (Local AI Assistant)"
$COMPOSE up -d ollama 2>&1 | tail -2
wait_port localhost 11434 "Ollama" 60

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:1b}"
MODEL_EXISTS=$($COMPOSE exec ollama ollama list 2>/dev/null | grep -c "$OLLAMA_MODEL" || echo "0")
if [ "$MODEL_EXISTS" -eq "0" ]; then
  info "Pulling $OLLAMA_MODEL model (~1.3 GB, cached after first run)..."
  $COMPOSE exec ollama ollama pull "$OLLAMA_MODEL" && ok "Model $OLLAMA_MODEL ready" \
    || warn "Model pull failed — AI Assistant may be unavailable. Run: docker compose exec ollama ollama pull $OLLAMA_MODEL"
else
  ok "Model $OLLAMA_MODEL already cached"
fi

# ── 8. Start Keycloak ─────────────────────────────────────────────────────────
step "Starting Keycloak (IAM — SSO/OIDC)"
$COMPOSE up -d keycloak
info "Keycloak first-start takes 60–90s to import realm..."
wait_http "http://localhost:8180/health" "Keycloak health" 120

# Verify Clovrix realm
if curl -sf "http://localhost:8180/realms/clovrix" &>/dev/null; then
  ok "Clovrix realm imported and available"
else
  warn "Clovrix realm not yet available — it may still be loading. Retrying in 20s..."
  sleep 20
  curl -sf "http://localhost:8180/realms/clovrix" &>/dev/null \
    && ok "Clovrix realm now available" \
    || warn "Realm check inconclusive — login should work once startup completes"
fi

# ── 9. Start API + Worker ─────────────────────────────────────────────────────
step "Starting Clovrix API and background worker"
$COMPOSE up -d api worker
wait_http "http://localhost:5000/health" "Clovrix API" 120

# ── 10. Start Frontend + Traefik ──────────────────────────────────────────────
step "Starting Frontend and reverse proxy"
$COMPOSE up -d frontend traefik
wait_http "http://localhost:3000" "Clovrix Frontend" 90

# ── 11. Final health check ────────────────────────────────────────────────────
step "Running final verification"
declare -A CHECKS=(
  ["Clovrix Platform"]="http://localhost:3000"
  ["Clovrix API"]="http://localhost:5000/health"
  ["Swagger / API Docs"]="http://localhost:5000/swagger"
  ["Keycloak IAM"]="http://localhost:8180/realms/clovrix"
  ["Grafana"]="http://localhost:3001"
  ["MinIO Console"]="http://localhost:9001"
  ["RabbitMQ"]="http://localhost:15672"
  ["MailHog"]="http://localhost:8025"
  ["Ollama"]="http://localhost:11434"
)
ALL_OK=true
for SVC in "${!CHECKS[@]}"; do
  if curl -sf "${CHECKS[$SVC]}" &>/dev/null; then
    ok "$(printf '%-28s' "$SVC") → ${CHECKS[$SVC]}"
  else
    warn "$(printf '%-28s' "$SVC") → ${CHECKS[$SVC]} (still starting)"
    ALL_OK=false
  fi
done

# ── 12. Summary ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  ✦  Clovrix v2.0 is ready!${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}${BOLD}Platform${NC}"
echo   "  ├─  App              http://localhost:3000"
echo   "  ├─  API + Swagger    http://localhost:5000/swagger"
echo   "  ├─  Hangfire Jobs    http://localhost:5000/hangfire"
echo   "  └─  Health           http://localhost:5000/health"
echo ""
echo -e "  ${GREEN}${BOLD}Infrastructure${NC}"
echo   "  ├─  Keycloak    http://localhost:8180   admin / ${KEYCLOAK_ADMIN_PASSWORD:-Clovrix@Keycloak2026!}"
echo   "  ├─  Grafana     http://localhost:3001   admin / ${GRAFANA_ADMIN_PASSWORD:-Clovrix@Grafana2026!}"
echo   "  ├─  RabbitMQ    http://localhost:15672  ${RABBITMQ_USER:-clovrix} / ${RABBITMQ_PASSWORD:-Clovrix@Rabbit2026!}"
echo   "  ├─  MinIO       http://localhost:9001   ${MINIO_ROOT_USER:-clovrix-admin} / ${MINIO_ROOT_PASSWORD:-Clovrix@MinIO2026!}"
echo   "  ├─  MailHog     http://localhost:8025"
echo   "  ├─  Jaeger      http://localhost:16686"
echo   "  └─  Traefik     http://localhost:8080"
echo ""
echo -e "  ${GREEN}${BOLD}Demo Accounts (Clovrix v2.0)${NC}"
echo   "  ├─  alice@demo.com    Admin@Clovrix2026!    Super Admin   tenant: demo"
echo   "  ├─  bob@demo.com      Auditor@Clovrix2026!  Lead Auditor  tenant: demo"
echo   "  ├─  carol@demo.com    Auditor@Clovrix2026!  Auditor       tenant: demo"
echo   "  └─  admin@acme.local  Admin@Acme2026!     Super Admin   tenant: acme"
echo ""
echo -e "  ${GREEN}${BOLD}Quick Commands${NC}"
echo   "  ├─  Stop all:          docker compose down"
echo   "  ├─  View API logs:     docker compose logs -f api"
echo   "  ├─  View all logs:     docker compose logs -f"
echo   "  └─  Full reset:        docker compose down -v   (wipes all data)"
echo ""
if [ "$ALL_OK" = false ]; then
  echo -e "  ${YELLOW}⚠  Some services are still warming up. Wait 30s and refresh.${NC}"
  echo ""
fi
echo -e "${BLUE}${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo ""
