# Clovrix — Automated Compliance Solution & Integration Framework

> **Self-hostable · AI-native · Multi-tenant**
> ISO 42001 · SOC 2 Type II · GDPR · Production-ready

---

## Quick Start

```bash
git clone https://github.com/your-org/clovrix-platform
cd clovrix-platform
chmod +x setup.sh
./setup.sh
```

That's it. The script:
1. Checks prerequisites (Docker + Docker Compose)
2. Pulls all 20 container images
3. Builds the API and frontend
4. Waits for each service to be healthy
5. Seeds the demo tenant with 28 control domains, users, vendors, policies, and findings
6. Prints all access URLs and credentials

---

## Access URLs

| Service | URL | Default Credentials |
|---|---|---|
| **Platform** | http://localhost:3000 | See demo users below |
| **API + Swagger** | http://localhost:5000/swagger | — |
| **Keycloak (IAM)** | http://localhost:8180 | admin / Admin@Clovrix2026! |
| **Grafana** | http://localhost:3001 | admin / Clovrix@Grafana2026! |
| **RabbitMQ** | http://localhost:15672 | clovrix / Clovrix@Rabbit2026! |
| **MinIO** | http://localhost:9001 | clovrix-admin / Clovrix@MinIO2026! |
| **MailHog** | http://localhost:8025 | — |
| **Jaeger** | http://localhost:16686 | — |
| **Hangfire** | http://localhost:5000/hangfire | — |
| **Traefik** | http://localhost:8080 | — |

## Demo Users

| Email | Password | Role |
|---|---|---|
| ComplianceAdmin@clovrix.local | ComplianceAdmin@Clovrix2026! | Compliance Admin |
| auditor@clovrix.local | Auditor@Clovrix2026! | Lead Auditor |
| reviewer@clovrix.local | Reviewer@Clovrix2026! | Audit Reviewer |
| readonly@clovrix.local | Readonly@Clovrix2026! | Read Only |
| controlLead@clovrix.com | ControlLead@Clovrix2026! | Control Lead |
| assessor@clovrix.com | Assessor@Clovrix2026! | Assessor |
| assessor1@clovrix.com | Assessor@Clovrix2026! | Assessor 1 |
| assessor2@clovrix.com | Assessor@Clovrix2026! | Assessor 2 |
| assessor3@clovrix.com | Assessor@Clovrix2026! | Assessor 3 |
| assessor4@clovrix.com | Assessor@Clovrix2026! | Assessor 4 |
| assessor5@clovrix.com | Assessor@Clovrix2026! | Assessor 5 |
| riskowner@clovrix.local | Riskowner@Clovrix2026! | Risk Owner |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Traefik v3                           │
│              (Reverse proxy + rate limiting)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   Next.js 14               ASP.NET Core 8
   (Frontend)               (Minimal API)
                                    │
         ┌──────────────────────────┼─────────────────────────┐
         ▼              ▼           ▼            ▼            ▼
    PostgreSQL      Valkey      RabbitMQ      MinIO       OpenBao
    + PgBouncer   (Cache)     (MassTransit)  (S3)        (Secrets)
                                    │
                         ┌──────────┴─────────┐
                         ▼                    ▼
                     Hangfire             Ollama
                   (Job Scheduler)      (Local LLM)
                                            │
                                        Qdrant
                                       (Vector DB)
```

### Multi-Tenancy

- **PostgreSQL**: Schema-per-tenant (`tenant_{slug}`) — full data isolation
- **MinIO**: Bucket-per-tenant (`evidence-{slug}`) — file isolation
- **Valkey**: Key prefix `{slug}:` — cache namespace isolation
- **OpenBao**: Path `secret/tenant/{slug}/` — secret isolation
- **Routing**: `X-Tenant-ID` header on every API request

---

## Tech Stack

| Component | Technology | License |
|---|---|---|
| API | ASP.NET Core 8 Minimal API | MIT |
| Frontend | Next.js 14 + TypeScript | MIT |
| Database | PostgreSQL 16 + PgBouncer + Patroni | PostgreSQL/MIT |
| Cache | **Valkey** (Redis fork, BSD-3) | BSD-3 |
| Queue | RabbitMQ 3.13 + MassTransit | Apache 2.0 |
| Auth | Keycloak 24 | Apache 2.0 |
| Storage | MinIO (S3-compatible) | AGPL self-hosted |
| Secrets | **OpenBao** (Vault fork) | MPL 2.0 |
| Vector DB | Qdrant | Apache 2.0 |
| Search | Meilisearch | MIT |
| LLM | Ollama (local, air-gapped) | MIT |
| Jobs | Hangfire + PostgreSQL | LGPL |
| PDF | QuestPDF Community | MIT |
| Email | MailKit + MailHog | MIT |
| Tracing | OpenTelemetry + Jaeger | Apache 2.0 |
| Metrics | Prometheus + Grafana + Loki | Apache 2.0 / AGPL |
| Proxy | Traefik v3 | MIT |

---

## Modules (12 total — all L4 production)

1. **Control Framework** — ISO 42001, SOC 2, GDPR control editor with custom control builder
2. **Evidence Vault** — MinIO upload, OCR (Tesseract), versioning, presigned download URLs
3. **Audit Workflows** — 6-step AI-driven pipeline (Evidence → Test → Gap → Report → Review → Archive)
4. **Findings** — Create, assign, SLA enforcement; auto-remediation for critical/high
5. **Remediations** — SLA tracking, email notifications, verify workflow
6. **Continuous Control Monitoring** — Scheduled checks via Hangfire (hourly/daily/weekly)
7. **Risk Register** — Likelihood × Impact heatmap, residual risk, treatment plans
8. **Personnel & Access Reviews** — Training tracking, access review workflows, IdP sync
9. **Vendor Risk** — Risk scoring, DPA/SOC 2 tracking, auto-send assessment emails
10. **Policy Management** — Versioning, SHA-256 cryptographic sign-off, PDF export
11. **Integrations** — Full OAuth 2.0 flow engine (GitHub, Okta, Azure AD, GCP, Jira, Slack, + any provider)
12. **Trust Center** — Public compliance page, embed widget, live scores

---

## OAuth Integrations

Supported providers (plug-and-play):

| Provider | Auth Type | CCM Checks |
|---|---|---|
| GitHub Enterprise | OAuth 2.0 | Branch protection, secret scanning, Dependabot |
| Okta | OAuth 2.0 / OIDC | MFA compliance, dormant accounts |
| Microsoft Azure AD | OAuth 2.0 | User access, MFA, conditional access |
| Google Workspace | OAuth 2.0 | User provisioning, MFA |
| Amazon Web Services | Access Key | S3 public access, CloudTrail, GuardDuty |
| Google Cloud Platform | OAuth 2.0 | IAM, Cloud Logging |
| Jira Software | OAuth 2.0 | Security ticket tracking |
| Slack | OAuth 2.0 | Notification delivery |
| Snyk | API Token | CVE monitoring, critical vuln alerts |
| CrowdStrike Falcon | OAuth 2.0 | Endpoint security posture |
| **Any OAuth 2.0 provider** | OAuth 2.0 | Custom checks via `POST /api/integrations/custom` |

---

## Production Deployment (Kubernetes)

```bash
# Create secrets
kubectl create secret generic clovrix-postgres-secret \
  --from-literal=password=YOUR_PG_PASSWORD

# Deploy
helm upgrade --install clovrix ./helm/clovrix \
  --namespace clovrix \
  --create-namespace \
  -f helm/clovrix/values.yaml \
  --set ingress.hosts[0].host=app.yourcompany.com

# Check
kubectl get pods -n clovrix
```

### Multi-Region

Deploy one Helm release per region:
```bash
helm upgrade --install clovrix-us-east ./helm/clovrix --set global.region=us-east-1
helm upgrade --install clovrix-eu-west ./helm/clovrix --set global.region=eu-west-1
```

Each region gets its own PostgreSQL, Valkey, RabbitMQ, OpenBao, and MinIO.
Cross-region routing via DNS (Cloudflare / Route 53 latency routing).

---

## Production Costs (estimated)

| Item | Cost | Required? |
|---|---|---|
| GPU instance (Ollama AI) | ~$0.50–0.80/hr | Only for AI features |
| SMTP (Mailgun/SES) | ~$10–35/mo | Yes for email notifications |
| Cloudflare Pro (WAF) | $20/mo | Recommended for Trust Center |
| **All software licenses** | **$0** | All open-source |

---

## Development Commands

```bash
# Start everything
./setup.sh

# Start specific service
docker compose up -d api

# Tail API logs
docker compose logs -f api

# Run database migrations (re-run seed)
docker compose exec postgres psql -U clovrix -d clovrix -f /docker-entrypoint-initdb.d/02-seed.sql

# Reset everything (removes all data)
docker compose down -v

# Access API Swagger
open http://localhost:5000/swagger

# Pull Ollama model manually
docker compose exec ollama ollama pull llama3.2:1b
```

---

## License

Clovrix Platform is licensed under the **MIT License**.
All bundled open-source components retain their own licenses (see Tech Stack above).

---

*Built with ♥ for compliance teams who deserve better tooling.*
