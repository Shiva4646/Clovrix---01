# Clovrix — Setup Guide

A GRC (Governance, Risk, Compliance) platform. The whole stack runs in Docker —
you do **not** need .NET, Node, or PostgreSQL installed locally to run it.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Docker Desktop** (with Compose v2) | The only hard requirement. Give it **≥ 8 GB memory** in Settings → Resources (Keycloak + Postgres are heavy). |
| **Windows + PowerShell** | Needed for the `.ps1` deploy/verify scripts. On Mac/Linux use the raw `docker compose` commands instead. |
| **Free ports** | `3000` (web UI), `5000` (API), `8180` (Keycloak). Make sure nothing else is using them. |
| **The project folder** | Copy the whole `clovrix-platform` folder to the new machine (or `git clone` the repo). |
| **A `.env` file** | Must sit at the repo root before first start (see step 2). |

---

## 2. Create the `.env` file

At the root of the project (next to `docker-compose.yml`), create a file named `.env`.
If one was shipped with the project, use it. Otherwise it must contain at least:

```
POSTGRES_DB=clovrix
POSTGRES_USER=clovrix
POSTGRES_PASSWORD=Clovrix@Postgres2026!
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
MINIO_ROOT_USER=clovrix
MINIO_ROOT_PASSWORD=Clovrix@Minio2026!
MINIO_REGION=us-east-1
```

(Ask whoever handed over the project for the exact `.env` — other services read
values from it too.)

---

## 3. Start the stack

Open **PowerShell** in the project folder and run the one-command deploy:

```powershell
.\Deploy-Clovrix-Fresh.ps1
```

This builds the images, starts the core services, runs the database migrations,
seeds the framework control libraries, and imports the Keycloak realm (all logins).

**If the machine is resource-tight** (or the script struggles), start just the core
set manually instead:

```powershell
docker compose up -d --build postgres pgbouncer valkey rabbitmq minio keycloak api frontend
```

Then apply the migrations + seeds once Postgres is healthy:

```powershell
$pg = "clovrix-postgres"
Get-Content .\infrastructure\postgres\migrations\2026-07-08_audit_cycle.sql -Raw | docker exec -i $pg psql -U clovrix -d clovrix
Get-Content .\infrastructure\postgres\migrations\2026-07-10_integrity.sql  -Raw | docker exec -i $pg psql -U clovrix -d clovrix
Get-Content .\infrastructure\postgres\migrations\2026-07-10_reporting.sql  -Raw | docker exec -i $pg psql -U clovrix -d clovrix
docker cp .\infrastructure\postgres\seeds\framework_controls_seed.sql       $pg`:/tmp/s1.sql
docker cp .\infrastructure\postgres\seeds\framework_controls_extra_seed.sql $pg`:/tmp/s2.sql
docker exec -i $pg psql -U clovrix -d clovrix -f /tmp/s1.sql
docker exec -i $pg psql -U clovrix -d clovrix -f /tmp/s2.sql
```

---

## 4. Wait, then open the app

Keycloak takes ~30–60 seconds to become ready on first start. Confirm it's up:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8180/realms/clovrix/.well-known/openid-configuration
```

`200` means ready. Then open the web UI:

**http://localhost:3000**

---

## 5. Login accounts (demo tenant)

| Role | Username | Password |
|---|---|---|
| Compliance Admin | `ComplianceAdmin@clovrix.local` | `ComplianceAdmin@Clovrix2026!` |
| Control Lead | `controlLead@clovrix.com` | `ControlLead@Clovrix2026!` |
| Assessor | `assessor@clovrix.com` | `Assessor@Clovrix2026!` |
| Assessor 1 | `assessor1@clovrix.com` | `Assessor@Clovrix2026!` |
| Assessor 2 | `assessor2@clovrix.com` | `Assessor@Clovrix2026!` |
| Assessor 3 | `assessor3@clovrix.com` | `Assessor@Clovrix2026!` |
| Assessor 4 | `assessor4@clovrix.com` | `Assessor@Clovrix2026!` |
| Assessor 5 | `assessor5@clovrix.com` | `Assessor@Clovrix2026!` |
| Reviewer | `reviewer@clovrix.local` | `Reviewer@Clovrix2026!` |
| Risk Owner | `riskowner@clovrix.local` | `Riskowner@Clovrix2026!` |
| Lead Auditor | `auditor@clovrix.local` | `Auditor@Clovrix2026!` |
| Read-Only | `readonly@clovrix.local` | `Readonly@Clovrix2026!` |

---

## 6. Verify it works (optional)

Run the automated end-to-end check — it drives the full audit cycle across all
roles via the API and prints PASS/FAIL:

```powershell
.\Verify-Clovrix.ps1
```

A clean run ends with `X passed, 0 failed`.

---

## Troubleshooting

- **Login says "invalid" for a known account** → Keycloak wasn't ready yet, or the
  browser autofilled an old password. Wait for step 4's `200`, clear the password
  field, retype it.
- **Pages load but data is empty / API errors** → the migrations/seeds didn't run.
  Re-run the step-3 SQL block.
- **Containers keep dying / "unhealthy"** → not enough Docker memory. Raise it to
  8 GB+ and stop the heavy extras: `docker compose stop ollama prometheus grafana loki jaeger`.
- **Everything is stuck** → full reset with `docker compose down` then re-run
  `.\Deploy-Clovrix-Fresh.ps1`. (Add `-v` to `down` only if you want to wipe the
  database and start completely fresh.)
