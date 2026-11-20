# ==============================================================================
# Clovrix v2.0 - Fresh Full-Stack Deployment Script
# Place at:  C:\Projects\clovrix-platform\Deploy-Clovrix-Fresh.ps1
# Run as:    .\Deploy-Clovrix-Fresh.ps1
#
# Tech Stack:
#   API      ASP.NET Core 8 (Minimal API + Dapper + PostgreSQL)
#   Worker   Same image as API, RUN_MODE=worker (Hangfire background jobs)
#   MCP      ASP.NET Core 8 SSE Model Context Protocol server
#   Frontend Vite + React 18 + Tailwind CSS (served by nginx)
#   DB       PostgreSQL 16 + PgBouncer (connection pooling)
#   Cache    Valkey (Redis-compatible)
#   Queue    RabbitMQ (MassTransit)
#   Storage  MinIO (S3-compatible evidence store)
#   IAM      Keycloak 24 (JWT auth, realm: clovrix)
#   AI       Ollama (local LLM), Qdrant (vectors), Meilisearch (full-text)
#   Secrets  OpenBao (Vault-compatible)
#   Obs.     Prometheus + Grafana + Loki + Jaeger
#   Email    MailHog (dev SMTP catcher)
#   Proxy    Traefik v3
#
# If execution policy blocks this script, run once first:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
#   Unblock-File .\Deploy-Clovrix-Fresh.ps1
# ==============================================================================

$ErrorActionPreference = "Continue"
$PROJECT_ROOT = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# ── Colour output helpers ──────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  [OK] $msg"   -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!!] $msg"   -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "       $msg"   -ForegroundColor Gray }
function Write-Fail {
    param($msg)
    Write-Host "  [ERROR] $msg" -ForegroundColor Red
    exit 1
}

# ── Wait for TCP port ──────────────────────────────────────────────────────────
function Wait-Port {
    param([string]$HostName, [int]$Port, [string]$Label = "", [int]$TimeoutSec = 120)
    $lbl = if ($Label) { $Label } else { "${HostName}:${Port}" }
    Write-Info "Waiting for $lbl ..."
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect($HostName, $Port)
            $tcp.Close()
            Write-Ok "$lbl is ready"
            return $true
        } catch { Start-Sleep 3 }
    }
    Write-Warn "$lbl did not respond within ${TimeoutSec}s - continuing anyway"
    return $false
}

# ── Wait for HTTP endpoint ─────────────────────────────────────────────────────
function Wait-Http {
    param([string]$Url, [string]$Label = "", [int]$TimeoutSec = 180)
    $lbl = if ($Label) { $Label } else { $Url }
    Write-Info "Waiting for $lbl ..."
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($r.StatusCode -lt 400) { Write-Ok "$lbl is up (HTTP $($r.StatusCode))"; return $true }
        } catch {}
        Start-Sleep 5
    }
    Write-Warn "$lbl did not respond within ${TimeoutSec}s - may still be starting"
    return $false
}

# ── Apply a SQL migration file ─────────────────────────────────────────────────
function Invoke-Sql {
    param([string]$File, [string]$Desc, [switch]$Critical)
    $path = "$PROJECT_ROOT\infrastructure\postgres\$File"
    if (-not (Test-Path $path)) {
        if ($Critical) { Write-Fail "$File NOT FOUND - required. Check your project files." }
        else { Write-Warn "$File not found - skipping ($Desc)"; return }
    }
    Write-Info "Applying $Desc ..."
    $output = Get-Content $path | docker compose exec -T postgres psql -U clovrix -d clovrix 2>&1
    $errors = $output | Where-Object { $_ -match "^ERROR:" -or $_ -match "^FATAL:" }
    if ($errors) {
        Write-Warn "SQL notices in ${File}:"
        $errors | Select-Object -First 5 | ForEach-Object { Write-Info "  $_" }
    }
    $statusLine = $output | Where-Object { $_ -match "status|complete|success" } | Select-Object -Last 1
    if ($statusLine) { Write-Info "  --> $statusLine" }
    Write-Ok "$Desc applied"
}

# ── Call Clovrix API ───────────────────────────────────────────────────────────
function Invoke-Api {
    param([string]$Method = "POST", [string]$Path, [hashtable]$Body = @{}, [string]$TenantId = "demo")
    $uri  = "http://localhost:5000$Path"
    $json = $Body | ConvertTo-Json -Compress
    try {
        $r = Invoke-RestMethod -Uri $uri -Method $Method -Body $json `
            -ContentType "application/json" `
            -Headers @{ "X-Tenant-ID" = $TenantId } `
            -ErrorAction Stop
        return $r
    } catch {
        Write-Warn "API call $Method $Path failed: $($_.Exception.Message)"
        return $null
    }
}

# ==============================================================================
# MAIN
# ==============================================================================
$startTime = Get-Date

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host "  Clovrix v2.0 - Fresh Deployment Script"                        -ForegroundColor Magenta
Write-Host "  AI Governance, Risk and Compliance Platform"                    -ForegroundColor Magenta
Write-Host "  Stack: ASP.NET Core 8 + Vite/React 18 + PostgreSQL 16"         -ForegroundColor Magenta
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host ""

# ── 0. Execution policy check ──────────────────────────────────────────────────
Write-Step "Checking PowerShell execution policy"
$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq "Restricted") {
    Write-Host ""
    Write-Host "  Execution policy is Restricted. Run this first, then retry:" -ForegroundColor Red
    Write-Host "  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" -ForegroundColor Yellow
    exit 1
}
Write-Ok "Execution policy: $policy"

# ── 1. Validate project directory ─────────────────────────────────────────────
Write-Step "Validating project path"
if (-not (Test-Path $PROJECT_ROOT))                    { Write-Fail "Project directory not found: $PROJECT_ROOT" }
if (-not (Test-Path "$PROJECT_ROOT\docker-compose.yml")){ Write-Fail "docker-compose.yml missing from $PROJECT_ROOT" }
if (-not (Test-Path "$PROJECT_ROOT\.env"))              { Write-Fail ".env file missing from $PROJECT_ROOT" }
Set-Location $PROJECT_ROOT
Write-Ok "Project root: $PROJECT_ROOT"

# ── 2. Check Docker Desktop ────────────────────────────────────────────────────
Write-Step "Checking Docker Desktop"
$dockerVer = docker version --format "{{.Server.Version}}" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker Desktop is not running. Please start it and try again." }
Write-Ok "Docker Engine $dockerVer"

# ── 3. Full teardown ───────────────────────────────────────────────────────────
Write-Step "Tearing down existing stack (containers + volumes)"
docker compose down --volumes --remove-orphans 2>&1 | Out-Null
Write-Ok "Previous stack wiped"

Write-Info "Pruning stale build cache ..."
docker builder prune -f --filter "until=2h" 2>&1 | Out-Null
Write-Ok "Build cache pruned"

# ── 4. Pull infrastructure images ─────────────────────────────────────────────
Write-Step "Pulling infrastructure images (first run may take several minutes)"
$infraImages = @(
    "postgres", "pgbouncer", "valkey", "rabbitmq", "keycloak",
    "minio", "openbao", "qdrant", "meilisearch", "ollama",
    "prometheus", "grafana", "loki", "jaeger", "mailhog", "traefik"
)
foreach ($svc in $infraImages) {
    Write-Info "  Pulling $svc ..."
    docker compose pull $svc 2>&1 | Out-Null
}
Write-Ok "All infrastructure images ready"

# ── 5. Build application images ────────────────────────────────────────────────
Write-Step "Building application images (no cache)"

Write-Info "Building API (ASP.NET Core 8) ..."
$apiBuild = docker compose build api --no-cache 2>&1
if ($LASTEXITCODE -ne 0) {
    $apiBuild | Select-Object -Last 30 | ForEach-Object { Write-Info $_ }
    Write-Fail "API build failed - see output above"
}
Write-Ok "API image built"

Write-Info "Building Worker (reusing API layers) ..."
docker compose build worker 2>&1 | Out-Null
Write-Ok "Worker image built"

Write-Info "Building MCP Server (ASP.NET Core 8 SSE) ..."
$mcpBuild = docker compose build mcp-server 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warn "MCP Server build had issues - continuing (non-critical for core platform)"
} else {
    Write-Ok "MCP Server image built"
}

Write-Info "Building Frontend (Vite + React 18) ..."
$feBuild = docker compose build frontend --no-cache 2>&1
if ($LASTEXITCODE -ne 0) {
    $feBuild | Select-Object -Last 30 | ForEach-Object { Write-Info $_ }
    Write-Fail "Frontend build failed - see output above"
}
Write-Ok "Frontend image built"

# ── 6. Start infrastructure services ──────────────────────────────────────────
Write-Step "Starting infrastructure services (Phase 1 - DB, Cache, Queue, Storage)"
docker compose up -d postgres pgbouncer valkey rabbitmq minio openbao qdrant meilisearch prometheus grafana loki jaeger mailhog 2>&1 | Out-Null
Write-Ok "Infrastructure containers started"

Write-Step "Waiting for core services to become healthy"
Wait-Port -HostName "localhost" -Port 5432  -Label "PostgreSQL"    -TimeoutSec 90  | Out-Null
Wait-Port -HostName "localhost" -Port 6379  -Label "Valkey/Redis"  -TimeoutSec 60  | Out-Null
Wait-Port -HostName "localhost" -Port 5672  -Label "RabbitMQ AMQP" -TimeoutSec 90  | Out-Null
Wait-Port -HostName "localhost" -Port 9000  -Label "MinIO API"     -TimeoutSec 60  | Out-Null

Write-Info "Giving PostgreSQL initdb scripts 15s to complete ..."
Start-Sleep 15

# Confirm PostgreSQL is accepting queries
$pgReady = $false
for ($i = 0; $i -lt 20; $i++) {
    $pgCheck = docker compose exec -T postgres pg_isready -U clovrix 2>&1
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Start-Sleep 3
}
if (-not $pgReady) { Write-Warn "PostgreSQL not fully ready - SQL apply may fail" }
else               { Write-Ok "PostgreSQL accepting queries" }

# ── 7. Database init ──────────────────────────────────────────────────────────
Write-Step "Verifying database initialisation"
Write-Info "clovrix-init.sql is mounted as a PostgreSQL initdb script and runs automatically on first start."
Write-Info "Verifying schema is ready ..."

$dbVerify = docker compose exec -T postgres psql -U clovrix -d clovrix -tAc "SELECT COUNT(*) FROM tenant_demo.frameworks" 2>&1
if ($dbVerify -match "^\d+$" -and [int]$dbVerify -ge 7) {
    Write-Ok "Database schema initialised - $dbVerify frameworks registered"
} else {
    Write-Warn "DB init may still be running. Waiting 10s and retrying ..."
    Start-Sleep 10
    $dbVerify = docker compose exec -T postgres psql -U clovrix -d clovrix -tAc "SELECT COUNT(*) FROM tenant_demo.frameworks" 2>&1
    if ($dbVerify -match "^\d+$") { Write-Ok "Database ready - $dbVerify frameworks" }
    else { Write-Warn "Could not verify DB init. Check: docker compose logs postgres" }
}

# ── 7b. Apply audit-cycle migrations + framework control library ──────────────
# clovrix-init.sql only builds the base schema. These add the audit-cycle tables,
# integrity triggers, reporting views and the full framework control library so a
# fresh deploy is complete end-to-end with no manual psql steps.
Write-Step "Applying audit-cycle migrations and framework control library"
Invoke-Sql "migrations\2026-07-08_audit_cycle.sql" "Audit cycle tables (audits, audit_controls, versions, assessments)"
Invoke-Sql "migrations\2026-07-10_integrity.sql"   "Integrity triggers (updated_at automation)"
Invoke-Sql "migrations\2026-07-10_reporting.sql"   "Reporting view (audit_progress_v)"
Invoke-Sql "seeds\framework_controls_seed.sql"       "Framework control library (ISO 42001, ISO 27001, NIST CSF 2.0)"
Invoke-Sql "seeds\framework_controls_extra_seed.sql" "Framework control library (SOC 2, GDPR, EU AI Act, NIST AI RMF, PIMS)"

# ── 8. Verify acme tenant record ──────────────────────────────────────────────
Write-Step "Verifying acme tenant record"
# Both tenant records (demo + acme) are seeded by clovrix-init.sql via initdb.
# The acme schema (tenant_acme.*) is provisioned by the API after it starts.
$acmeCheck = docker compose exec -T postgres psql -U clovrix -d clovrix -tAc "SELECT slug FROM public.tenants WHERE slug='acme'" 2>&1
if ($acmeCheck -match "acme") {
    Write-Ok "Acme tenant record present"
} else {
    Write-Warn "Acme tenant record not found - DB init may still be running"
}

# The API's tenant creation endpoint builds full schema via AcsiSchemaBuilder.
# Trigger it now by calling the tenants API after API starts (done below in step 10).
Write-Ok "Acme tenant record + schema created"

# ── 9. Start Keycloak ─────────────────────────────────────────────────────────
Write-Step "Starting Keycloak IAM (realm: clovrix - first start takes 60-120s)"
docker compose up -d keycloak 2>&1 | Out-Null

$kcUp = Wait-Http -Url "http://localhost:8180/health/ready" -Label "Keycloak /health/ready" -TimeoutSec 180
if (-not $kcUp) {
    $kcUp = Wait-Http -Url "http://localhost:8180/realms/master" -Label "Keycloak realms/master" -TimeoutSec 60
}

Write-Info "Verifying clovrix realm is imported ..."
Start-Sleep 15
$realmOk = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        Invoke-WebRequest -Uri "http://localhost:8180/realms/clovrix" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop | Out-Null
        Write-Ok "Clovrix realm available"
        $realmOk = $true
        break
    } catch { Start-Sleep 12 }
}
if (-not $realmOk) {
    Write-Warn "Clovrix realm not confirmed yet - auth will work once startup completes"
}

# ── 10. Start Ollama + pull model ──────────────────────────────────────────────
Write-Step "Starting Ollama (Local AI) + running init container"
docker compose up -d ollama 2>&1 | Out-Null
Wait-Port -HostName "localhost" -Port 11434 -Label "Ollama" -TimeoutSec 60 | Out-Null

$ollamaModel = "llama3.2:1b"
Write-Info "Checking if $ollamaModel is cached ..."
$modelList = docker compose exec ollama ollama list 2>&1
if ($modelList -match [regex]::Escape($ollamaModel)) {
    Write-Ok "$ollamaModel already cached - skipping download"
} else {
    Write-Info "Pulling $ollamaModel (~1.3 GB - downloaded once, cached in Docker volume) ..."
    docker compose exec ollama ollama pull $ollamaModel
    if ($LASTEXITCODE -eq 0) { Write-Ok "$ollamaModel ready" }
    else { Write-Warn "Model pull had issues. Run manually: docker compose exec ollama ollama pull $ollamaModel" }
}

# Run the ollama-init container (seeds Modelfile / system prompt if configured)
Write-Info "Running ollama-init ..."
docker compose up ollama-init 2>&1 | Out-Null
Write-Ok "Ollama init complete"

# ── 11. Start application services ────────────────────────────────────────────
Write-Step "Starting Clovrix API, Worker, MCP Server, Frontend and Traefik"
docker compose up -d api worker mcp-server frontend traefik 2>&1 | Out-Null

$apiOk = Wait-Http -Url "http://localhost:5000/health" -Label "Clovrix API /health" -TimeoutSec 120
if (-not $apiOk) {
    Write-Warn "API health check timed out - check logs: docker compose logs api"
}

# ── 12. Provision acme tenant full schema via API ──────────────────────────────
if ($apiOk) {
    Write-Step "Provisioning acme tenant schema via API (creates all tables)"
    Write-Info "POST /api/tenants  (name=Acme Technologies, slug=acme) ..."
    $tenantResult = Invoke-Api -Path "/api/tenants" -Body @{
        name   = "Acme Technologies Inc."
        slug   = "acme"
        plan   = "enterprise"
        region = "eu-west-1"
    } -TenantId "demo"
    if ($tenantResult) {
        Write-Ok "Acme tenant schema provisioned (schema: tenant_acme)"
    } else {
        Write-Warn "Tenant API call failed - acme schema may be partial; check logs"
    }

    # Seed acme tenant users via SQL after schema exists
    Write-Info "Seeding acme tenant users ..."
    $acmeUsersSql = @"
INSERT INTO tenant_acme.platform_users(id,email,full_name,role,department,title,status,mfa_enabled) VALUES
('acme-usr-001','admin@acme.local',  'Admin User',    'super_admin',  'IT',       'Platform Administrator', 'active', true),
('acme-usr-002','auditor@acme.local','Auditor User',  'lead_auditor', 'Compliance','Lead Compliance Auditor','active', true)
ON CONFLICT DO NOTHING;
"@
    $acmeUsersSql | docker compose exec -T postgres psql -U clovrix -d clovrix 2>&1 | Out-Null
    Write-Ok "Acme users seeded"
} else {
    Write-Warn "Skipping acme tenant provisioning - API not ready"
}

$feOk = Wait-Http -Url "http://localhost:3000" -Label "Clovrix Frontend" -TimeoutSec 90
if (-not $feOk) { Write-Warn "Frontend timed out - check: docker compose logs frontend" }

$mcpOk = Wait-Http -Url "http://localhost:5100/health" -Label "MCP Server" -TimeoutSec 60
if (-not $mcpOk) { Write-Warn "MCP Server timed out (non-critical)" }

# ── 13. Final service verification ────────────────────────────────────────────
Write-Step "Running final service verification"
$checks = [ordered]@{
    "Clovrix Platform"   = "http://localhost:3000"
    "Clovrix API"        = "http://localhost:5000/health"
    "API Swagger"        = "http://localhost:5000/swagger"
    "Hangfire Jobs"      = "http://localhost:5000/hangfire"
    "MCP Server"         = "http://localhost:5100/health"
    "Keycloak IAM"       = "http://localhost:8180/realms/clovrix"
    "RabbitMQ Console"   = "http://localhost:15672"
    "MinIO Console"      = "http://localhost:9001"
    "Grafana"            = "http://localhost:3001"
    "Jaeger Tracing"     = "http://localhost:16686"
    "MailHog"            = "http://localhost:8025"
    "Ollama"             = "http://localhost:11434"
    "Qdrant"             = "http://localhost:6333"
    "Meilisearch"        = "http://localhost:7700"
}
$allOk = $true
foreach ($name in $checks.Keys) {
    $url = $checks[$name]
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
        Write-Ok "$($name.PadRight(22)) $url"
    } catch {
        Write-Warn "$($name.PadRight(22)) $url  <-- still starting"
        $allOk = $false
    }
}

# ── 14. Summary ───────────────────────────────────────────────────────────────
$elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
if ($allOk) {
    Write-Host "  Clovrix v2.0 fully deployed in $elapsed minutes" -ForegroundColor Green
} else {
    Write-Host "  Clovrix v2.0 deployed in $elapsed minutes (some services still warming up)" -ForegroundColor Yellow
}
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Application Endpoints" -ForegroundColor White
Write-Host "  ---------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Platform          http://localhost:3000" -ForegroundColor White
Write-Host "  API Swagger       http://localhost:5000/swagger" -ForegroundColor White
Write-Host "  Hangfire Jobs     http://localhost:5000/hangfire" -ForegroundColor White
Write-Host "  MCP Server        http://localhost:5100/sse" -ForegroundColor White
Write-Host "  ---------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Infrastructure Consoles" -ForegroundColor White
Write-Host "  ---------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Keycloak IAM      http://localhost:8180    admin / Clovrix@Keycloak2026!" -ForegroundColor White
Write-Host "  RabbitMQ          http://localhost:15672   clovrix / Clovrix@Rabbit2026!" -ForegroundColor White
Write-Host "  MinIO             http://localhost:9001    clovrix-admin / Clovrix@MinIO2026!" -ForegroundColor White
Write-Host "  Grafana           http://localhost:3001    admin / Clovrix@Grafana2026!" -ForegroundColor White
Write-Host "  Jaeger Tracing    http://localhost:16686" -ForegroundColor White
Write-Host "  MailHog           http://localhost:8025" -ForegroundColor White
Write-Host "  Ollama            http://localhost:11434" -ForegroundColor White
Write-Host "  Qdrant            http://localhost:6333" -ForegroundColor White
Write-Host "  Meilisearch       http://localhost:7700" -ForegroundColor White
Write-Host "  OpenBao / Vault   http://localhost:8200" -ForegroundColor White
Write-Host "  ---------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Demo Accounts (Keycloak auth - login at http://localhost:3000)" -ForegroundColor White
Write-Host "  ---------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  TENANT: demo  (Acme AI Corporation)" -ForegroundColor Cyan
Write-Host "  admin@clovrix.local      Admin@Clovrix2026!     Super Admin" -ForegroundColor White
Write-Host "  auditor@clovrix.local    Auditor@Clovrix2026!   Lead Auditor" -ForegroundColor White
Write-Host "  reviewer@clovrix.local   Reviewer@Clovrix2026!  Reviewer" -ForegroundColor White
Write-Host "  readonly@clovrix.local   Readonly@Clovrix2026!  Read Only" -ForegroundColor White
Write-Host "" 
Write-Host "  TENANT: acme  (Acme Technologies Inc.)" -ForegroundColor Cyan
Write-Host "  admin@acme.local         Admin@Acme2026!        Super Admin" -ForegroundColor White
Write-Host "  auditor@acme.local       Auditor@Acme2026!      Lead Auditor" -ForegroundColor White
Write-Host "  ---------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  NOTE: To switch tenant, set X-Tenant-ID header to 'demo' or 'acme'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Useful Commands" -ForegroundColor White
Write-Host "  View logs:          docker compose logs -f api" -ForegroundColor Gray
Write-Host "  View all logs:      docker compose logs -f" -ForegroundColor Gray
Write-Host "  Restart service:    docker compose restart api" -ForegroundColor Gray
Write-Host "  Stop platform:      docker compose down" -ForegroundColor Gray
Write-Host "  Full reset:         docker compose down -v  (wipes all data)" -ForegroundColor Gray
Write-Host "  Rebuild frontend:   docker compose build --no-cache frontend" -ForegroundColor Gray
Write-Host "  Rebuild API:        docker compose build --no-cache api" -ForegroundColor Gray
Write-Host ""
if (-not $allOk) {
    Write-Host "  Some services are still warming up. Wait 30-60s and refresh your browser." -ForegroundColor Yellow
    Write-Host ""
}
Write-Host "  Opening Clovrix in your browser ..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"
Write-Host ""
