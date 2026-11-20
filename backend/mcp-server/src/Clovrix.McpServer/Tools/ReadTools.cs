using System.ComponentModel;
using System.Data;
using System.Text.Json;
using Dapper;
using ModelContextProtocol.Server;

namespace Clovrix.McpServer.Tools;

// ══════════════════════════════════════════════════════════════════════════════
// READ TOOLS — Clovrix GRC platform MCP read tools
// Aligned with current API and schema:
//   Removed modules: monitoring_checks, risks, ITSM, AI Inventory (UI/API removed)
//   Active modules:  frameworks, control_domains, controls, evidence, workflows,
//                    findings, remediations, vendors, policies, personnel, audit_log
// All tools are tenant-aware (default: demo)
// ══════════════════════════════════════════════════════════════════════════════

[McpServerToolType]
public static class ReadTools
{
    private static string Sc(string? tenant = null)
    {
        var t = tenant ?? "demo";
        var clean = System.Text.RegularExpressions.Regex.Replace(t, @"[^a-zA-Z0-9_]", "");
        return $"tenant_{(string.IsNullOrEmpty(clean) ? "demo" : clean)}";
    }

    private static string Json(object? o) =>
        JsonSerializer.Serialize(o, new JsonSerializerOptions { WriteIndented = true });

    // ── 1. Dashboard Summary ─────────────────────────────────────────────────
    [McpServerTool, Description(
        "Get the Clovrix GRC platform overall compliance posture — overall score derived from framework " +
        "control domain averages, open findings, workflow stats, and AI maturity index. " +
        "Use this first for a high-level picture before drilling into specific areas.")]
    public static async Task<string> clovrix_get_dashboard_summary(
        IDbConnection db,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {

            var findings = await db.QueryAsync($@"
                SELECT severity, COUNT(*) AS cnt
                FROM {sc}.findings WHERE status='open'
                GROUP BY severity ORDER BY
                  CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END");

            var workflows = await db.QueryAsync($@"
                SELECT status, COUNT(*) AS cnt FROM {sc}.workflows GROUP BY status");

            // Framework scores derived from control_domains averages
            var frameworkScores = await db.QueryAsync($@"
                SELECT f.code, f.short_name, f.name, f.color,
                       COALESCE(ROUND(AVG(cd.score)),0) AS score,
                       COUNT(cd.id) AS domain_count
                FROM {sc}.frameworks f
                LEFT JOIN {sc}.control_domains cd ON cd.standard = f.code
                WHERE f.is_active = true
                GROUP BY f.code, f.short_name, f.name, f.color, f.sort_order
                ORDER BY f.sort_order");

            var fwList = ((IEnumerable<dynamic>)frameworkScores).ToList();
            var overallScore = fwList.Where(f => (long)f.domain_count > 0).Any()
                ? (int)Math.Round(fwList.Where(f => (long)f.domain_count > 0).Average(f => (double)(long)f.score))
                : 0;

            var openFindings = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.findings WHERE status='open'");
            var pendingAudits = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflows WHERE status IN ('pending','running')");
            var completedAudits = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflows WHERE status IN ('completed','archived')");
            var activePolicies = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.policies WHERE status IN ('active','approved')");

            return Json(new
            {
                overall_compliance_score = overallScore,
                open_findings            = openFindings,
                pending_audits           = pendingAudits,
                completed_audits         = completedAudits,
                active_policies          = activePolicies,
                frameworks               = fwList,
                findings_by_severity     = findings,
                workflows_by_status      = workflows
            });
        }
        finally { db.Close(); }
    }

    // ── 2. Global Search ─────────────────────────────────────────────────────
    [McpServerTool, Description(
        "Full-text search across all Clovrix GRC entities: findings, controls, control domains, workflows, " +
        "vendors, and policies. Returns top matches from each category. " +
        "Use when the user asks about a specific topic without specifying where to look.")]
    public static async Task<string> clovrix_global_search(
        IDbConnection db,
        [Description("Search query — e.g. 'data encryption', 'GDPR Article 17', 'high severity'")] string query,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc  = Sc(tenant);
        var q   = $"%{query.ToLower()}%";
        db.Open();
        try
        {
            var findings = await db.QueryAsync($@"
                SELECT id, title, severity, status, standard
                FROM {sc}.findings
                WHERE LOWER(title) LIKE @Q OR LOWER(description) LIKE @Q OR LOWER(standard) LIKE @Q
                LIMIT 10", new { Q = q });

            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref, c.title, c.status, d.area AS domain, d.standard
                FROM {sc}.controls c
                LEFT JOIN {sc}.control_domains d ON c.domain_id=d.id
                WHERE LOWER(c.title) LIKE @Q OR LOWER(c.description) LIKE @Q OR LOWER(c.ref) LIKE @Q
                LIMIT 10", new { Q = q });

            var workflows = await db.QueryAsync($@"
                SELECT id, name, standard, status, progress
                FROM {sc}.workflows
                WHERE LOWER(name) LIKE @Q OR LOWER(standard) LIKE @Q
                LIMIT 5", new { Q = q });

            var vendors = await db.QueryAsync($@"
                SELECT id, name, category, risk_tier, status
                FROM {sc}.vendors
                WHERE LOWER(name) LIKE @Q OR LOWER(category) LIKE @Q
                LIMIT 5", new { Q = q });

            var policies = await db.QueryAsync($@"
                SELECT id, title, category, status, version
                FROM {sc}.policies
                WHERE LOWER(title) LIKE @Q OR LOWER(content) LIKE @Q
                LIMIT 5", new { Q = q });

            return Json(new { query, findings, controls, workflows, vendors, policies });
        }
        finally { db.Close(); }
    }

    // ── 3. List Findings ─────────────────────────────────────────────────────
    [McpServerTool, Description(
        "List audit findings with optional filters. Returns findings with severity, status, compliance standard, " +
        "domain name, control ref, linked AI system, and dates. " +
        "Use to answer 'what are the open critical findings for GDPR?' or 'show me all unresolved findings'.")]
    public static async Task<string> clovrix_list_findings(
        IDbConnection db,
        [Description("Filter by compliance standard: ISO42001, GDPR, SOC2, NIST_AI_RMF, EU_AI_ACT, ISO27001")] string? standard = null,
        [Description("Filter by severity: critical, high, medium, low")] string? severity = null,
        [Description("Filter by status: open, in_progress, resolved, closed")] string? status = null,
        [Description("Filter by AI system ID")] string? aiSystemId = null,
        [Description("Filter by control domain ID")] string? domainId = null,
        [Description("Maximum results to return (default 50)")] int limit = 50,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (standard   != null) filters.Add("f.standard=@Standard");
            if (severity   != null) filters.Add("f.severity=@Severity");
            if (status     != null) filters.Add("f.status=@Status");
            if (aiSystemId != null) filters.Add("f.ai_system_id=@AiSystemId");
            if (domainId   != null) filters.Add("f.domain_id=@DomainId");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT f.*,
                  s.name AS ai_system_name,
                  d.area AS domain_name, d.ref_code AS domain_ref,
                  c.ref AS control_ref, c.title AS control_title
                FROM {sc}.findings f
                LEFT JOIN {sc}.ai_systems s       ON f.ai_system_id = s.id
                LEFT JOIN {sc}.control_domains d  ON f.domain_id = d.id
                LEFT JOIN {sc}.controls c         ON f.control_id = c.id
                {where}
                ORDER BY
                  CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                  f.created_at DESC
                LIMIT @Limit",
                new { Standard = standard, Severity = severity, Status = status, AiSystemId = aiSystemId, DomainId = domainId, Limit = limit });

            var list = rows.AsList();
            return Json(new
            {
                total    = list.Count,
                filters  = new { standard, severity, status, ai_system_id = aiSystemId, domain_id = domainId },
                findings = list
            });
        }
        finally { db.Close(); }
    }

    // ── 4. Get Control Gaps ──────────────────────────────────────────────────
    [McpServerTool, Description(
        "Get failing, not-tested, or partial controls for a compliance framework grouped by domain. " +
        "Use to answer 'what controls are failing for ISO 42001?' or 'show me the GDPR control gaps'.")]
    public static async Task<string> clovrix_get_control_gaps(
        IDbConnection db,
        [Description("Framework code: ISO42001, GDPR, SOC2, NIST_AI_RMF, EU_AI_ACT, ISO27001")] string framework,
        [Description("Filter by status (default: non-compliant, not-tested, partial)")] string? statusFilter = null,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var statusIn = statusFilter != null
                ? $"AND c.status='{statusFilter.Replace("'", "")}'"
                : "AND c.status NOT IN ('compliant')";

            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref, c.title, c.status, c.frequency,
                       d.area AS domain_name, d.ref_code AS domain_ref, d.score AS domain_score
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON c.domain_id=d.id
                WHERE d.standard=@Framework {statusIn}
                ORDER BY d.ref_code, c.ref",
                new { Framework = framework });

            var summary = await db.QueryFirstOrDefaultAsync($@"
                SELECT COUNT(*) AS total_controls,
                  SUM(CASE WHEN c.status='compliant'   THEN 1 ELSE 0 END) AS compliant,
                  SUM(CASE WHEN c.status NOT IN ('compliant') THEN 1 ELSE 0 END) AS gaps
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON c.domain_id=d.id
                WHERE d.standard=@Framework",
                new { Framework = framework });

            var domains = await db.QueryAsync($@"
                SELECT d.id, d.ref_code, d.area, d.score, d.status,
                       COUNT(c.id) AS total_controls,
                       SUM(CASE WHEN c.status='compliant' THEN 1 ELSE 0 END) AS compliant_controls
                FROM {sc}.control_domains d
                LEFT JOIN {sc}.controls c ON c.domain_id=d.id
                WHERE d.standard=@Framework
                GROUP BY d.id, d.ref_code, d.area, d.score, d.status
                ORDER BY d.ref_code",
                new { Framework = framework });

            return Json(new { framework, summary, domains, gap_controls = controls });
        }
        finally { db.Close(); }
    }

    // ── 5. List Workflows ────────────────────────────────────────────────────
    [McpServerTool, Description(
        "List audit workflows with optional filters. Returns workflow name, compliance standard, status, " +
        "progress %, step counts, linked AI system, and dates. " +
        "Use to answer 'what audits are currently running?' or 'show me completed ISO 42001 workflows'.")]
    public static async Task<string> clovrix_list_workflows(
        IDbConnection db,
        [Description("Filter by status: pending, running, completed, archived, cancelled")] string? status = null,
        [Description("Filter by compliance standard code")] string? standard = null,
        [Description("Maximum results (default 50)")] int limit = 50,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (status   != null) filters.Add("w.status=@Status");
            if (standard != null) filters.Add("w.standard=@Standard");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT w.*,
                  s.name AS ai_system_name,
                  (SELECT COUNT(*) FROM {sc}.workflow_steps ws WHERE ws.workflow_id=w.id) AS total_steps,
                  (SELECT COUNT(*) FROM {sc}.workflow_steps ws WHERE ws.workflow_id=w.id AND ws.status='completed') AS completed_steps,
                  (SELECT COUNT(*) FROM {sc}.findings f WHERE f.workflow_id=w.id) AS findings_count,
                  (SELECT COUNT(*) FROM {sc}.evidence e WHERE e.workflow_id=w.id) AS evidence_count
                FROM {sc}.workflows w
                LEFT JOIN {sc}.ai_systems s ON w.ai_system_id=s.id
                {where}
                ORDER BY w.created_at DESC
                LIMIT @Limit",
                new { Status = status, Standard = standard, Limit = limit });

            return Json(new { total = rows.AsList().Count, filters = new { status, standard }, workflows = rows });
        }
        finally { db.Close(); }
    }

    // ── 6. Get Workflow Detail ────────────────────────────────────────────────
    [McpServerTool, Description(
        "Get the full detail of a specific audit workflow — steps with status, findings, evidence, " +
        "and control domains tested. Use to answer 'what is the status of workflow X?' or 'show me the audit steps'.")]
    public static async Task<string> clovrix_get_workflow_detail(
        IDbConnection db,
        [Description("Workflow ID")] string workflowId,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var wf = await db.QueryFirstOrDefaultAsync($@"
                SELECT w.*, s.name AS ai_system_name
                FROM {sc}.workflows w
                LEFT JOIN {sc}.ai_systems s ON w.ai_system_id=s.id
                WHERE w.id=@Id", new { Id = workflowId });
            if (wf == null) return Json(new { error = $"Workflow '{workflowId}' not found" });

            var steps = await db.QueryAsync($@"
                SELECT * FROM {sc}.workflow_steps WHERE workflow_id=@Id ORDER BY step_order", new { Id = workflowId });
            var findings = await db.QueryAsync($@"
                SELECT f.title, f.severity, f.status, d.area AS domain
                FROM {sc}.findings f
                LEFT JOIN {sc}.control_domains d ON f.domain_id=d.id
                WHERE f.workflow_id=@Id ORDER BY f.created_at DESC", new { Id = workflowId });
            var evidence = await db.QueryAsync($@"
                SELECT original_name, collected_by, created_at
                FROM {sc}.evidence WHERE workflow_id=@Id ORDER BY created_at DESC", new { Id = workflowId });

            return Json(new { workflow = wf, steps, findings, evidence });
        }
        finally { db.Close(); }
    }

    // ── 7. List Remediations ─────────────────────────────────────────────────
    [McpServerTool, Description(
        "List remediations (corrective actions) linked to findings. Returns status, priority, due dates, " +
        "SLA breach flag, and assignee. Use to answer 'what remediations are overdue?' or 'show open remediations'.")]
    public static async Task<string> clovrix_list_remediations(
        IDbConnection db,
        [Description("Filter by status: open, in_progress, resolved, verified, cancelled")] string? status = null,
        [Description("Filter by priority: critical, high, medium, low")] string? priority = null,
        [Description("Only return SLA-breached items")] bool slaBreachedOnly = false,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (status   != null) filters.Add("r.status=@Status");
            if (priority != null) filters.Add("r.priority=@Priority");
            if (slaBreachedOnly) filters.Add("r.sla_breached=true");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT r.*, f.title AS finding_title, f.severity AS finding_severity, f.standard
                FROM {sc}.remediations r
                LEFT JOIN {sc}.findings f ON r.finding_id=f.id
                {where}
                ORDER BY CASE r.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                         r.due_date ASC NULLS LAST",
                new { Status = status, Priority = priority });

            var list = rows.AsList();
            return Json(new { total = list.Count, overdue = list.Count(r => (bool)r.sla_breached), remediations = list });
        }
        finally { db.Close(); }
    }

    // ── 8. List Vendors ──────────────────────────────────────────────────────
    [McpServerTool, Description(
        "List vendors in the vendor risk management register. " +
        "Returns vendor risk tier, criticality, DPA status, SOC2, assessment dates. " +
        "Use to answer 'which vendors are high risk?' or 'which vendors have expired DPAs?'")]
    public static async Task<string> clovrix_list_vendors(
        IDbConnection db,
        [Description("Filter by risk tier: tier-1, tier-2, tier-3")] string? riskTier = null,
        [Description("Filter by status: active, review, suspended, offboarded")] string? status = null,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (riskTier != null) filters.Add("risk_tier=@RiskTier");
            if (status   != null) filters.Add("status=@Status");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT id, name, category, criticality, risk_tier, risk_score, status,
                       dpa_signed, dpa_expiry, soc2_type, soc2_expiry, iso27001_certified,
                       last_assessment_date, next_assessment_due, owner_email, contact_email
                FROM {sc}.vendors {where}
                ORDER BY CASE risk_tier WHEN 'tier-1' THEN 1 WHEN 'tier-2' THEN 2 ELSE 3 END, name",
                new { RiskTier = riskTier, Status = status });

            return Json(new { total = rows.AsList().Count, vendors = rows });
        }
        finally { db.Close(); }
    }

    // ── 9. List Policies ─────────────────────────────────────────────────────
    [McpServerTool, Description(
        "List policies and governance documents. Returns policy name, category, version, approval status, " +
        "owner, review dates, and sign-off requirements. Use to answer 'what policies need review?' or 'show approved AI governance policies'.")]
    public static async Task<string> clovrix_list_policies(
        IDbConnection db,
        [Description("Filter by status: draft, review, approved, active, archived")] string? status = null,
        [Description("Filter by category: ai_governance, data_privacy, security, operational")] string? category = null,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (status   != null) filters.Add("status=@Status");
            if (category != null) filters.Add("category=@Category");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT id, title, category, version, status, owner_email, approved_by,
                       approved_at, effective_date, review_date, requires_signoff, frameworks
                FROM {sc}.policies {where}
                ORDER BY
                  CASE status WHEN 'review' THEN 1 WHEN 'draft' THEN 2 WHEN 'active' THEN 3 ELSE 4 END,
                  title",
                new { Status = status, Category = category });

            return Json(new { total = rows.AsList().Count, policies = rows });
        }
        finally { db.Close(); }
    }

    // ── 10. List Frameworks ──────────────────────────────────────────────────
    [McpServerTool, Description(
        "List all compliance frameworks configured in the platform with their compliance scores (derived from control domain averages). " +
        "Returns framework name, code, score, domain count, and control counts. " +
        "Use to answer 'what frameworks are we tracking?' or 'which framework has the lowest compliance score?'")]
    public static async Task<string> clovrix_list_frameworks(
        IDbConnection db,
        [Description("Include inactive frameworks (default: active only)")] bool activeOnly = true,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var where = activeOnly ? "WHERE f.is_active=true" : "";

            var rows = await db.QueryAsync($@"
                SELECT f.id, f.code, f.name, f.short_name, f.category, f.color, f.version, f.is_active,
                       COALESCE(ROUND(AVG(cd.score)),0) AS compliance_score,
                       COUNT(DISTINCT cd.id) AS domain_count,
                       (SELECT COUNT(*) FROM {sc}.controls c2
                        JOIN {sc}.control_domains cd2 ON c2.domain_id=cd2.id
                        WHERE cd2.standard=f.code) AS total_controls,
                       (SELECT COUNT(*) FROM {sc}.controls c2
                        JOIN {sc}.control_domains cd2 ON c2.domain_id=cd2.id
                        WHERE cd2.standard=f.code AND c2.status='compliant') AS compliant_controls
                FROM {sc}.frameworks f
                LEFT JOIN {sc}.control_domains cd ON cd.standard=f.code
                {where}
                GROUP BY f.id, f.code, f.name, f.short_name, f.category, f.color, f.version, f.is_active, f.sort_order
                ORDER BY f.sort_order");

            return Json(new { total = rows.AsList().Count, frameworks = rows });
        }
        finally { db.Close(); }
    }

    // ── 11. List Evidence ────────────────────────────────────────────────────
    [McpServerTool, Description(
        "List evidence files collected during audits, optionally filtered by workflow or control. " +
        "Returns filename, collection date, linked control and domain, and workflow. " +
        "Use to answer 'what evidence was collected for workflow X?' or 'show evidence for GDPR controls'.")]
    public static async Task<string> clovrix_list_evidence(
        IDbConnection db,
        [Description("Filter by workflow ID")] string? workflowId = null,
        [Description("Filter by control ID")] string? controlId = null,
        [Description("Filter by domain ID")] string? domainId = null,
        [Description("Maximum results (default 50)")] int limit = 50,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (workflowId != null) filters.Add("e.workflow_id=@WorkflowId");
            if (controlId  != null) filters.Add("e.control_id=@ControlId");
            if (domainId   != null) filters.Add("e.domain_id=@DomainId");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT e.id, e.original_name, e.file_size, e.mime_type, e.collected_by,
                       e.source, e.description, e.created_at,
                       c.ref AS control_ref, c.title AS control_title,
                       d.area AS domain_name, d.standard
                FROM {sc}.evidence e
                LEFT JOIN {sc}.controls c        ON e.control_id=c.id
                LEFT JOIN {sc}.control_domains d ON e.domain_id=d.id
                {where}
                ORDER BY e.created_at DESC LIMIT @Limit",
                new { WorkflowId = workflowId, ControlId = controlId, DomainId = domainId, Limit = limit });

            return Json(new { total = rows.AsList().Count, evidence = rows });
        }
        finally { db.Close(); }
    }

    // ── 12. Get AI Action Audit Log ──────────────────────────────────────────
    [McpServerTool, Description(
        "Retrieve the AI assistant action audit log — all actions executed by the AI assistant " +
        "with user identity, timestamps, parameters, and outcomes. " +
        "Use to answer 'what actions did the AI perform today?' or 'show me the AI audit trail'.")]
    public static async Task<string> clovrix_get_ai_action_log(
        IDbConnection db,
        [Description("Filter by user email")] string? userEmail = null,
        [Description("Filter by action type: create_finding, create_workflow, register_ai_system, etc.")] string? actionType = null,
        [Description("Filter by exec mode: mcp, confirmed, auto")] string? execMode = null,
        [Description("Maximum results (default 50)")] int limit = 50,
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var filters = new List<string>();
            if (userEmail  != null) filters.Add("user_email=@UserEmail");
            if (actionType != null) filters.Add("action_type=@ActionType");
            if (execMode   != null) filters.Add("exec_mode=@ExecMode");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";

            var rows = await db.QueryAsync($@"
                SELECT id, user_email, action_type, parameters, result, exec_mode, status, error_msg, created_at
                FROM {sc}.ai_action_logs
                {where}
                ORDER BY created_at DESC LIMIT @Limit",
                new { UserEmail = userEmail, ActionType = actionType, ExecMode = execMode, Limit = limit });

            return Json(new { total = rows.AsList().Count, logs = rows });
        }
        finally { db.Close(); }
    }
}
