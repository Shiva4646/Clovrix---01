-- ============================================================================
-- AUDIT PROGRESS REPORTING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW tenant_demo.audit_progress_v AS

SELECT
    a.id AS audit_id,
    a.name AS audit_name,
    a.framework_code,

    COUNT(DISTINCT ac.id) AS total_controls,

    COUNT(DISTINCT ac.id)
        FILTER (WHERE ac.ready_for_assessment = TRUE)
        AS ready_controls,

    COUNT(DISTINCT ass.id)
        AS assessed_controls,

    COUNT(DISTINCT ass.id)
        FILTER (WHERE ass.result = 'pass')
        AS passed_controls,

    COUNT(DISTINCT ass.id)
        FILTER (WHERE ass.result = 'fail')
        AS failed_controls,

    COUNT(DISTINCT ass.id)
        FILTER (WHERE ass.review_status = 'pending')
        AS pending_review,

    COUNT(DISTINCT f.id)
        FILTER (WHERE LOWER(f.status) = 'open')
        AS open_findings

FROM tenant_demo.audits a

LEFT JOIN tenant_demo.audit_controls ac
    ON ac.audit_id = a.id

LEFT JOIN tenant_demo.assessments ass
    ON ass.audit_control_id = ac.id

LEFT JOIN tenant_demo.findings f
    ON f.audit_control_id = ac.id

GROUP BY
    a.id,
    a.name,
    a.framework_code;