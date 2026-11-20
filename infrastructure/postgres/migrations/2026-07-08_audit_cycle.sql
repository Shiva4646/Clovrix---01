-- ═════════════════════════════════════════════════════════════════════════════
-- Migration: Audit cycle tables
-- Adds persistence for the end-to-end audit cycle:
--   Admin creates audit + assigns framework controls
--     → Control Lead enriches (policy/evidence/notes/status) + marks ready
--       → Assessor tests (manual/automated) → creates findings
--         → Reviewer approves/returns → Admin closes.
--
-- Conventions match infrastructure/postgres/clovrix-init.sql:
--   VARCHAR(36) UUID primary keys, TIMESTAMPTZ timestamps, VARCHAR status enums.
--
-- MULTI-TENANT: this script targets the `tenant_demo` schema. Apply the same
-- statements to every tenant schema (replace `tenant_demo` with `tenant_<slug>`),
-- or run it as part of the per-tenant provisioning routine.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. AUDITS ─────────────────────────────────────────────────────────────────
-- The root record of one audit cycle for a single framework.
CREATE TABLE IF NOT EXISTS tenant_demo.audits (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    name           VARCHAR(300) NOT NULL,
    description    TEXT,
    department     VARCHAR(150),
    business_unit  VARCHAR(150),
    framework_code VARCHAR(30)  NOT NULL REFERENCES tenant_demo.frameworks(code) ON UPDATE CASCADE,
    start_date     DATE,
    end_date       DATE,
    control_lead   VARCHAR(200),                          -- email of the assigned Control Lead
    status         VARCHAR(20)  NOT NULL DEFAULT 'draft', -- draft | active | in_review | closed
    created_by     VARCHAR(200),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ,
    closed_at      TIMESTAMPTZ,
    CONSTRAINT audits_status_valid CHECK (status IN ('draft','active','in_review','closed'))
);
CREATE INDEX IF NOT EXISTS idx_audits_status         ON tenant_demo.audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_framework      ON tenant_demo.audits(framework_code);
CREATE INDEX IF NOT EXISTS idx_audits_control_lead   ON tenant_demo.audits(control_lead);

-- ── 2. AUDIT CONTROLS ─────────────────────────────────────────────────────────
-- COPIES of framework control templates, made at assignment time. The original
-- framework/control templates are NEVER mutated — all Control Lead edits happen here.
CREATE TABLE IF NOT EXISTS tenant_demo.audit_controls (
    id                    VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    audit_id              VARCHAR(36)  NOT NULL REFERENCES tenant_demo.audits(id) ON DELETE CASCADE,
    source_control_id     VARCHAR(60),                              -- template ref (read-only origin)
    framework_code        VARCHAR(30),
    control_ref           VARCHAR(50)  NOT NULL,                    -- e.g. A.2.2
    control_objective     VARCHAR(300),
    control_title         VARCHAR(400) NOT NULL,
    requirement_summary   TEXT,
    priority              VARCHAR(10),                              -- High | Medium | Low
    theme                 VARCHAR(100),
    implementation_status VARCHAR(30)  NOT NULL DEFAULT 'Not Started', -- Not Started | In Progress | Completed
    assigned_control_lead VARCHAR(200),
    -- Control Lead enrichment fields
    policy_name           VARCHAR(300),
    policy_description     TEXT,
    evidence_required      TEXT,
    implementation_notes  TEXT,
    ready_for_assessment  BOOLEAN      NOT NULL DEFAULT FALSE,
    version               INT          NOT NULL DEFAULT 1,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ,
    last_saved_at         TIMESTAMPTZ,
    CONSTRAINT audit_controls_status_valid
        CHECK (implementation_status IN ('Not Started','In Progress','Completed'))
);
CREATE INDEX IF NOT EXISTS idx_audit_controls_audit   ON tenant_demo.audit_controls(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_controls_lead    ON tenant_demo.audit_controls(assigned_control_lead);
CREATE INDEX IF NOT EXISTS idx_audit_controls_ready   ON tenant_demo.audit_controls(ready_for_assessment);
CREATE INDEX IF NOT EXISTS idx_audit_controls_status  ON tenant_demo.audit_controls(implementation_status);

-- ── 3. AUDIT CONTROL VERSIONS ─────────────────────────────────────────────────
-- Immutable audit trail / version history. One row per field change; backs the
-- "Version History" tab on the Assigned Controls page.
CREATE TABLE IF NOT EXISTS tenant_demo.audit_control_versions (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    audit_control_id VARCHAR(36)  NOT NULL REFERENCES tenant_demo.audit_controls(id) ON DELETE CASCADE,
    version          INT          NOT NULL,
    field            VARCHAR(100) NOT NULL,
    modified_by      VARCHAR(200),
    modified_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    previous_value   TEXT,
    updated_value    TEXT
);
CREATE INDEX IF NOT EXISTS idx_acv_control ON tenant_demo.audit_control_versions(audit_control_id);

-- ── 4. ASSESSMENTS (control tests) ────────────────────────────────────────────
-- One row per test of an audit_control. Manual (assessor review) or automated
-- (CCM rule against an integration). A failing result should raise a finding.
CREATE TABLE IF NOT EXISTS tenant_demo.assessments (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    audit_id         VARCHAR(36)  NOT NULL REFERENCES tenant_demo.audits(id) ON DELETE CASCADE,
    audit_control_id VARCHAR(36)  NOT NULL REFERENCES tenant_demo.audit_controls(id) ON DELETE CASCADE,
    method           VARCHAR(20)  NOT NULL DEFAULT 'manual',  -- manual | automated
    result           VARCHAR(20),                              -- pass | fail | partial
    assessor         VARCHAR(200),
    comments         TEXT,
    evidence_ref     TEXT,
    ccm_rule_id      VARCHAR(36)  REFERENCES tenant_demo.ccm_rules(id) ON DELETE SET NULL, -- automated source
    finding_id       VARCHAR(36)  REFERENCES tenant_demo.findings(id) ON DELETE SET NULL,  -- raised on fail
    tested_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Reviewer decision
    review_status    VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | approved | returned
    reviewer         VARCHAR(200),
    review_comments  TEXT,
    reviewed_at      TIMESTAMPTZ,
    CONSTRAINT assessments_method_valid CHECK (method IN ('manual','automated')),
    CONSTRAINT assessments_result_valid CHECK (result IS NULL OR result IN ('pass','fail','partial')),
    CONSTRAINT assessments_review_valid CHECK (review_status IN ('pending','approved','returned'))
);
CREATE INDEX IF NOT EXISTS idx_assessments_audit    ON tenant_demo.assessments(audit_id);
CREATE INDEX IF NOT EXISTS idx_assessments_control  ON tenant_demo.assessments(audit_control_id);
CREATE INDEX IF NOT EXISTS idx_assessments_result   ON tenant_demo.assessments(result);
CREATE INDEX IF NOT EXISTS idx_assessments_review   ON tenant_demo.assessments(review_status);

-- ── 5. LINK EXISTING FINDINGS / REMEDIATIONS TO THE AUDIT CYCLE ────────────────
-- Allow a finding (and its remediation) to reference the audit control it came from.
ALTER TABLE tenant_demo.findings
    ADD COLUMN IF NOT EXISTS audit_id         VARCHAR(36) REFERENCES tenant_demo.audits(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS audit_control_id VARCHAR(36) REFERENCES tenant_demo.audit_controls(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_findings_audit ON tenant_demo.findings(audit_id);
