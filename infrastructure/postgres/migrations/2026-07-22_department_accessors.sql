-- ═════════════════════════════════════════════════════════════════════════════
-- Migration: Department-Aware Accessor Roles
-- Adds business department filtering to accessor role assignments
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. ADD BUSINESS DEPARTMENT COLUMN TO AUDIT_CONTROLS ──────────────────────
-- Links controls to business departments for fine-grained access control
ALTER TABLE tenant_demo.audit_controls
ADD COLUMN IF NOT EXISTS business_department VARCHAR(100) DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_audit_controls_department
ON tenant_demo.audit_controls(business_department);

-- ── 2. MODIFY CONTROL_ACCESSORS FOR DEPARTMENT-AWARE FILTERING ───────────────
-- Each accessor role is now scoped to a business department
ALTER TABLE tenant_demo.control_accessors
ADD COLUMN IF NOT EXISTS business_department VARCHAR(100) DEFAULT 'General';

-- Update the unique constraint to include department
DROP CONSTRAINT IF EXISTS control_accessors_unique;
ALTER TABLE tenant_demo.control_accessors
ADD CONSTRAINT control_accessors_unique_with_dept
UNIQUE(audit_control_id, accessor_email, accessor_role, business_department);

CREATE INDEX IF NOT EXISTS idx_control_accessors_department
ON tenant_demo.control_accessors(business_department);

-- ── 3. SUPPORTED BUSINESS DEPARTMENTS ────────────────────────────────────────
-- Standard departments for audit scope filtering
-- Can be extended per tenant as needed
CREATE TABLE IF NOT EXISTS tenant_demo.business_departments (
    id              VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    icon_name       VARCHAR(30),  -- e.g., "shield", "database", "users", "cog"
    color_hex       VARCHAR(7),   -- e.g., "#0056B3"
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed standard departments
INSERT INTO tenant_demo.business_departments
(department_name, description, icon_name, color_hex)
VALUES
    ('General', 'Cross-functional or general controls', 'grid', '#6B7280'),
    ('Finance', 'Financial operations and reporting', 'currency-dollar', '#059669'),
    ('IT', 'Information Technology and Infrastructure', 'cpu', '#0056B3'),
    ('Security', 'Information Security and Compliance', 'shield-alert', '#DC2626'),
    ('HR', 'Human Resources and Personnel', 'users', '#9333EA'),
    ('Operations', 'Business Operations and Process', 'cog', '#F59E0B'),
    ('Legal', 'Legal and Regulatory Affairs', 'briefcase', '#7C3AED'),
    ('Data', 'Data Management and Privacy', 'database', '#06B6D4')
ON CONFLICT (department_name) DO NOTHING;

-- ── 4. UPDATED VIEWS WITH DEPARTMENT FILTERING ───────────────────────────────

-- View: Control accessor assignments with department filtering
DROP VIEW IF EXISTS tenant_demo.control_accessor_assignments CASCADE;
CREATE OR REPLACE VIEW tenant_demo.control_accessor_assignments AS
SELECT
    ca.id AS assignment_id,
    ca.audit_control_id,
    ca.accessor_email,
    ca.accessor_role,
    ca.business_department,
    ac.audit_id,
    ac.control_ref,
    ac.control_title,
    ac.assigned_control_lead,
    ac.business_department AS control_department,
    ca.assigned_at,
    a.name AS audit_name,
    a.status AS audit_status,
    bd.icon_name,
    bd.color_hex
FROM tenant_demo.control_accessors ca
JOIN tenant_demo.audit_controls ac ON ca.audit_control_id = ac.id
JOIN tenant_demo.audits a ON ac.audit_id = a.id
LEFT JOIN tenant_demo.business_departments bd ON ca.business_department = bd.department_name
ORDER BY ca.assigned_at DESC;

-- View: User's department-filtered control assignments
CREATE OR REPLACE VIEW tenant_demo.user_accessible_controls AS
SELECT
    ca.audit_control_id,
    ac.audit_id,
    ac.control_ref,
    ac.control_title,
    ac.control_statement,
    ac.implementation_status,
    ac.business_department,
    ca.accessor_email,
    ca.accessor_role,
    ca.business_department AS assigned_department,
    a.name AS audit_name,
    a.status AS audit_status,
    bd.icon_name,
    bd.color_hex
FROM tenant_demo.control_accessors ca
JOIN tenant_demo.audit_controls ac ON ca.audit_control_id = ac.id
    AND ac.business_department = ca.business_department
JOIN tenant_demo.audits a ON ac.audit_id = a.id
LEFT JOIN tenant_demo.business_departments bd ON ca.business_department = bd.department_name
WHERE ca.business_department IN (ac.business_department, 'General')
   OR ac.business_department = 'General'
ORDER BY a.created_at DESC, ca.accessor_role;

-- View: Department access matrix
CREATE OR REPLACE VIEW tenant_demo.department_access_matrix AS
SELECT
    ca.accessor_email,
    ca.accessor_role,
    ca.business_department,
    COUNT(DISTINCT ca.audit_control_id) AS control_count,
    COUNT(DISTINCT ac.audit_id) AS audit_count,
    STRING_AGG(DISTINCT ac.control_ref, ', ') AS control_refs
FROM tenant_demo.control_accessors ca
JOIN tenant_demo.audit_controls ac ON ca.audit_control_id = ac.id
GROUP BY ca.accessor_email, ca.accessor_role, ca.business_department
ORDER BY ca.accessor_email, ca.business_department;

-- ── 5. DOCUMENTATION ────────────────────────────────────────────────────────
-- Business Departments:
--   Each control is tagged with a business_department to indicate scope.
--   Accessor role assignments are department-specific:
--     - control_lead@example.com as Control Lead for IT department
--     - control_lead@example.com as Control Lead for Finance department
--     - Different permissions per department
--
-- Visibility Rules:
--   - User sees controls matching their assigned department(s)
--   - "General" department controls visible to all accessors
--   - Cross-department visibility can be configured per role
--
-- Example:
--   Austin (assessor, IT): sees IT + General controls
--   Blake (assessor, Finance): sees Finance + General controls
--   Carol (auditor, General): sees all controls
