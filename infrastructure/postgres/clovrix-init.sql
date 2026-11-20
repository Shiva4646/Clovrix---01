-- ══════════════════════════════════════════════════════════════════════════════
-- Clovrix v2.0 — Master Init Script  (single idempotent file)
-- Replaces: 01 through 14 individual migration files
-- Standards covered: ISO 42001 · EU AI Act · SOC 2 Type II · GDPR · NIST AI RMF
--
-- Usage (fresh install):
--   Get-Content .\infrastructure\postgres\clovrix-init.sql |
--     docker compose exec -T postgres psql -U clovrix -d clovrix
--
-- Safe to re-run — all DDL uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: PUBLIC SCHEMA — Platform-level (cross-tenant)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS keycloak;

CREATE TABLE IF NOT EXISTS public.tenants (
    id         VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    name       VARCHAR(200) NOT NULL,
    slug       VARCHAR(100) NOT NULL UNIQUE,
    plan       VARCHAR(30)  NOT NULL DEFAULT 'standard',
    region     VARCHAR(30)  NOT NULL DEFAULT 'us-east-1',
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    settings   JSONB        NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT tenant_slug_valid CHECK (slug ~ '^[a-z0-9_]{2,50}$')
);

CREATE TABLE IF NOT EXISTS public.tenant_config (
    tenant_id       VARCHAR(36)  NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    auth_method     VARCHAR(30)  NOT NULL DEFAULT 'password',
    auth_config     JSONB        NOT NULL DEFAULT '{}',
    tenant_name     VARCHAR(200),
    tenant_logo_url TEXT,
    primary_color   VARCHAR(7)   NOT NULL DEFAULT '#7c6af7',
    max_users       SMALLINT     NOT NULL DEFAULT 50,
    max_ai_systems  SMALLINT     NOT NULL DEFAULT 100,
    features        JSONB        NOT NULL DEFAULT '{"ai_assistant":true}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    PRIMARY KEY (tenant_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: DEMO TENANT SCHEMA
-- ══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS tenant_demo;

-- ── 1. FRAMEWORKS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.frameworks (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    code         VARCHAR(30)  NOT NULL UNIQUE,
    name         VARCHAR(200) NOT NULL,
    short_name   VARCHAR(60)  NOT NULL,
    version      VARCHAR(20),
    description  TEXT,
    category     VARCHAR(50)  NOT NULL DEFAULT 'security',
    color        VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
    icon         VARCHAR(10)  NOT NULL DEFAULT '◈',
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    domain_count SMALLINT     NOT NULL DEFAULT 0,
    sort_order   SMALLINT     NOT NULL DEFAULT 99,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ
);

-- ── 2. FRAMEWORK WORKFLOW STEP TEMPLATES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.framework_workflow_steps (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    framework_code VARCHAR(30)  NOT NULL REFERENCES tenant_demo.frameworks(code) ON DELETE CASCADE,
    step_order     SMALLINT     NOT NULL,
    name           VARCHAR(200) NOT NULL,
    description    TEXT,
    step_type      VARCHAR(20)  NOT NULL DEFAULT 'standard',
    allow_file_upload BOOLEAN   NOT NULL DEFAULT FALSE,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ── 3. CONTROL DOMAINS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.control_domains (
    id             VARCHAR(20)  PRIMARY KEY,
    standard       VARCHAR(30)  NOT NULL REFERENCES tenant_demo.frameworks(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    area           VARCHAR(300) NOT NULL,
    ref_code       VARCHAR(30),
    description    TEXT,
    score          SMALLINT     NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
    status         VARCHAR(30)  NOT NULL DEFAULT 'not-started',
    risk_level     VARCHAR(20)  NOT NULL DEFAULT 'high',
    controls_count SMALLINT     NOT NULL DEFAULT 0,
    findings_count SMALLINT     NOT NULL DEFAULT 0,
    last_tested_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ
);

-- ── 4. CONTROLS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.controls (
    id                VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    domain_id         VARCHAR(20)  NOT NULL REFERENCES tenant_demo.control_domains(id),
    ai_system_id      VARCHAR(36),
    ref               VARCHAR(50)  NOT NULL,
    title             VARCHAR(400) NOT NULL,
    description       TEXT,
    testing_procedure TEXT,
    evidence_required TEXT,
    frequency         VARCHAR(20)  NOT NULL DEFAULT 'annual',
    status            VARCHAR(30)  NOT NULL DEFAULT 'not-tested',
    automated         BOOLEAN      NOT NULL DEFAULT FALSE,
    is_mandatory      BOOLEAN      NOT NULL DEFAULT FALSE,
    last_tested_at    TIMESTAMPTZ,
    last_result       VARCHAR(20),
    owner_email       VARCHAR(200),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ
);

-- ── 5. CONTROL DOMAIN MAP (cross-framework control sharing) ───────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.control_domain_map (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    control_id   VARCHAR(36)  NOT NULL REFERENCES tenant_demo.controls(id) ON DELETE CASCADE,
    domain_id    VARCHAR(20)  NOT NULL REFERENCES tenant_demo.control_domains(id) ON DELETE CASCADE,
    is_mandatory BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(control_id, domain_id)
);

-- ── 6. EVIDENCE ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.evidence (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    control_id     VARCHAR(36)  REFERENCES tenant_demo.controls(id),
    domain_id      VARCHAR(20)  REFERENCES tenant_demo.control_domains(id),
    workflow_id    VARCHAR(36),
    step_id        VARCHAR(36),
    filename       VARCHAR(500) NOT NULL,
    original_name  VARCHAR(500) NOT NULL,
    file_size      BIGINT,
    mime_type      VARCHAR(200),
    storage_bucket VARCHAR(200) NOT NULL,
    storage_key    TEXT         NOT NULL,
    ocr_text       TEXT,
    ocr_status     VARCHAR(20)  NOT NULL DEFAULT 'pending',
    description    TEXT,
    tags           JSONB        NOT NULL DEFAULT '[]',
    collected_by   VARCHAR(200),
    source         VARCHAR(50)  NOT NULL DEFAULT 'manual',
    expires_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 7. WORKFLOWS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.workflows (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    name           VARCHAR(300) NOT NULL,
    standard       VARCHAR(30)  NOT NULL REFERENCES tenant_demo.frameworks(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    ai_system_id   VARCHAR(36),
    type           VARCHAR(30)  NOT NULL DEFAULT 'full-audit',
    status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
    progress       SMALLINT     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    agent_name     VARCHAR(100),
    description    TEXT,
    scheduled_at   TIMESTAMPTZ,
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    next_run_at    TIMESTAMPTZ,
    recurrence     VARCHAR(20),
    evidence_count INT          NOT NULL DEFAULT 0,
    findings_count INT          NOT NULL DEFAULT 0,
    created_by     VARCHAR(200),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.workflow_steps (
    id                VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    workflow_id       VARCHAR(36)  NOT NULL REFERENCES tenant_demo.workflows(id) ON DELETE CASCADE,
    name              VARCHAR(200) NOT NULL,
    description       TEXT,
    step_order        SMALLINT     NOT NULL,
    step_type         VARCHAR(20)  NOT NULL DEFAULT 'standard',
    status            VARCHAR(30)  NOT NULL DEFAULT 'pending',
    allow_file_upload BOOLEAN      NOT NULL DEFAULT FALSE,
    evidence_count    INT          NOT NULL DEFAULT 0,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    output            TEXT,
    notes             TEXT,
    updated_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 8. FINDINGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.findings (
    id                       VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    domain_id                VARCHAR(20)  REFERENCES tenant_demo.control_domains(id),
    control_id               VARCHAR(36)  REFERENCES tenant_demo.controls(id),
    workflow_id              VARCHAR(36)  REFERENCES tenant_demo.workflows(id),
    ai_system_id             VARCHAR(36),
    step_id                  VARCHAR(36),
    standard                 VARCHAR(30)  NOT NULL REFERENCES tenant_demo.frameworks(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    control_ref              VARCHAR(50),
    title                    VARCHAR(500) NOT NULL,
    description              TEXT,
    severity                 VARCHAR(20)  NOT NULL DEFAULT 'medium',
    status                   VARCHAR(30)  NOT NULL DEFAULT 'open',
    source                   VARCHAR(30)  NOT NULL DEFAULT 'manual',
    ai_generated             BOOLEAN      NOT NULL DEFAULT FALSE,
    assigned_to              VARCHAR(200),
    due_date                 DATE,
    resolved_at              TIMESTAMPTZ,
    closed_at                TIMESTAMPTZ,
    exception_status         VARCHAR(30),
    exception_reason         TEXT,
    exception_files          JSONB        NOT NULL DEFAULT '[]',
    exception_requested_by   VARCHAR(200),
    exception_reviewed_by    VARCHAR(200),
    exception_reviewed_at    TIMESTAMPTZ,
    exception_approver_id    VARCHAR(36),
    exception_approver_email VARCHAR(200),
    mitigation_plan          TEXT,
    mitigation_due           DATE,
    created_by               VARCHAR(200),
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ
);

-- ── 9. FINDING ASSIGNEES (multi-user) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.finding_assignees (
    id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    finding_id  VARCHAR(36)  NOT NULL REFERENCES tenant_demo.findings(id) ON DELETE CASCADE,
    user_id     VARCHAR(36)  NOT NULL,
    assigned_by VARCHAR(200),
    assigned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(finding_id, user_id)
);

-- ── 10. FINDING FILES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.finding_files (
    id            VARCHAR(36)   PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    finding_id    VARCHAR(36)   NOT NULL REFERENCES tenant_demo.findings(id) ON DELETE CASCADE,
    filename      VARCHAR(500)  NOT NULL,
    original_name VARCHAR(500),
    file_size     BIGINT,
    mime_type     VARCHAR(100),
    storage_key   VARCHAR(1000),
    uploaded_by   VARCHAR(200),
    purpose       VARCHAR(50)   NOT NULL DEFAULT 'evidence',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 11. REMEDIATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.remediations (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    finding_id       VARCHAR(36)  REFERENCES tenant_demo.findings(id),
    title            VARCHAR(500) NOT NULL,
    description      TEXT,
    priority         VARCHAR(20)  NOT NULL DEFAULT 'medium',
    status           VARCHAR(30)  NOT NULL DEFAULT 'open',
    progress         SMALLINT     NOT NULL DEFAULT 0,
    assigned_to      VARCHAR(200),
    assigned_by      VARCHAR(200),
    due_date         DATE,
    sla_days         SMALLINT     NOT NULL DEFAULT 30,
    sla_breached     BOOLEAN      NOT NULL DEFAULT FALSE,
    resolution_notes TEXT,
    notes            TEXT,
    verified_by      VARCHAR(200),
    resolved_at      TIMESTAMPTZ,
    verified_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
);

-- ── 12. RISK REGISTER ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.risks (
    id                  VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    category            VARCHAR(50)  NOT NULL DEFAULT 'operational',
    ai_risk_category    VARCHAR(30),
    ai_system_id        VARCHAR(36),
    likelihood          SMALLINT     NOT NULL DEFAULT 3 CHECK (likelihood BETWEEN 1 AND 5),
    impact              SMALLINT     NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
    inherent_score      SMALLINT     GENERATED ALWAYS AS (likelihood * impact) STORED,
    residual_likelihood SMALLINT     DEFAULT 2 CHECK (residual_likelihood BETWEEN 1 AND 5),
    residual_impact     SMALLINT     DEFAULT 2 CHECK (residual_impact BETWEEN 1 AND 5),
    residual_score      SMALLINT     GENERATED ALWAYS AS (COALESCE(residual_likelihood,3) * COALESCE(residual_impact,3)) STORED,
    treatment           VARCHAR(20)  NOT NULL DEFAULT 'mitigate',
    treatment_plan      TEXT,
    status              VARCHAR(30)  NOT NULL DEFAULT 'open',
    domain_id           VARCHAR(20),
    owner_email         VARCHAR(200),
    due_date            DATE,
    review_date         DATE,
    mitigations         JSONB        NOT NULL DEFAULT '[]',
    created_by          VARCHAR(200),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ
);

-- ── 13. PERSONNEL ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.personnel (
    id                      VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    email                   VARCHAR(200) NOT NULL UNIQUE,
    full_name               VARCHAR(200) NOT NULL,
    department              VARCHAR(100),
    title                   VARCHAR(200),
    role                    VARCHAR(30)  NOT NULL DEFAULT 'employee',
    employment_status       VARCHAR(30)  NOT NULL DEFAULT 'active',
    start_date              DATE,
    end_date                DATE,
    manager_email           VARCHAR(200),
    background_check_status VARCHAR(30)  NOT NULL DEFAULT 'pending',
    background_check_date   DATE,
    mfa_enabled             BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at           TIMESTAMPTZ,
    access_review_due       DATE,
    idp_user_id             VARCHAR(200),
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.training (
    id            VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    personnel_id  VARCHAR(36)  NOT NULL REFERENCES tenant_demo.personnel(id) ON DELETE CASCADE,
    course_name   VARCHAR(300) NOT NULL,
    course_type   VARCHAR(50)  NOT NULL DEFAULT 'security',
    status        VARCHAR(30)  NOT NULL DEFAULT 'assigned',
    assigned_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    score         SMALLINT,
    certificate_url TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.access_reviews (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    personnel_id   VARCHAR(36)  NOT NULL REFERENCES tenant_demo.personnel(id),
    reviewer_email VARCHAR(200),
    system_name    VARCHAR(200) NOT NULL,
    access_level   VARCHAR(100),
    status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
    review_type    VARCHAR(30)  NOT NULL DEFAULT 'periodic',
    due_date       DATE,
    completed_at   TIMESTAMPTZ,
    notes          TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 14. VENDORS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.vendors (
    id                   VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    name                 VARCHAR(300) NOT NULL,
    website              VARCHAR(500),
    category             VARCHAR(50)  NOT NULL DEFAULT 'SaaS',
    criticality          VARCHAR(20)  NOT NULL DEFAULT 'medium',
    risk_score           SMALLINT     NOT NULL DEFAULT 50 CHECK (risk_score BETWEEN 0 AND 100),
    risk_tier            VARCHAR(10)  NOT NULL DEFAULT 'tier-2',
    status               VARCHAR(30)  NOT NULL DEFAULT 'active',
    data_types           JSONB        NOT NULL DEFAULT '[]',
    dpa_signed           BOOLEAN      NOT NULL DEFAULT FALSE,
    dpa_expiry           DATE,
    soc2_type            VARCHAR(5),
    soc2_expiry          DATE,
    iso27001_certified   BOOLEAN      NOT NULL DEFAULT FALSE,
    last_assessment_date DATE,
    next_assessment_due  DATE,
    owner_email          VARCHAR(200),
    contact_email        VARCHAR(200),
    notes                TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.vendor_assessments (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    vendor_id      VARCHAR(36)  NOT NULL REFERENCES tenant_demo.vendors(id) ON DELETE CASCADE,
    type           VARCHAR(30)  NOT NULL DEFAULT 'annual',
    status         VARCHAR(30)  NOT NULL DEFAULT 'draft',
    risk_score     SMALLINT,
    assessor_email VARCHAR(200),
    questions      JSONB        NOT NULL DEFAULT '[]',
    responses      JSONB        NOT NULL DEFAULT '{}',
    findings       JSONB        NOT NULL DEFAULT '[]',
    sent_at        TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 15. POLICIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.policies (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    title            VARCHAR(300) NOT NULL,
    category         VARCHAR(50)  NOT NULL DEFAULT 'security',
    version          VARCHAR(10)  NOT NULL DEFAULT '1.0',
    status           VARCHAR(30)  NOT NULL DEFAULT 'draft',
    content          TEXT,
    content_hash     VARCHAR(64),
    owner_email      VARCHAR(200),
    approved_by      VARCHAR(200),
    approved_at      TIMESTAMPTZ,
    effective_date   DATE,
    review_date      DATE,
    frameworks       JSONB        NOT NULL DEFAULT '[]',
    requires_signoff BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.policy_versions (
    id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    policy_id   VARCHAR(36)  NOT NULL REFERENCES tenant_demo.policies(id) ON DELETE CASCADE,
    version     VARCHAR(10)  NOT NULL,
    content     TEXT,
    changed_by  VARCHAR(200),
    change_note TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.policy_signoffs (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    policy_id      VARCHAR(36)  NOT NULL REFERENCES tenant_demo.policies(id) ON DELETE CASCADE,
    personnel_id   VARCHAR(36)  NOT NULL REFERENCES tenant_demo.personnel(id),
    version        VARCHAR(10),
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
    signed_at      TIMESTAMPTZ,
    signature_hash VARCHAR(64),
    ip_address     VARCHAR(50),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(policy_id, personnel_id)
);

-- ── 16. INTEGRATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.integrations (
    id              VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    provider        VARCHAR(50)  NOT NULL UNIQUE,
    display_name    VARCHAR(200) NOT NULL,
    category        VARCHAR(50)  NOT NULL,
    status          VARCHAR(30)  NOT NULL DEFAULT 'not_connected',
    auth_type       VARCHAR(20)  NOT NULL DEFAULT 'oauth2',
    config          JSONB        NOT NULL DEFAULT '{}',
    scopes          JSONB        NOT NULL DEFAULT '[]',
    last_sync_at    TIMESTAMPTZ,
    next_sync_at    TIMESTAMPTZ,
    sync_stats      JSONB        NOT NULL DEFAULT '{}',
    error_msg       TEXT,
    controls_linked SMALLINT     NOT NULL DEFAULT 0,
    evidence_count  INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.integration_credentials (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    integration_id VARCHAR(36)  NOT NULL REFERENCES tenant_demo.integrations(id) ON DELETE CASCADE UNIQUE,
    access_token   TEXT,
    refresh_token  TEXT,
    token_type     VARCHAR(50),
    expires_at     TIMESTAMPTZ,
    raw_config     JSONB        NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.integration_checks (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    integration_id VARCHAR(36)  NOT NULL REFERENCES tenant_demo.integrations(id) ON DELETE CASCADE,
    control_id     VARCHAR(36),
    name           VARCHAR(300) NOT NULL,
    description    TEXT,
    check_type     VARCHAR(50)  NOT NULL DEFAULT 'api',
    status         VARCHAR(20)  NOT NULL DEFAULT 'unknown',
    last_run_at    TIMESTAMPTZ,
    last_passed_at TIMESTAMPTZ,
    failure_count  SMALLINT     NOT NULL DEFAULT 0,
    details        JSONB        NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.ccm_rules (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    integration_id VARCHAR(36)  REFERENCES tenant_demo.integrations(id),
    control_id     VARCHAR(36),
    name           VARCHAR(300) NOT NULL,
    description    TEXT,
    frequency      VARCHAR(20)  NOT NULL DEFAULT 'daily',
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_run_at    TIMESTAMPTZ,
    last_result    VARCHAR(20),
    failure_streak SMALLINT     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 17. SECURITY TESTING ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.security_scans (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    type           VARCHAR(30)  NOT NULL,
    target         VARCHAR(500) NOT NULL,
    scanner        VARCHAR(100),
    status         VARCHAR(20)  NOT NULL DEFAULT 'queued',
    critical_count SMALLINT     NOT NULL DEFAULT 0,
    high_count     SMALLINT     NOT NULL DEFAULT 0,
    medium_count   SMALLINT     NOT NULL DEFAULT 0,
    low_count      SMALLINT     NOT NULL DEFAULT 0,
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    report_url     TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.vulnerabilities (
    id                VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    scan_id           VARCHAR(36)  REFERENCES tenant_demo.security_scans(id),
    cve_id            VARCHAR(50),
    title             VARCHAR(500) NOT NULL,
    description       TEXT,
    severity          VARCHAR(20)  NOT NULL DEFAULT 'medium',
    cvss_score        DECIMAL(3,1),
    component         VARCHAR(300),
    component_version VARCHAR(50),
    fixed_version     VARCHAR(50),
    status            VARCHAR(30)  NOT NULL DEFAULT 'open',
    assigned_to       VARCHAR(200),
    due_date          DATE,
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.pentests (
    id                VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    title             VARCHAR(300) NOT NULL,
    vendor            VARCHAR(200),
    scope             TEXT,
    status            VARCHAR(30)  NOT NULL DEFAULT 'planned',
    start_date        DATE,
    end_date          DATE,
    report_url        TEXT,
    critical_count    SMALLINT     NOT NULL DEFAULT 0,
    high_count        SMALLINT     NOT NULL DEFAULT 0,
    remediated_count  SMALLINT     NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 18. QUESTIONNAIRES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.questionnaires (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    title            VARCHAR(300) NOT NULL,
    requester        VARCHAR(200),
    requester_org    VARCHAR(200),
    type             VARCHAR(30)  NOT NULL DEFAULT 'security',
    status           VARCHAR(30)  NOT NULL DEFAULT 'received',
    total_questions  SMALLINT     NOT NULL DEFAULT 0,
    answered_count   SMALLINT     NOT NULL DEFAULT 0,
    ai_confidence    SMALLINT     NOT NULL DEFAULT 0,
    due_date         DATE,
    submitted_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.questionnaire_answers (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    questionnaire_id VARCHAR(36)  NOT NULL REFERENCES tenant_demo.questionnaires(id) ON DELETE CASCADE,
    question         TEXT         NOT NULL,
    ai_answer        TEXT,
    final_answer     TEXT,
    confidence       SMALLINT     NOT NULL DEFAULT 0,
    source_policy_id VARCHAR(36),
    status           VARCHAR(20)  NOT NULL DEFAULT 'ai_draft',
    reviewed_by      VARCHAR(200),
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 19. TRUST CENTER ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.trust_center (
    id              VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    is_public       BOOLEAN      NOT NULL DEFAULT FALSE,
    title           VARCHAR(200) NOT NULL DEFAULT 'Security & Compliance',
    tagline         TEXT,
    logo_url        TEXT,
    accent_color    VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
    show_score      BOOLEAN      NOT NULL DEFAULT TRUE,
    show_frameworks BOOLEAN      NOT NULL DEFAULT TRUE,
    certifications  JSONB        NOT NULL DEFAULT '[]',
    uptime_target   DECIMAL(5,2) NOT NULL DEFAULT 99.9,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

-- ── 20. NOTIFICATIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.notifications (
    id         VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    recipient  VARCHAR(200) NOT NULL,
    type       VARCHAR(50)  NOT NULL,
    subject    VARCHAR(300) NOT NULL,
    body       TEXT,
    status     VARCHAR(20)  NOT NULL DEFAULT 'pending',
    sent_at    TIMESTAMPTZ,
    error_msg  TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 21. AUDIT LOG (immutable) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.audit_log (
    id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    user_id     VARCHAR(200),
    user_email  VARCHAR(200),
    action      VARCHAR(200) NOT NULL,
    resource    VARCHAR(200),
    resource_id VARCHAR(36),
    details     JSONB        NOT NULL DEFAULT '{}',
    ip_address  VARCHAR(50),
    user_agent  TEXT,
    hmac        VARCHAR(64),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.statement_of_applicability (
    id             VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    framework_code VARCHAR(30) NOT NULL UNIQUE REFERENCES tenant_demo.frameworks(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    status         VARCHAR(30) NOT NULL DEFAULT 'draft',
    approver       VARCHAR(200),
    approved_at    TIMESTAMPTZ,
    rejected_at    TIMESTAMPTZ,
    comments       TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.auditor_history (
    id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    entity_type VARCHAR(40) NOT NULL,
    entity_id   VARCHAR(60) NOT NULL,
    action      VARCHAR(80) NOT NULL,
    actor_email VARCHAR(200),
    comments    TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_demo.controls ADD COLUMN IF NOT EXISTS soa_applicability VARCHAR(30) NOT NULL DEFAULT 'applicable';
ALTER TABLE tenant_demo.controls ADD COLUMN IF NOT EXISTS soa_justification TEXT;
ALTER TABLE tenant_demo.controls ADD COLUMN IF NOT EXISTS soa_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenant_demo.evidence ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE tenant_demo.evidence ADD COLUMN IF NOT EXISTS verification_comments TEXT;
ALTER TABLE tenant_demo.evidence ADD COLUMN IF NOT EXISTS verified_by VARCHAR(200);
ALTER TABLE tenant_demo.evidence ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE tenant_demo.findings ADD COLUMN IF NOT EXISTS validation_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE tenant_demo.findings ADD COLUMN IF NOT EXISTS validation_comments TEXT;
ALTER TABLE tenant_demo.findings ADD COLUMN IF NOT EXISTS validated_by VARCHAR(200);
ALTER TABLE tenant_demo.findings ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE tenant_demo.remediations ADD COLUMN IF NOT EXISTS closure_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE tenant_demo.remediations ADD COLUMN IF NOT EXISTS closure_notes TEXT;
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS minimum_approvals SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS assigned_approvers JSONB NOT NULL DEFAULT '[]';
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]';
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS file_size INT;
ALTER TABLE tenant_demo.policies ADD COLUMN IF NOT EXISTS file_type VARCHAR(50);

-- ── 22. AI SYSTEMS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.ai_systems (
    id                 VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    system_id          VARCHAR(20)  NOT NULL UNIQUE,
    name               VARCHAR(300) NOT NULL,
    description        TEXT,
    model_type         VARCHAR(50)  NOT NULL DEFAULT 'classification',
    business_unit      VARCHAR(200),
    business_owner     VARCHAR(200),
    technical_owner    VARCHAR(200),
    lifecycle_stage    VARCHAR(30)  NOT NULL DEFAULT 'development',
    risk_class         VARCHAR(20)  NOT NULL DEFAULT 'medium',
    status             VARCHAR(30)  NOT NULL DEFAULT 'draft',
    primary_framework  VARCHAR(30),
    frameworks         JSONB        NOT NULL DEFAULT '[]',
    deployment_envs    JSONB        NOT NULL DEFAULT '[]',
    data_sources       JSONB        NOT NULL DEFAULT '[]',
    vendor_id          VARCHAR(36),
    version            VARCHAR(50),
    training_data_desc TEXT,
    model_card_url     TEXT,
    use_cases          TEXT,
    known_limitations  TEXT,
    compliance_score   SMALLINT     NOT NULL DEFAULT 0,
    last_assessed_at   TIMESTAMPTZ,
    next_review_date   DATE,
    registered_by      VARCHAR(200),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.ai_system_versions (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    system_id      VARCHAR(36)  NOT NULL REFERENCES tenant_demo.ai_systems(id) ON DELETE CASCADE,
    version        VARCHAR(50)  NOT NULL,
    environment    VARCHAR(30)  NOT NULL DEFAULT 'production',
    deployed_at    TIMESTAMPTZ,
    deployed_by    VARCHAR(200),
    change_summary TEXT,
    approval_id    VARCHAR(36),
    status         VARCHAR(30)  NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 23. GOVERNANCE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.governance_objectives (
    id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    title       VARCHAR(300) NOT NULL,
    pillar      VARCHAR(50)  NOT NULL DEFAULT 'fairness',
    description TEXT,
    owner_email VARCHAR(200),
    status      VARCHAR(30)  NOT NULL DEFAULT 'on-track',
    progress    SMALLINT     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    target_date DATE,
    quarter     VARCHAR(10),
    metrics     JSONB        NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.governance_accountability (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    system_id        VARCHAR(36)  REFERENCES tenant_demo.ai_systems(id) ON DELETE CASCADE,
    role_title       VARCHAR(200) NOT NULL,
    person_email     VARCHAR(200),
    person_name      VARCHAR(200),
    responsibilities TEXT,
    raci_type        VARCHAR(10)  NOT NULL DEFAULT 'responsible',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.governance_approvals (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    request_id       VARCHAR(20)  NOT NULL UNIQUE,
    system_id        VARCHAR(36)  REFERENCES tenant_demo.ai_systems(id),
    type             VARCHAR(50)  NOT NULL DEFAULT 'deployment',
    title            VARCHAR(400) NOT NULL,
    description      TEXT,
    risk_level       VARCHAR(20)  NOT NULL DEFAULT 'medium',
    requestor_email  VARCHAR(200),
    status           VARCHAR(30)  NOT NULL DEFAULT 'pending',
    reviewer_email   VARCHAR(200),
    decision_notes   TEXT,
    decided_at       TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ,
    workflow_id      VARCHAR(36),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
);

-- ── 24. DATA GOVERNANCE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.data_assets (
    id                 VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    name               VARCHAR(300) NOT NULL,
    description        TEXT,
    classification     VARCHAR(30)  NOT NULL DEFAULT 'internal',
    contains_pii       BOOLEAN      NOT NULL DEFAULT FALSE,
    encryption_status  VARCHAR(30)  NOT NULL DEFAULT 'pending',
    encryption_standard VARCHAR(30),
    quality_score      SMALLINT     NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
    freshness_days     SMALLINT,
    completeness_pct   SMALLINT     NOT NULL DEFAULT 0,
    schema_drift       BOOLEAN      NOT NULL DEFAULT FALSE,
    retention_days     INT,
    location           VARCHAR(500),
    format             VARCHAR(50),
    size_gb            DECIMAL(10,2),
    row_count          BIGINT,
    status             VARCHAR(30)  NOT NULL DEFAULT 'active',
    owner_email        VARCHAR(200),
    steward_email      VARCHAR(200),
    last_reviewed_at   TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.data_asset_lineage (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    asset_id     VARCHAR(36)  NOT NULL REFERENCES tenant_demo.data_assets(id) ON DELETE CASCADE,
    system_id    VARCHAR(36)  REFERENCES tenant_demo.ai_systems(id),
    relationship VARCHAR(30)  NOT NULL DEFAULT 'training',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 25. OPERATIONAL CONTROLS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.operational_controls (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    system_id      VARCHAR(36)  NOT NULL REFERENCES tenant_demo.ai_systems(id) ON DELETE CASCADE,
    name           VARCHAR(300) NOT NULL,
    control_type   VARCHAR(50)  NOT NULL DEFAULT 'guardrail',
    description    TEXT,
    threshold      VARCHAR(200),
    current_value  VARCHAR(200),
    status         VARCHAR(30)  NOT NULL DEFAULT 'active',
    last_triggered TIMESTAMPTZ,
    alert_email    VARCHAR(200),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.operational_events (
    id            VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    system_id     VARCHAR(36)  NOT NULL REFERENCES tenant_demo.ai_systems(id),
    control_id    VARCHAR(36)  REFERENCES tenant_demo.operational_controls(id),
    event_type    VARCHAR(50)  NOT NULL DEFAULT 'drift',
    severity      VARCHAR(20)  NOT NULL DEFAULT 'medium',
    title         VARCHAR(400) NOT NULL,
    details       JSONB        NOT NULL DEFAULT '{}',
    actor_email   VARCHAR(200),
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 26. PLATFORM USERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.platform_users (
    id                  VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    email               VARCHAR(200) NOT NULL UNIQUE,
    full_name           VARCHAR(200) NOT NULL,
    role                VARCHAR(30)  NOT NULL DEFAULT 'viewer',
    department          VARCHAR(100),
    title               VARCHAR(200),
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',
    mfa_enabled         BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    invited_by          VARCHAR(200),
    invitation_token    VARCHAR(64),
    invitation_sent_at  TIMESTAMPTZ,
    keycloak_id         VARCHAR(200),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ
);

-- ── 27. AI ASSISTANT ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_demo.ai_chat_sessions (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    user_email     VARCHAR(200) NOT NULL,
    context_module VARCHAR(50),
    context_id     VARCHAR(36),
    messages       JSONB        NOT NULL DEFAULT '[]',
    actions_taken  JSONB        NOT NULL DEFAULT '[]',
    status         VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_demo.user_ai_prefs (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email      TEXT         NOT NULL UNIQUE,
    ai_auto_execute BOOLEAN      NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_demo.ai_action_logs (
    id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id  TEXT,
    user_email  TEXT         NOT NULL,
    action_type TEXT         NOT NULL,
    parameters  JSONB        NOT NULL DEFAULT '{}',
    result      JSONB,
    exec_mode   TEXT         NOT NULL DEFAULT 'confirmed',
    status      TEXT         NOT NULL DEFAULT 'success',
    error_msg   TEXT,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: DROP DEPRECATED TABLES (removed modules)
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS tenant_demo.itsm_releases     CASCADE;
DROP TABLE IF EXISTS tenant_demo.itsm_problems     CASCADE;
DROP TABLE IF EXISTS tenant_demo.itsm_changes      CASCADE;
DROP TABLE IF EXISTS tenant_demo.itsm_incidents    CASCADE;
DROP TABLE IF EXISTS tenant_demo.monitoring_results CASCADE;
DROP TABLE IF EXISTS tenant_demo.monitoring_checks  CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: FOREIGN KEY CONSTRAINTS (deferred — tables now exist)
-- ══════════════════════════════════════════════════════════════════════════════

-- controls → ai_systems FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_controls_ai_system' AND table_schema='tenant_demo') THEN
        ALTER TABLE tenant_demo.controls ADD CONSTRAINT fk_controls_ai_system FOREIGN KEY (ai_system_id) REFERENCES tenant_demo.ai_systems(id);
    END IF;
END $$;

-- workflows → ai_systems FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_workflows_ai_system' AND table_schema='tenant_demo') THEN
        ALTER TABLE tenant_demo.workflows ADD CONSTRAINT fk_workflows_ai_system FOREIGN KEY (ai_system_id) REFERENCES tenant_demo.ai_systems(id);
    END IF;
END $$;

-- findings → ai_systems FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_findings_ai_system' AND table_schema='tenant_demo') THEN
        ALTER TABLE tenant_demo.findings ADD CONSTRAINT fk_findings_ai_system FOREIGN KEY (ai_system_id) REFERENCES tenant_demo.ai_systems(id);
    END IF;
END $$;

-- risks → ai_systems FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_risks_ai_system' AND table_schema='tenant_demo') THEN
        ALTER TABLE tenant_demo.risks ADD CONSTRAINT fk_risks_ai_system FOREIGN KEY (ai_system_id) REFERENCES tenant_demo.ai_systems(id);
    END IF;
END $$;

-- evidence → workflows FK
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='fk_evidence_workflow' AND table_schema='tenant_demo') THEN
        ALTER TABLE tenant_demo.evidence ADD CONSTRAINT fk_evidence_workflow FOREIGN KEY (workflow_id) REFERENCES tenant_demo.workflows(id);
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

-- Controls
CREATE INDEX IF NOT EXISTS idx_controls_domain       ON tenant_demo.controls(domain_id);
CREATE INDEX IF NOT EXISTS idx_controls_status       ON tenant_demo.controls(status);
CREATE INDEX IF NOT EXISTS idx_cdm_control           ON tenant_demo.control_domain_map(control_id);
CREATE INDEX IF NOT EXISTS idx_cdm_domain            ON tenant_demo.control_domain_map(domain_id);

-- Evidence
CREATE INDEX IF NOT EXISTS idx_evidence_domain       ON tenant_demo.evidence(domain_id);
CREATE INDEX IF NOT EXISTS idx_evidence_workflow     ON tenant_demo.evidence(workflow_id);
CREATE INDEX IF NOT EXISTS idx_evidence_control      ON tenant_demo.evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_evidence_step_id      ON tenant_demo.evidence(step_id);
CREATE INDEX IF NOT EXISTS idx_evidence_workflow_step ON tenant_demo.evidence(workflow_id, step_id);

-- Workflows
CREATE INDEX IF NOT EXISTS idx_workflows_status      ON tenant_demo.workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_standard    ON tenant_demo.workflows(standard);
CREATE INDEX IF NOT EXISTS idx_workflows_ai_system   ON tenant_demo.workflows(ai_system_id);

-- Frameworks
CREATE INDEX IF NOT EXISTS idx_frameworks_active     ON tenant_demo.frameworks(is_active);
CREATE INDEX IF NOT EXISTS idx_fw_steps_code         ON tenant_demo.framework_workflow_steps(framework_code, step_order);

-- Findings
CREATE INDEX IF NOT EXISTS idx_findings_domain       ON tenant_demo.findings(domain_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity     ON tenant_demo.findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_status       ON tenant_demo.findings(status);
CREATE INDEX IF NOT EXISTS idx_findings_standard     ON tenant_demo.findings(standard);
CREATE INDEX IF NOT EXISTS idx_findings_ai_system    ON tenant_demo.findings(ai_system_id);
CREATE INDEX IF NOT EXISTS idx_findings_step         ON tenant_demo.findings(step_id);
CREATE INDEX IF NOT EXISTS idx_findings_assigned     ON tenant_demo.findings(assigned_to);
CREATE INDEX IF NOT EXISTS idx_findings_exception    ON tenant_demo.findings(exception_status);
CREATE INDEX IF NOT EXISTS idx_findings_workflow_step ON tenant_demo.findings(workflow_id, step_id);
CREATE INDEX IF NOT EXISTS idx_findings_exception_approver ON tenant_demo.findings(exception_approver_id) WHERE exception_approver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finding_assignees_finding ON tenant_demo.finding_assignees(finding_id);
CREATE INDEX IF NOT EXISTS idx_finding_assignees_user    ON tenant_demo.finding_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_finding_files_finding     ON tenant_demo.finding_files(finding_id);

-- Remediations
CREATE INDEX IF NOT EXISTS idx_remediations_status   ON tenant_demo.remediations(status);
CREATE INDEX IF NOT EXISTS idx_remediations_due      ON tenant_demo.remediations(due_date);

-- Risks
CREATE INDEX IF NOT EXISTS idx_risks_score           ON tenant_demo.risks(inherent_score DESC);
CREATE INDEX IF NOT EXISTS idx_risks_status          ON tenant_demo.risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_ai_system       ON tenant_demo.risks(ai_system_id);

-- Personnel
CREATE INDEX IF NOT EXISTS idx_personnel_email       ON tenant_demo.personnel(email);
CREATE INDEX IF NOT EXISTS idx_personnel_status      ON tenant_demo.personnel(employment_status);
CREATE INDEX IF NOT EXISTS idx_training_person       ON tenant_demo.training(personnel_id);
CREATE INDEX IF NOT EXISTS idx_training_status       ON tenant_demo.training(status);
CREATE INDEX IF NOT EXISTS idx_access_reviews_pers   ON tenant_demo.access_reviews(personnel_id);

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendors_risk          ON tenant_demo.vendors(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_vendors_status        ON tenant_demo.vendors(status);

-- Security
CREATE INDEX IF NOT EXISTS idx_vulns_severity        ON tenant_demo.vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_vulns_status          ON tenant_demo.vulnerabilities(status);

-- AI systems
CREATE INDEX IF NOT EXISTS idx_ai_systems_status     ON tenant_demo.ai_systems(status);
CREATE INDEX IF NOT EXISTS idx_ai_systems_risk       ON tenant_demo.ai_systems(risk_class);

-- Governance
CREATE INDEX IF NOT EXISTS idx_gov_approvals_status  ON tenant_demo.governance_approvals(status);

-- AI actions
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user   ON tenant_demo.ai_action_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_created ON tenant_demo.ai_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_type   ON tenant_demo.ai_action_logs(action_type);

-- Platform users
CREATE INDEX IF NOT EXISTS idx_platform_users_search ON tenant_demo.platform_users
    USING gin(to_tsvector('simple', COALESCE(full_name,'') || ' ' || COALESCE(email,'')));

-- Audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_time        ON tenant_demo.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user        ON tenant_demo.audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_status  ON tenant_demo.notifications(status);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: ROW-LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE tenant_demo.audit_log ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: SEED DATA — Tenants
-- ══════════════════════════════════════════════════════════════════════════════

-- Demo tenant (primary)
INSERT INTO public.tenants(id, name, slug, plan, region) VALUES
('tenant-demo-0001', 'Acme AI Corporation',   'demo', 'enterprise', 'us-east-1')
ON CONFLICT DO NOTHING;

-- Acme tenant (secondary — schema provisioned by API via POST /api/tenants)
INSERT INTO public.tenants(id, name, slug, plan, region) VALUES
('tenant-acme-0001', 'Acme Technologies Inc.','acme', 'enterprise', 'us-east-1')
ON CONFLICT DO NOTHING;

-- Tenant config
INSERT INTO public.tenant_config(tenant_id, auth_method, tenant_name, primary_color)
SELECT id, 'password', 'Acme AI Corporation',   '#7c6af7' FROM public.tenants WHERE slug='demo'
ON CONFLICT(tenant_id) DO NOTHING;

INSERT INTO public.tenant_config(tenant_id, auth_method, tenant_name, primary_color)
SELECT id, 'password', 'Acme Technologies Inc.','#3b82f6' FROM public.tenants WHERE slug='acme'
ON CONFLICT(tenant_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 8: SEED DATA — Compliance Framework Catalog
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO tenant_demo.frameworks(id, code, name, short_name, version, description, category, color, icon, is_active, domain_count, sort_order) VALUES
('fw-iso42001', 'ISO42001',
    'ISO 42001 — AI Management System',
    'ISO 42001', '2023',
    'International standard specifying requirements for establishing, implementing, maintaining and continually improving an AI management system.',
    'ai_governance', '#7c6af7', '⬡', true, 0, 1),
('fw-soc2', 'SOC2',
    'SOC 2 Type II — Trust Services Criteria',
    'SOC 2 Type II', '2017',
    'AICPA framework for service organisations covering security, availability, processing integrity, confidentiality and privacy.',
    'security', '#3b82f6', '◈', true, 0, 2),
('fw-gdpr', 'GDPR',
    'GDPR — General Data Protection Regulation',
    'GDPR', '2018',
    'EU regulation on data protection and privacy for individuals within the European Union and EEA.',
    'privacy', '#8b5cf6', '◉', true, 0, 3),
('fw-eu-ai-act', 'EU_AI_ACT',
    'EU AI Act 2024 — High-Risk AI Compliance',
    'EU AI Act', '2024',
    'EU regulation for high-risk artificial intelligence systems, establishing obligations for providers and deployers.',
    'ai_governance', '#f59e0b', '⚖', true, 0, 4),
('fw-nist', 'NIST_AI_RMF',
    'NIST AI Risk Management Framework',
    'NIST AI RMF', '1.0',
    'NIST framework for managing risks associated with AI systems across the full AI lifecycle.',
    'ai_governance', '#10b981', '◬', true, 0, 5),
('fw-iso27001', 'ISO27001',
    'ISO 27001 — Information Security',
    'ISO 27001', '2022',
    'International standard for information security management systems.',
    'security', '#0ea5e9', '◇', true, 0, 6),
('fw-pims', 'PIMS',
    'Privacy Information Management System',
    'PIMS', '2019',
    'ISO 27701 extension for privacy information management.',
    'privacy', '#ec4899', '◎', true, 0, 7)
ON CONFLICT(code) DO NOTHING;

-- ── Default 6-step audit pipeline for every framework ─────────────────────────
INSERT INTO tenant_demo.framework_workflow_steps(id, framework_code, step_order, name, description, step_type, allow_file_upload)
SELECT
    gen_random_uuid()::VARCHAR,
    f.code,
    s.step_order,
    s.name,
    s.description,
    s.step_type,
    s.allow_file_upload
FROM tenant_demo.frameworks f
CROSS JOIN (VALUES
    (1, 'Evidence Collection', 'Gather all required evidence for this framework''s controls',       'evidence_collection', true),
    (2, 'Control Testing',     'Test each control against the collected evidence',                   'control_testing',     false),
    (3, 'Gap Analysis',        'AI-assisted identification of gaps and non-conformities',            'gap_analysis',        false),
    (4, 'Report Generation',   'Generate draft audit report from findings',                          'report_generation',   false),
    (5, 'Review & Sign-off',   'Auditor review and lead sign-off on findings',                       'review_signoff',      false),
    (6, 'Archive & Close',     'Archive evidence, finalise report and close the audit cycle',        'archive_close',       false)
) AS s(step_order, name, description, step_type, allow_file_upload)
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_demo.framework_workflow_steps fws
    WHERE fws.framework_code = f.code AND fws.step_order = s.step_order
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 9: SEED DATA — Platform Users (Demo Tenant)
-- ══════════════════════════════════════════════════════════════════════════════

-- Keycloak credentials (passwords set in clovrix-realm.json):
--   alice@demo.com   / Admin@Clovrix2026!  (super_admin)
--   bob@demo.com     / Auditor@Clovrix2026! (lead_auditor)
--   carol@demo.com   / Auditor@Clovrix2026! (auditor)
--   daniel@demo.com  / Reviewer@Clovrix2026! (auditor)
--   priya@demo.com   / Readonly@Clovrix2026! (reviewer)
--   mei@demo.com     / Readonly@Clovrix2026! (reviewer)

INSERT INTO tenant_demo.platform_users(id, email, full_name, role, department, title, status, mfa_enabled) VALUES
('usr-001', 'alice@demo.com',  'Alice Chen',      'super_admin',  'AI Governance', 'Chief AI Officer',        'active', true),
('usr-002', 'bob@demo.com',    'Bob Smith',        'lead_auditor', 'Security',      'Head of Security',        'active', true),
('usr-003', 'carol@demo.com',  'Carol Martinez',   'auditor',      'Compliance',    'Compliance Manager',      'active', true),
('usr-004', 'daniel@demo.com', 'Daniel Park',      'auditor',      'Engineering',   'Lead ML Engineer',        'active', true),
('usr-005', 'priya@demo.com',  'Priya Mehta',      'reviewer',     'Risk',          'AI Risk Lead',            'active', true),
('usr-006', 'mei@demo.com',    'Mei Lin',          'reviewer',     'Ethics',        'Ethics Council Lead',     'active', false)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 10: SEED DATA — Integrations Catalog (not_connected by default)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO tenant_demo.integrations(id, provider, display_name, category, status, auth_type, controls_linked, evidence_count, config) VALUES
('int-001', 'aws',              'Amazon Web Services',    'cloud',         'not_connected', 'access_key', 0, 0, '{"region":"us-east-1"}'),
('int-002', 'github',           'GitHub Enterprise',      'scm',           'not_connected', 'oauth2',     0, 0, '{"host":"github.com"}'),
('int-003', 'okta',             'Okta',                   'identity',      'not_connected', 'oauth2',     0, 0, '{}'),
('int-004', 'gcp',              'Google Cloud Platform',  'cloud',         'not_connected', 'oauth2',     0, 0, '{}'),
('int-005', 'azure',            'Microsoft Azure',        'cloud',         'not_connected', 'oauth2',     0, 0, '{}'),
('int-006', 'jira',             'Jira Software',          'ticketing',     'not_connected', 'oauth2',     0, 0, '{}'),
('int-007', 'slack',            'Slack',                  'communication', 'not_connected', 'oauth2',     0, 0, '{}'),
('int-008', 'snyk',             'Snyk',                   'security',      'not_connected', 'token',      0, 0, '{}'),
('int-009', 'crowdstrike',      'CrowdStrike Falcon',     'security',      'not_connected', 'token',      0, 0, '{}'),
('int-010', 'google_workspace', 'Google Workspace',       'identity',      'not_connected', 'oauth2',     0, 0, '{}')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 11: SEED DATA — Trust Center (Demo Tenant)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO tenant_demo.trust_center(is_public, title, tagline, accent_color, show_score, show_frameworks, certifications, uptime_target)
VALUES (
    true,
    'Acme AI Security & Compliance',
    'Our commitment to security, privacy and responsible AI governance.',
    '#7c6af7',
    true,
    true,
    '[
        {"name":"ISO 42001","status":"in-progress","year":2026,"description":"AI Management System"},
        {"name":"SOC 2 Type II","status":"in-progress","year":2026,"description":"Trust Services Criteria"},
        {"name":"GDPR","status":"compliant","year":2026,"description":"EU Data Protection"}
    ]',
    99.9
) ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 12: FINALIZE — refresh domain_count counters
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE tenant_demo.frameworks f
SET domain_count = (
    SELECT COUNT(*) FROM tenant_demo.control_domains cd WHERE cd.standard = f.code
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ACME TENANT NOTE
-- The tenant_acme schema and its tables are provisioned dynamically by the API
-- via POST /api/tenants once the API container is running.
-- The deploy script calls this endpoint after the API health check passes.
-- Acme users (admin@acme.local, auditor@acme.local) are seeded via API after
-- schema provisioning, and registered in Keycloak via the realm import.
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    (SELECT COUNT(*) FROM public.tenants)                   AS tenants,
    (SELECT COUNT(*) FROM tenant_demo.frameworks)           AS frameworks,
    (SELECT COUNT(*) FROM tenant_demo.framework_workflow_steps) AS fw_steps,
    (SELECT COUNT(*) FROM tenant_demo.platform_users)       AS platform_users,
    (SELECT COUNT(*) FROM tenant_demo.integrations)         AS integrations;

SELECT 'Clovrix v2.0 database initialised successfully' AS status;
