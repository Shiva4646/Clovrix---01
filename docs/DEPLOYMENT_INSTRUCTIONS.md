# CLOVRIX Platform v1 - Deployment Instructions

**Date**: 2026-07-20  
**Version**: 1.1.0  
**Status**: ✅ Ready for Deployment

---

## Prerequisites

Before deploying, ensure you have:

- ✅ **Docker Desktop** (with at least 8GB RAM allocated)
- ✅ **PowerShell 5.0+** (Windows)
- ✅ **Git** (optional, for version control)
- ✅ **Free ports**: 3000 (frontend), 5000 (API), 8180 (Keycloak), 5432 (Postgres)

### Check Prerequisites

```powershell
# Check Docker
docker --version
docker ps

# Check PowerShell
$PSVersionTable.PSVersion

# Check ports (should show no listening processes)
netstat -ano | findstr ":3000\|:5000\|:8180\|:5432"
```

---

## Step 1: Prepare Environment

```powershell
# Navigate to project directory
cd E:\clovrix-platform_v1

# Verify .env file exists and has correct values
Get-Content .env | grep -i "POSTGRES\|KEYCLOAK\|MINIO"

# Expected output:
# POSTGRES_DB=clovrix
# POSTGRES_USER=clovrix
# POSTGRES_PASSWORD=Clovrix@Postgres2026!
# KEYCLOAK_ADMIN=admin
# KEYCLOAK_ADMIN_PASSWORD=admin
```

If `.env` is missing or incomplete, create it with:

```env
POSTGRES_DB=clovrix
POSTGRES_USER=clovrix
POSTGRES_PASSWORD=Clovrix@Postgres2026!
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
MINIO_ROOT_USER=clovrix
MINIO_ROOT_PASSWORD=Clovrix@Minio2026!
MINIO_REGION=us-east-1
```

---

## Step 2: Verify File Structure

```powershell
# Run verification script
$files = @(
    "docker-compose.yml",
    "Deploy-Clovrix-Fresh.ps1",
    "services/api/src/Clovrix.Api/Modules/Accessors.cs",
    "services/api/src/Clovrix.Api/Modules/ControlMappings.cs",
    "services/frontend/src/lib/accessors.ts",
    "services/frontend/src/components/ControlAccessors.tsx",
    "infrastructure/postgres/migrations/2026-07-20_accessors_and_mappings.sql"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "✅ $file"
    } else {
        Write-Host "❌ $file - MISSING!"
    }
}
```

---

## Step 3: Start Application Stack

### Option A: Automated Deployment (Recommended)

```powershell
# Run the fresh deployment script
.\Deploy-Clovrix-Fresh.ps1

# This will:
# 1. Stop any existing containers
# 2. Build all images
# 3. Start all services
# 4. Wait for services to be healthy
# 5. Run database migrations
# 6. Seed framework controls
# 7. Import Keycloak realm

# Expected output:
# ✅ Postgres is healthy
# ✅ Keycloak is healthy
# ✅ Migrations applied
# ✅ Seed data loaded
# ✅ All services started
```

### Option B: Manual Deployment (For Debugging)

```powershell
# Start core services
docker-compose up -d postgres pgbouncer valkey rabbitmq minio keycloak

# Wait for Keycloak to be ready
$timeout = 60
$elapsed = 0
while ($elapsed -lt $timeout) {
    $status = curl.exe -s -o NUL -w "%{http_code}" `
        "http://localhost:8180/realms/clovrix/.well-known/openid-configuration" 2>$null
    if ($status -eq "200") {
        Write-Host "✅ Keycloak is ready"
        break
    }
    Write-Host "⏳ Waiting for Keycloak... ($elapsed/$timeout)"
    Start-Sleep -Seconds 2
    $elapsed += 2
}

# Start backend and frontend
docker-compose up -d api frontend

# Apply migrations
$pg = "clovrix-postgres"
Get-Content .\infrastructure\postgres\migrations\2026-07-08_audit_cycle.sql -Raw | `
    docker exec -i $pg psql -U clovrix -d clovrix
Get-Content .\infrastructure\postgres\migrations\2026-07-10_integrity.sql -Raw | `
    docker exec -i $pg psql -U clovrix -d clovrix
Get-Content .\infrastructure\postgres\migrations\2026-07-10_reporting.sql -Raw | `
    docker exec -i $pg psql -U clovrix -d clovrix

# Apply NEW migration for accessors & mappings
Get-Content .\infrastructure\postgres\migrations\2026-07-20_accessors_and_mappings.sql -Raw | `
    docker exec -i $pg psql -U clovrix -d clovrix

# Seed data
docker cp .\infrastructure\postgres\seeds\framework_controls_seed.sql $pg`:/tmp/s1.sql
docker cp .\infrastructure\postgres\seeds\framework_controls_extra_seed.sql $pg`:/tmp/s2.sql
docker exec -i $pg psql -U clovrix -d clovrix -f /tmp/s1.sql
docker exec -i $pg psql -U clovrix -d clovrix -f /tmp/s2.sql
```

---

## Step 4: Verify Services Are Running

```powershell
# Check all containers are running
docker-compose ps

# Expected output:
# NAME              STATUS
# clovrix-postgres  Up (healthy)
# clovrix-pgbouncer Up
# clovrix-valkey    Up
# clovrix-rabbitmq  Up
# clovrix-minio     Up
# clovrix-keycloak  Up (healthy)
# clovrix-api       Up (healthy)
# clovrix-frontend  Up

# Check specific service health
docker-compose exec api curl -s http://localhost:5000/health
# Expected: {"status":"healthy","version":"1.0.0",...}

docker-compose exec api curl -s http://localhost:5000/swagger/
# Expected: Swagger UI HTML
```

---

## Step 5: Verify New Endpoints Exist

```powershell
# Check Accessors endpoints
docker-compose exec api curl -s http://localhost:5000/api/accessors | jq .

# Expected: Empty array [] (no assignments yet)

# Check Mappings endpoints
docker-compose exec api curl -s http://localhost:5000/api/mappings/frameworks | jq .

# Expected: Array with framework mappings

# Check pre-populated mappings
docker-compose exec api curl -s http://localhost:5000/api/mappings/cross-map/ISO-27001/SOC-2 | jq .

# Expected: Array with 5-8 control mappings
```

---

## Step 6: Access the Application

### Frontend
- **URL**: http://localhost:3000
- **Wait**: ~30 seconds for first load

### API Documentation
- **Swagger UI**: http://localhost:5000/swagger

### Admin Panel
- **URL**: http://localhost:8180/admin
- **Username**: admin
- **Password**: admin

### Database
- **Host**: localhost:5432
- **User**: clovrix
- **Password**: Clovrix@Postgres2026!
- **Database**: clovrix
- **Tool**: pgAdmin or DBeaver

---

## Step 7: Login & Test

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Compliance Admin | ComplianceAdmin@clovrix.local | ComplianceAdmin@Clovrix2026! |
| Control Lead | controlLead@clovrix.com | ControlLead@Clovrix2026! |
| Assessor | assessor@clovrix.com | Assessor@Clovrix2026! |
| Assessor 1 | assessor1@clovrix.com | Assessor@Clovrix2026! |
| Assessor 2 | assessor2@clovrix.com | Assessor@Clovrix2026! |
| Assessor 3 | assessor3@clovrix.com | Assessor@Clovrix2026! |
| Assessor 4 | assessor4@clovrix.com | Assessor@Clovrix2026! |
| Assessor 5 | assessor5@clovrix.com | Assessor@Clovrix2026! |
| Reviewer | reviewer@clovrix.local | Reviewer@Clovrix2026! |
| Lead Auditor | auditor@clovrix.local | Auditor@Clovrix2026! |
| Risk Owner | riskowner@clovrix.local | Riskowner@Clovrix2026! |
| Read-Only | readonly@clovrix.local | Readonly@Clovrix2026! |

### Test Login

```powershell
# 1. Open browser: http://localhost:3000
# 2. See CLOVRIX logo and professional branding
# 3. Login with ComplianceAdmin@clovrix.local / ComplianceAdmin@Clovrix2026!
# 4. Should see dashboard with:
#    - 6 KPI cards (Compliance Score, Open Findings, etc)
#    - Compliance trend chart
#    - Framework coverage
#    - Findings by severity
#    - Workflow status
```

---

## Step 8: Verify New Features

### Test Accessor Roles

```powershell
# 1. Navigate to a control detail page
# 2. Look for "Accessors" section (NEW)
# 3. Assign users to roles:
#    - Control Lead
#    - Assessor
#    - Reviewer
#    - Auditor
#    - Remediation Owner
# 4. Should see confirmation message
# 5. Refresh page - assignments should persist
```

### Test Control Mappings

```powershell
# 1. Open browser dev console (F12)
# 2. Make API call to test mappings:

fetch('http://localhost:5000/api/mappings/frameworks', {
  headers: {
    'Authorization': 'Bearer <token>',
    'X-Tenant-ID': 'tenant_demo'
  }
})
.then(r => r.json())
.then(d => console.log(d))

# Expected: Array of framework mappings with statistics

# 3. Test cross-map:
fetch('http://localhost:5000/api/mappings/cross-map/ISO-27001/SOC-2', {
  headers: {
    'Authorization': 'Bearer <token>',
    'X-Tenant-ID': 'tenant_demo'
  }
})
.then(r => r.json())
.then(d => console.log(d))

# Expected: Array of 5-8 control mappings
```

---

## Troubleshooting

### Issue: "Port 3000 already in use"

```powershell
# Find and stop process using port 3000
netstat -ano | findstr ":3000"
taskkill /PID <PID> /F

# Or change frontend port in docker-compose.yml:
# ports:
#   - "3001:3000"  # Change 3000 to unused port
```

### Issue: "Keycloak not responding"

```powershell
# Wait longer - Keycloak can take 60+ seconds on first start
# Check logs:
docker-compose logs keycloak | tail -50

# If stuck, restart:
docker-compose restart keycloak
docker-compose logs -f keycloak  # Watch logs
```

### Issue: "Database migrations failed"

```powershell
# Check if database is accessible
docker-compose exec postgres psql -U clovrix -d clovrix -c "SELECT 1"

# Re-apply migrations manually:
$pg = "clovrix-postgres"
Get-Content .\infrastructure\postgres\migrations\2026-07-20_accessors_and_mappings.sql -Raw | `
    docker exec -i $pg psql -U clovrix -d clovrix

# Check migration status:
docker-compose exec postgres psql -U clovrix -d clovrix -c "\dt tenant_demo.*"
```

### Issue: "API returns 500 error"

```powershell
# Check backend logs:
docker-compose logs api | tail -50

# Verify migration was applied:
docker-compose exec postgres psql -U clovrix -d clovrix \
  -c "SELECT * FROM tenant_demo.control_accessors LIMIT 1"

# Restart API:
docker-compose restart api
docker-compose logs -f api
```

### Issue: "Frontend shows blank page"

```powershell
# Check frontend logs:
docker-compose logs frontend | tail -50

# Clear browser cache and refresh
# Ctrl + Shift + Delete

# Or restart frontend:
docker-compose restart frontend
```

---

## Performance Tuning

### Allocate More RAM to Docker

1. Open Docker Desktop Settings
2. Go to Resources
3. Increase Memory to **10-16 GB**
4. Click Apply & Restart

### Disable Unnecessary Services

If you only need core functionality:

```powershell
# Start only essential services
docker-compose up -d \
  postgres pgbouncer keycloak api frontend

# Skip:
# - valkey (caching - optional)
# - rabbitmq (message queue - optional)
# - minio (file storage - optional)
# - ollama (AI - optional)
```

---

## Validation Checklist

- [ ] Docker running with sufficient RAM (8GB+)
- [ ] All ports free (3000, 5000, 8180, 5432)
- [ ] `.env` file configured
- [ ] All services started (`docker-compose ps` shows all healthy)
- [ ] Frontend loads at http://localhost:3000
- [ ] Can login with demo account
- [ ] Dashboard displays correctly with logo & branding
- [ ] Swagger UI accessible at http://localhost:5000/swagger
- [ ] New endpoints present (`/api/accessors`, `/api/mappings/*`)
- [ ] Pre-populated mappings exist (10 ISO-27001 ↔ SOC 2)
- [ ] Can assign users to controls (Accessor roles)
- [ ] Can view control mappings

---

## Next Steps

1. ✅ Complete verification checklist above
2. Run end-to-end workflow test (see TESTING_CHECKLIST.md)
3. Load test with sample data (see ENHANCEMENT_SUMMARY.md)
4. Security audit (RBAC, tenant isolation)
5. Performance baseline testing
6. Deploy to staging environment
7. UAT with stakeholders
8. Production deployment

---

## Support

- **Documentation**: See ACCESSORS_AND_MAPPINGS.md, ENHANCEMENT_SUMMARY.md
- **Logs**: `docker-compose logs <service>`
- **Database access**: `docker-compose exec postgres psql -U clovrix -d clovrix`
- **API**: Swagger UI at http://localhost:5000/swagger

---

**Status**: ✅ Ready to Deploy  
**Version**: 1.1.0  
**Date**: 2026-07-20
