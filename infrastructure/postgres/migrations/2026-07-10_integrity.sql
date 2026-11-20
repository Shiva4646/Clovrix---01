-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION tenant_demo.set_updated_at()
RETURNS TRIGGER
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_frameworks_updated_at ON tenant_demo.frameworks;
CREATE TRIGGER trg_frameworks_updated_at
BEFORE UPDATE ON tenant_demo.frameworks
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();


DROP TRIGGER IF EXISTS trg_control_domains_updated_at ON tenant_demo.control_domains;
CREATE TRIGGER trg_control_domains_updated_at
BEFORE UPDATE ON tenant_demo.control_domains
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();


DROP TRIGGER IF EXISTS trg_controls_updated_at ON tenant_demo.controls;
CREATE TRIGGER trg_controls_updated_at
BEFORE UPDATE ON tenant_demo.controls
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();


DROP TRIGGER IF EXISTS trg_workflows_updated_at ON tenant_demo.workflows;
CREATE TRIGGER trg_workflows_updated_at
BEFORE UPDATE ON tenant_demo.workflows
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();


DROP TRIGGER IF EXISTS trg_findings_updated_at ON tenant_demo.findings;
CREATE TRIGGER trg_findings_updated_at
BEFORE UPDATE ON tenant_demo.findings
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();


DROP TRIGGER IF EXISTS trg_policies_updated_at ON tenant_demo.policies;
CREATE TRIGGER trg_policies_updated_at
BEFORE UPDATE ON tenant_demo.policies
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();


DROP TRIGGER IF EXISTS trg_risks_updated_at ON tenant_demo.risks;
CREATE TRIGGER trg_risks_updated_at
BEFORE UPDATE ON tenant_demo.risks
FOR EACH ROW
EXECUTE FUNCTION tenant_demo.set_updated_at();

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

-- NOTE: an earlier version of this migration added chk_controls_status to
-- tenant_demo.controls with workflow values ('Assigned','Ready',…). But
-- `controls` is the read-only framework TEMPLATE library (status default
-- 'not-tested', per clovrix-init.sql), not the audit workflow — so that
-- constraint rejected every control-library seed row. It is removed here
-- (idempotent). Audit-cycle state lives on audit_controls, not controls.
ALTER TABLE tenant_demo.controls DROP CONSTRAINT IF EXISTS chk_controls_status;

-- ============================================================================
-- FOREIGN KEY REVIEW
-- ============================================================================

-- Existing foreign keys verified.
-- No additional foreign keys required.

-- ============================================================================
-- ON DELETE RULE REVIEW
-- ============================================================================

-- Existing ON DELETE CASCADE / RESTRICT rules verified.
-- No additional delete rules required.