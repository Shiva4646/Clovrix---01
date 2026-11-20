# Audit Cycle — Backend & Database Implementation Plan (3 Days)

## Goal

Make the end-to-end audit cycle **persist and work against the real backend/database**, replacing the frontend's in-memory mock store. The cycle:

> Admin creates audit + assigns framework controls → Control Lead enriches & marks ready → Assessor tests (manual/automated) → Reviewer approves/returns → Admin closes.

By end of Day 3 the five stages run against Postgres via the .NET API, tenant-scoped and RBAC-enforced, with an end-to-end cycle demonstrated.

## Team (4 members)

| Code | Member | Track |
|------|--------|-------|
| **BE1** | Backend engineer 1 | Audit setup + Control Lead slice |
| **BE2** | Backend engineer 2 | Assessment → Review → Close slice |
| **DB1** | Database engineer 1 | Migrations, tenancy, performance |
| **DB2** | Database engineer 2 | Seed/fixtures, integrity, reporting views |

## Starting point (already done)

- **Migration SQL exists**: `infrastructure/postgres/migrations/2026-07-08_audit_cycle.sql` — `audits`, `audit_controls`, `audit_control_versions`, `assessments`, plus `findings.audit_id/audit_control_id`.
- **Endpoint contracts are known**: they mirror the frontend mock API (`frameworkManagementApi`, `controlLeadApi`, `assessorApi`, `reviewerApi`, `auditManagementApi`). The backend must match these shapes so the frontend swaps mock→HTTP with no contract changes.
- **Stack**: .NET 8 minimal API + Dapper, Postgres schema-per-tenant, Keycloak JWT, Hangfire, MassTransit/RabbitMQ.

## Endpoint contract (targets for the backend)

| Slice | Endpoints |
|-------|-----------|
| **BE1 — Audit + Control Lead** | `POST /audits`, `POST /audits/{id}/assign-controls`, `GET /audits`, `GET /audits/{id}`, `GET /assigned-controls`, `GET /control/{id}`, `PUT /control/{id}/summary\|policy\|evidence\|notes\|status`, `POST /control/{id}/ready-for-assessment`, `GET /control/{id}/version-history` |
| **BE2 — Assessment + Review + Close** | `POST /control/{id}/assessments`, `GET /assessments` (review queue), `POST /assessments/{id}/review` (approve/return), `POST /findings/{id}/resolve`, `POST /audits/{id}/close` |

## Cross-cutting rules (both backend engineers)

- **Tenant scope from the JWT claim, never the `X-Tenant-ID` header.**
- **Server-side RBAC** mirroring the capability matrix: Control Lead edits only their own controls; only Assessor records assessments; only Reviewer approves/returns; only Admin closes.
- **State machine**: `assigned → in_progress → ready → assessed → reviewed`; audit `draft → active → in_review → closed`. Reject illegal transitions.
- **Transactional writes**: every control field update writes an `audit_control_versions` row in the same transaction; a failed assessment creates its finding atomically.

---

## Day 1 — Foundation

**Focus:** migrations applied, auth foundation, audit creation + assignment working.

| Owner | Tasks | Deliverable / acceptance |
|-------|-------|--------------------------|
| **DB1** | Stand up a migration runner (DbUp/FluentMigrator). Make `2026-07-08_audit_cycle.sql` idempotent and **parameterised per tenant schema**; write the per-tenant apply script. Apply to `tenant_demo`. | `dotnet run --migrate` creates all 4 tables + indexes in `tenant_demo`; re-runs are no-ops. |
| **DB2** | Author seed/fixtures: one demo audit + a batch of `audit_controls` across states. Add integrity: `updated_at` triggers, version/status `CHECK`s, FK `ON DELETE` behaviour verified. | Seed script populates a demo audit; verification queries return expected counts. |
| **BE1 + BE2** (pair, AM) | Shared auth foundation: resolve tenant from JWT claim; define RBAC authorization policies (`admin`, `control_lead`, `assessor`, `reviewer`, `auditor`); apply `.RequireAuthorization()` to the new module group. | Anonymous request → 401; wrong-role request → 403 (proven by a smoke test). |
| **BE1** (PM) | `POST /audits`, `GET /audits`, `GET /audits/{id}`. `POST /audits/{id}/assign-controls` — copy framework control templates → `audit_controls` (templates never mutated) + seed an "Assignment" version row. | Create + assign returns copied controls; templates unchanged; rows visible in DB. |
| **BE2** (PM) | Scaffold Assessments module + DI; stub `POST /control/{id}/assessments` and `GET /assessments`; agree the assessment/finding DTO shapes with BE1. | Endpoints reachable in Swagger; DTOs frozen. |

**Handoff:** DB1 confirms schema is live before BE1 runs assign-controls against it (midday).

---

## Day 2 — Core cycle logic

**Focus:** Control Lead enrichment + versioning; assessment → finding; review; close guard.

| Owner | Tasks | Deliverable / acceptance |
|-------|-------|--------------------------|
| **DB1** | Index/query tuning for list endpoints (`assigned-controls`, review queue, audit summary). Confirm PgBouncer transaction-mode compatibility for the versioned writes. Verify `findings` linkage columns + indexes. | Explain-analyze on the 3 hot queries within target; no seq-scans on `audit_id`/`assigned_control_lead`. |
| **DB2** | Reporting/summary **views** the backend can read for audit progress (assessed/ready, pass/fail, pending review, open findings). Expand seed data to cover every state (untested, pass, fail+finding, returned). | `audit_progress_v` view returns correct rollups for the seeded audit. |
| **BE1** | `GET /assigned-controls` (scoped to caller), `GET /control/{id}`, the five `PUT /control/{id}/…` updates + `audit_control_versions` writes (transactional), `POST /control/{id}/ready-for-assessment`, `GET /control/{id}/version-history`. | Editing a field bumps version + writes a history row atomically; Control Lead can only touch own controls. |
| **BE2** | `POST /control/{id}/assessments` (manual/automated) — **fail auto-creates a finding** in the same transaction. `POST /assessments/{id}/review` (approve/return). `POST /audits/{id}/close` with the guard (no ready-unassessed, no pending review, no open findings) + state transition. | Recording a fail creates a linked finding; close is rejected with a blocker breakdown until clear, then sets `closed`. |

**Handoff:** BE2 depends on DB2's finding linkage + BE1's audit_controls being populated; sync at standup.

---

## Day 3 — Automation, hardening, end-to-end

**Focus:** automated tests, notifications, integration tests, provisioning, demo.

| Owner | Tasks | Deliverable / acceptance |
|-------|-------|--------------------------|
| **DB1** | Per-tenant provisioning: clone the audit tables into a new tenant schema on tenant creation. Add the migration to the CI pipeline. Backup/restore runbook for the new tables. | New tenant gets the audit schema automatically; CI runs migrations on a clean DB. |
| **DB2** | Finalise reporting views + a **data dictionary** for the audit tables handed to BE/frontend. Data-integrity test pass; performance sign-off on seeded volume. | Data dictionary published; integrity/perf checklist green. |
| **BE1** | Integration tests (xUnit + Testcontainers) for audit setup + Control Lead flow, **including tenant-isolation and RBAC** (cross-tenant read denied, wrong-role write denied). Swagger contract check vs. the frontend mock signatures. | Green test suite; Swagger matches the agreed contract. |
| **BE2** | Automated-test **Hangfire/CCM job** (writes assessment results from a connected integration + failure streak). **Notifications** (MassTransit/email) on hand-offs: assigned→lead, ready→assessor, fail→lead, approve→admin. Integration tests for assessment/review/close. | Scheduled job records an automated assessment; each hand-off emits a notification; suite green. |
| **All (PM)** | End-to-end cycle against the real DB: assign → enrich → ready → test (fail one) → review → resolve → **close**. Bug bash + demo. | One audit driven start→closed through the API; demo recorded. |

---

## Definition of done

- All endpoints in the contract implemented, tenant-scoped, RBAC-enforced, and matching the frontend mock signatures.
- Migrations run idempotently via the runner and in CI; new tenants provisioned automatically.
- Version history + finding creation are transactional; close is guarded by the state machine.
- Integration tests cover the happy path **plus** tenant isolation and role restrictions; all green.
- One full cycle demonstrated end-to-end against Postgres.

## Dependencies & critical path

1. **DB1 schema live (Day 1 AM)** → unblocks BE1 assign-controls (Day 1 PM).
2. **BE1 assigned-controls + ready flag (Day 2)** → unblocks BE2 assessment/close (Day 2–3).
3. **DB2 finding linkage + views (Day 1–2)** → unblocks BE2 auto-finding + audit summary.
4. **Auth foundation (Day 1 AM, shared)** blocks everything else — do it first.

## Risks / watch-items

- **Schema-per-tenant cloning** is the least-baked area — DB1 should spike it Day 1 to de-risk Day 3.
- **PgBouncer + transactional version writes** — validate transaction mode early (Day 2, DB1).
- **RBAC parity** — the server must enforce what the frontend only hints; don't trust the client capability gates.
- **Automated-test job** depends on a connected integration; if none is available, BE2 uses a deterministic stub (as the frontend mock does) and flags it.

## Out of scope (follow-on, not in these 3 days)

- Frontend mock→HTTP wiring (swap `frameworkManagement.ts` calls for `lib/api.ts`). ~1–2 days after the API is stable.
- The Assessor/Reviewer/Auditor UI already exists; only the data source changes.
