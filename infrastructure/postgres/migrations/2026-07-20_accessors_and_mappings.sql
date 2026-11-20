-- ═════════════════════════════════════════════════════════════════════════════
-- Migration: Accessor Roles & Cross-Framework Control Mappings
-- Adds support for:
--   1. Accessor role assignments (5 roles per control)
--   2. Cross-framework control mappings (e.g., ISO 27001 A.5.1 → SOC 2 CC6.1)
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. ACCESSOR ROLES ────────────────────────────────────────────────────────
-- Junction table: links users to audit_controls with a specific accessor role
-- Supports: control_lead, assessor, reviewer, auditor, remediation_owner

CREATE TABLE IF NOT EXISTS tenant_demo.control_accessors (
    id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    audit_control_id VARCHAR(36)  NOT NULL REFERENCES tenant_demo.audit_controls(id) ON DELETE CASCADE,
    accessor_email   VARCHAR(200) NOT NULL,
    accessor_role    VARCHAR(30)  NOT NULL,  -- control_lead | assessor | reviewer | auditor | remediation_owner
    assigned_by      VARCHAR(200),
    assigned_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT control_accessors_role_valid CHECK (
        accessor_role IN ('control_lead','assessor','reviewer','auditor','remediation_owner')
    ),
    CONSTRAINT control_accessors_unique UNIQUE(audit_control_id, accessor_email, accessor_role)
);

CREATE INDEX IF NOT EXISTS idx_control_accessors_control ON tenant_demo.control_accessors(audit_control_id);
CREATE INDEX IF NOT EXISTS idx_control_accessors_email   ON tenant_demo.control_accessors(accessor_email);
CREATE INDEX IF NOT EXISTS idx_control_accessors_role    ON tenant_demo.control_accessors(accessor_role);

-- ── 2. CONTROL MAPPINGS (Cross-Framework) ──────────────────────────────────
-- Maps controls across frameworks for cross-compliance tracking
-- Example: ISO 27001 A.5.1 "Information Security Policies" → SOC 2 CC6.1 "Logical Access"

CREATE TABLE IF NOT EXISTS tenant_demo.control_mappings (
    id                     VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    source_framework       VARCHAR(30)  NOT NULL,              -- e.g. "ISO-27001"
    source_control_id      VARCHAR(60)  NOT NULL,              -- e.g. "A.5.1"
    target_framework       VARCHAR(30)  NOT NULL,              -- e.g. "SOC-2"
    target_control_id      VARCHAR(60)  NOT NULL,              -- e.g. "CC6.1"
    mapping_type           VARCHAR(20)  NOT NULL DEFAULT 'equivalent', -- equivalent | partial | related | complements
    alignment_score        DECIMAL(3,2),                        -- 0.0 to 1.0, e.g. 0.85
    notes                  TEXT,                                -- Additional context about the mapping
    created_by             VARCHAR(200),
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ,
    CONSTRAINT control_mappings_type_valid CHECK (
        mapping_type IN ('equivalent','partial','related','complements')
    ),
    CONSTRAINT control_mappings_score_valid CHECK (
        alignment_score IS NULL OR (alignment_score >= 0.0 AND alignment_score <= 1.0)
    ),
    CONSTRAINT control_mappings_unique UNIQUE(source_framework, source_control_id, target_framework, target_control_id)
);

CREATE INDEX IF NOT EXISTS idx_mappings_source      ON tenant_demo.control_mappings(source_framework, source_control_id);
CREATE INDEX IF NOT EXISTS idx_mappings_target      ON tenant_demo.control_mappings(target_framework, target_control_id);
CREATE INDEX IF NOT EXISTS idx_mappings_type        ON tenant_demo.control_mappings(mapping_type);
CREATE INDEX IF NOT EXISTS idx_mappings_score       ON tenant_demo.control_mappings(alignment_score);

-- ── 3. MAPPING USAGE TRACKING ───────────────────────────────────────────────
-- Tracks when/how control mappings are used in audits
-- Links audit controls to their mapped counterparts for cross-framework visibility

CREATE TABLE IF NOT EXISTS tenant_demo.audit_control_mappings (
    id                    VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    audit_control_id      VARCHAR(36)  NOT NULL REFERENCES tenant_demo.audit_controls(id) ON DELETE CASCADE,
    mapping_id            VARCHAR(36)  NOT NULL REFERENCES tenant_demo.control_mappings(id) ON DELETE CASCADE,
    status                VARCHAR(20)  NOT NULL DEFAULT 'linked', -- linked | tested_together | independently_tested | conflicting
    notes                 TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_control_mappings_status_valid CHECK (
        status IN ('linked','tested_together','independently_tested','conflicting')
    ),
    CONSTRAINT audit_control_mappings_unique UNIQUE(audit_control_id, mapping_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_control_mappings_control  ON tenant_demo.audit_control_mappings(audit_control_id);
CREATE INDEX IF NOT EXISTS idx_audit_control_mappings_mapping  ON tenant_demo.audit_control_mappings(mapping_id);
CREATE INDEX IF NOT EXISTS idx_audit_control_mappings_status   ON tenant_demo.audit_control_mappings(status);

-- ── 4. FRAMEWORK MAPPING VIEWS ──────────────────────────────────────────────

-- View: Cross-framework control coverage matrix
CREATE OR REPLACE VIEW tenant_demo.framework_coverage_matrix AS
SELECT
    m.source_framework,
    m.target_framework,
    COUNT(DISTINCT m.source_control_id) AS source_controls,
    COUNT(DISTINCT m.target_control_id) AS target_controls,
    COUNT(DISTINCT m.id) AS mappings,
    AVG(m.alignment_score) AS avg_alignment,
    COUNT(DISTINCT CASE WHEN m.mapping_type='equivalent' THEN m.id END) AS equivalent_mappings,
    COUNT(DISTINCT CASE WHEN m.mapping_type='partial' THEN m.id END) AS partial_mappings,
    COUNT(DISTINCT CASE WHEN m.mapping_type='related' THEN m.id END) AS related_mappings
FROM tenant_demo.control_mappings m
GROUP BY m.source_framework, m.target_framework;

-- View: Control mapping details with assessment results
CREATE OR REPLACE VIEW tenant_demo.control_mapping_assessment AS
SELECT
    m.id AS mapping_id,
    m.source_framework,
    m.source_control_id,
    m.target_framework,
    m.target_control_id,
    m.mapping_type,
    m.alignment_score,
    ac.id AS source_audit_control_id,
    ac.implementation_status AS source_status,
    a_latest.result AS source_latest_result,
    COALESCE(ac.framework_code, a.framework_code) AS audit_framework,
    a.id AS audit_id,
    a.name AS audit_name
FROM tenant_demo.control_mappings m
LEFT JOIN tenant_demo.controls c ON c.ref = m.source_control_id
LEFT JOIN tenant_demo.audit_controls ac ON ac.source_control_id = c.id
LEFT JOIN tenant_demo.audits a ON ac.audit_id = a.id
LEFT JOIN LATERAL (
    SELECT result, tested_at FROM tenant_demo.assessments s
    WHERE s.audit_control_id = ac.id
    ORDER BY s.tested_at DESC LIMIT 1
) a_latest ON TRUE;

-- ── 5. ACCESSOR ROLE VIEWS ──────────────────────────────────────────────────

-- View: User-control accessor assignments with details
CREATE OR REPLACE VIEW tenant_demo.control_accessor_assignments AS
SELECT
    ca.id AS assignment_id,
    ca.audit_control_id,
    ca.accessor_email,
    ca.accessor_role,
    ac.audit_id,
    ac.control_ref,
    ac.control_title,
    ac.assigned_control_lead,
    ca.assigned_at,
    a.name AS audit_name,
    a.status AS audit_status
FROM tenant_demo.control_accessors ca
JOIN tenant_demo.audit_controls ac ON ca.audit_control_id = ac.id
JOIN tenant_demo.audits a ON ac.audit_id = a.id
ORDER BY ca.assigned_at DESC;

-- ── 6. TRIGGER FOR UPDATED_AT ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_control_mappings_updated_at ON tenant_demo.control_mappings;
CREATE TRIGGER trg_control_mappings_updated_at
BEFORE UPDATE ON tenant_demo.control_mappings
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();

-- ── 7. INITIAL MAPPINGS (Seed Data) ─────────────────────────────────────────
-- Common mappings between ISO 27001 and SOC 2 (partial - expand as needed)
-- These serve as reference mappings that can be inherited by specific audits

INSERT INTO tenant_demo.control_mappings
    (source_framework, source_control_id, target_framework, target_control_id, mapping_type, alignment_score, notes, created_by, created_at)
VALUES
    ('ISO-27001', 'A.5.1', 'SOC-2', 'CC6.1', 'equivalent', 0.95, 'Both address information security policies and procedures', 'system', NOW()),
    ('ISO-27001', 'A.6.1', 'SOC-2', 'CC6.2', 'equivalent', 0.90, 'User access control and roles management', 'system', NOW()),
    ('ISO-27001', 'A.7.1', 'SOC-2', 'CC3.1', 'related', 0.75, 'Cryptographic controls and key management', 'system', NOW()),
    ('ISO-27001', 'A.8.1', 'SOC-2', 'A1.1', 'partial', 0.70, 'Asset management and system inventory', 'system', NOW()),
    ('ISO-27001', 'A.9.1', 'SOC-2', 'CC6.1', 'related', 0.65, 'Access control policies and procedures', 'system', NOW()),
    ('ISO-27001', 'A.10.1', 'SOC-2', 'L1.1', 'equivalent', 0.85, 'Cryptography policies and implementation', 'system', NOW()),
    ('ISO-27001', 'A.12.1', 'SOC-2', 'A1.2', 'partial', 0.75, 'Operations management and change control', 'system', NOW()),
    ('ISO-27001', 'A.14.1', 'SOC-2', 'C1.1', 'related', 0.70, 'Supplier relationships and third-party management', 'system', NOW()),
    ('SOC-2', 'CC6.1', 'CSF', 'AC-1', 'equivalent', 0.92, 'Access control policy', 'system', NOW()),
    ('SOC-2', 'CC7.2', 'CSF', 'SI-12', 'partial', 0.78, 'System monitoring and logging', 'system', NOW())
ON CONFLICT (source_framework, source_control_id, target_framework, target_control_id) DO NOTHING;

-- ── 8. DOCUMENTATION ───────────────────────────────────────────────────────
-- Mapping Types:
--   - equivalent: Same control objectives and implementation approach
--   - partial: Overlapping but not fully equivalent
--   - related: Addresses similar but distinct concerns
--   - complements: Works together with the mapped control
--
-- Alignment Score: 0.0-1.0
--   - 0.90+: Equivalent/highly aligned
--   - 0.75-0.89: Partial/related with good overlap
--   - 0.50-0.74: Tangential/complementary coverage
--   - <0.50: Minimal overlap
--
-- Usage: Track which mappings are actively used in audits via audit_control_mappings
