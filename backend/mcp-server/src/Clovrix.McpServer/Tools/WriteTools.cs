using System.ComponentModel;
using System.Data;
using System.Text.Json;
using Dapper;
using ModelContextProtocol.Server;

namespace Clovrix.McpServer.Tools;

// ══════════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — Clovrix GRC platform MCP mutating tools
// Aligned with current API and schema (no monitoring, no ITSM, no risks module,
// no AI Inventory — ai_systems table remains in DB but is not exposed)
// Every write is logged to ai_action_logs with user_email + timestamp
// All tools are tenant-aware (default: demo)
// ══════════════════════════════════════════════════════════════════════════════

[McpServerToolType]
public static class WriteTools
{
    private static string Sc(string? tenant = null)
    {
        var t     = tenant ?? "demo";
        var clean = System.Text.RegularExpressions.Regex.Replace(t, @"[^a-zA-Z0-9_]", "");
        return $"tenant_{(string.IsNullOrEmpty(clean) ? "demo" : clean)}";
    }

    private static string Json(object? o) =>
        JsonSerializer.Serialize(o, new JsonSerializerOptions { WriteIndented = true });

    private static async Task WriteLog(
        IDbConnection db, string schema, string userEmail,
        string actionType, object parameters, object? result,
        string execMode = "mcp", string status = "success", string? errorMsg = null)
    {
        await db.ExecuteAsync($@"
            INSERT INTO {schema}.ai_action_logs
              (id, user_email, action_type, parameters, result, exec_mode, status, error_msg, created_at)
            VALUES
              (gen_random_uuid(), @Email, @ActionType, @Params::jsonb, @Result::jsonb, @ExecMode, @Status, @ErrorMsg, NOW())",
            new
            {
                Email      = userEmail,
                ActionType = actionType,
                Params     = JsonSerializer.Serialize(parameters),
                Result     = JsonSerializer.Serialize(result ?? new { }),
                ExecMode   = execMode,
                Status     = status,
                ErrorMsg   = errorMsg
            });
    }

    // ── 1. Create Finding ────────────────────────────────────────────────────
    [McpServerTool, Description(
        "Log a new audit finding in the Clovrix GRC platform. " +
        "Findings represent compliance gaps, policy violations, or control failures identified during audits. " +
        "Use when the user says 'log a finding', 'create an audit finding', or describes a compliance issue.")]
    public static async Task<string> clovrix_create_finding(
        IDbConnection db,
        [Description("Finding title — clear, concise summary of the issue")] string title,
        [Description("Compliance standard: ISO42001, GDPR, SOC2, NIST_AI_RMF, EU_AI_ACT, ISO27001")] string standard,
        [Description("Severity: critical, high, medium, low")] string severity,
        [Description("Detailed description of the finding, evidence, and impact")] string description,
        [Description("Assigned owner email for remediation")] string? assignedTo = null,
        [Description("AI system ID this finding relates to")] string? aiSystemId = null,
        [Description("Control domain ID this finding relates to")] string? domainId = null,
        [Description("Control ID this finding relates to")] string? controlId = null,
        [Description("Workflow ID this finding was generated in")] string? workflowId = null,
        [Description("Due date for remediation in ISO format (e.g. 2025-12-31)")] string? dueDate = null,
        [Description("User email performing this action (for audit log)")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.findings
                  (id, title, description, standard, severity, status, source,
                   assigned_to, ai_system_id, domain_id, control_id, workflow_id,
                   due_date, created_by, created_at, updated_at)
                VALUES
                  (@Id, @Title, @Desc, @Standard, @Severity, 'open', 'mcp',
                   @AssignedTo, @AiSystemId, @DomainId, @ControlId, @WorkflowId,
                   @DueDate::date, @CreatedBy, NOW(), NOW())",
                new
                {
                    Id         = id,
                    Title      = title,
                    Desc       = description,
                    Standard   = standard,
                    Severity   = severity,
                    AssignedTo = assignedTo,
                    AiSystemId = aiSystemId,
                    DomainId   = domainId,
                    ControlId  = controlId,
                    WorkflowId = workflowId,
                    DueDate    = dueDate,
                    CreatedBy  = userEmail
                });

            await WriteLog(db, sc, userEmail, "create_finding",
                new { title, standard, severity, assigned_to = assignedTo }, new { id, title });

            return Json(new { success = true, finding_id = id, message = $"Finding '{title}' logged with severity '{severity}'" });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_finding",
                new { title, standard, severity }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 2. Update Finding Status ─────────────────────────────────────────────
    [McpServerTool, Description(
        "Update the status of an existing finding. " +
        "Use to remediate, resolve, or close a finding after corrective action has been taken. " +
        "Use when the user says 'mark finding X as resolved', 'close finding', or 'update remediation status'.")]
    public static async Task<string> clovrix_update_finding_status(
        IDbConnection db,
        [Description("Finding ID to update")] string findingId,
        [Description("New status: in_progress, resolved, closed")] string status,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var finding = await db.QueryFirstOrDefaultAsync(
                $"SELECT id, title, status FROM {sc}.findings WHERE id=@Id", new { Id = findingId });
            if (finding == null)
                return Json(new { success = false, error = $"Finding '{findingId}' not found" });

            var resolvedAt = (status == "resolved" || status == "closed") ? ", resolved_at=NOW()" : "";
            await db.ExecuteAsync($@"
                UPDATE {sc}.findings
                SET status=@Status, updated_at=NOW() {resolvedAt}
                WHERE id=@Id",
                new { Id = findingId, Status = status });

            await WriteLog(db, sc, userEmail, "update_finding_status",
                new { finding_id = findingId, old_status = (string)finding.status, new_status = status },
                new { title = (string)finding.title, status });

            return Json(new { success = true, finding_id = findingId, title = (string)finding.title, new_status = status });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "update_finding_status",
                new { finding_id = findingId, status }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 3. Create Remediation ────────────────────────────────────────────────
    [McpServerTool, Description(
        "Create a remediation (corrective action) linked to a finding. " +
        "Use when the user says 'create a remediation for finding X', 'log corrective action', or 'assign remediation task'.")]
    public static async Task<string> clovrix_create_remediation(
        IDbConnection db,
        [Description("Finding ID this remediation addresses")] string findingId,
        [Description("Remediation title — what needs to be done")] string title,
        [Description("Priority: critical, high, medium, low")] string priority,
        [Description("Detailed description of the corrective action")] string? description = null,
        [Description("Email of person assigned to fix this")] string? assignedTo = null,
        [Description("Due date in ISO format (e.g. 2025-12-31)")] string? dueDate = null,
        [Description("SLA in days (default 30)")] int slaDays = 30,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.remediations
                  (id, finding_id, title, description, priority, status,
                   assigned_to, assigned_by, due_date, sla_days, created_at, updated_at)
                VALUES
                  (@Id, @FindingId, @Title, @Desc, @Priority, 'open',
                   @AssignedTo, @AssignedBy, @DueDate::date, @SlaDays, NOW(), NOW())",
                new
                {
                    Id         = id,
                    FindingId  = findingId,
                    Title      = title,
                    Desc       = description,
                    Priority   = priority,
                    AssignedTo = assignedTo,
                    AssignedBy = userEmail,
                    DueDate    = dueDate,
                    SlaDays    = slaDays
                });

            await WriteLog(db, sc, userEmail, "create_remediation",
                new { finding_id = findingId, title, priority }, new { id, title });

            return Json(new { success = true, remediation_id = id, message = $"Remediation '{title}' created ({priority} priority, {slaDays}-day SLA)" });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_remediation",
                new { finding_id = findingId, title }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 4. Create Workflow ───────────────────────────────────────────────────
    [McpServerTool, Description(
        "Start a new audit workflow. Workflows orchestrate end-to-end compliance audit processes " +
        "(evidence collection → control testing → gap analysis → report generation → review → archive). " +
        "Use when the user says 'start an audit', 'create a workflow', or 'run a compliance assessment for X'.")]
    public static async Task<string> clovrix_create_workflow(
        IDbConnection db,
        [Description("Workflow name — descriptive title for this audit")] string name,
        [Description("Compliance standard being audited: ISO42001, GDPR, SOC2, NIST_AI_RMF, EU_AI_ACT, ISO27001")] string standard,
        [Description("Workflow type: quarterly, annual, spot-check, full-audit")] string? type = null,
        [Description("Description of the audit scope and objectives")] string? description = null,
        [Description("AI system ID to audit (optional)")] string? aiSystemId = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.workflows
                  (id, name, standard, type, status, progress, agent_name, description, created_by, ai_system_id, created_at, updated_at)
                VALUES
                  (@Id, @Name, @Standard, @Type, 'pending', 0, 'MCP-AuditAgent', @Desc, @CreatedBy, @AiSystemId, NOW(), NOW())",
                new
                {
                    Id         = id,
                    Name       = name,
                    Standard   = standard,
                    Type       = type ?? "full-audit",
                    Desc       = description,
                    CreatedBy  = userEmail,
                    AiSystemId = aiSystemId
                });

            // Load steps from framework definition if available, else use default pipeline
            var fwSteps = (await db.QueryAsync($@"
                SELECT name, step_order, description
                FROM {sc}.framework_workflow_steps
                WHERE framework_code=@Standard AND is_active=true
                ORDER BY step_order", new { Standard = standard })).AsList();

            var steps = fwSteps.Any()
                ? fwSteps.Select(s => ((string)s.name, (int)s.step_order)).ToArray()
                : new[]
                  {
                      ("Evidence Collection", 1), ("Control Testing", 2), ("Gap Analysis", 3),
                      ("Report Generation", 4), ("Review & Sign-off", 5), ("Archive & Close", 6)
                  };

            foreach (var (stepName, order) in steps)
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.workflow_steps(id, workflow_id, name, step_order, status)
                    VALUES(gen_random_uuid()::VARCHAR, @WfId, @Name, @Order, 'pending')",
                    new { WfId = id, Name = stepName, Order = order });

            await WriteLog(db, sc, userEmail, "create_workflow",
                new { name, standard, type }, new { id, name, steps = steps.Length });

            return Json(new { success = true, workflow_id = id, message = $"Audit workflow '{name}' created for {standard} with {steps.Length} steps" });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_workflow",
                new { name, standard }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 5. Complete Workflow Step ────────────────────────────────────────────
    [McpServerTool, Description(
        "Mark a workflow step as completed with optional notes. " +
        "Use when the user says 'complete step X of workflow Y', 'mark evidence collection done', or advances through audit pipeline stages.")]
    public static async Task<string> clovrix_complete_workflow_step(
        IDbConnection db,
        [Description("Workflow ID")] string workflowId,
        [Description("Step name or step ID to complete (e.g. 'Evidence Collection')")] string stepNameOrId,
        [Description("Notes on what was done in this step")] string? notes = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            // Find by name or ID
            var step = await db.QueryFirstOrDefaultAsync($@"
                SELECT id, name, step_order, status
                FROM {sc}.workflow_steps
                WHERE workflow_id=@WfId AND (id=@Key OR LOWER(name)=LOWER(@Key))
                ORDER BY step_order LIMIT 1",
                new { WfId = workflowId, Key = stepNameOrId });

            if (step == null)
                return Json(new { success = false, error = $"Step '{stepNameOrId}' not found in workflow '{workflowId}'" });

            await db.ExecuteAsync($@"
                UPDATE {sc}.workflow_steps
                SET status='completed', completed_at=NOW(), notes=COALESCE(@Notes, notes), updated_at=NOW()
                WHERE id=@Id",
                new { Id = (string)step.id, Notes = notes });

            // Recalculate workflow progress
            var totalSteps = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflow_steps WHERE workflow_id=@Id", new { Id = workflowId });
            var doneSteps  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflow_steps WHERE workflow_id=@Id AND status='completed'", new { Id = workflowId });
            var progress   = totalSteps > 0 ? (int)Math.Round(doneSteps * 100.0 / totalSteps) : 0;

            await db.ExecuteAsync($@"
                UPDATE {sc}.workflows SET progress=@Progress, updated_at=NOW()
                WHERE id=@Id",
                new { Id = workflowId, Progress = progress });

            await WriteLog(db, sc, userEmail, "complete_workflow_step",
                new { workflow_id = workflowId, step_name = (string)step.name },
                new { progress, steps_done = doneSteps, steps_total = totalSteps });

            return Json(new { success = true, step_name = (string)step.name, progress, steps_done = doneSteps, steps_total = totalSteps,
                message = $"Step '{(string)step.name}' completed. Workflow is {progress}% done ({doneSteps}/{totalSteps} steps)." });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "complete_workflow_step",
                new { workflow_id = workflowId, step = stepNameOrId }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 6. Add Control Domain ────────────────────────────────────────────────
    [McpServerTool, Description(
        "Add a control domain (control group) to a compliance framework. " +
        "Domains organise controls into logical areas (e.g. 'Data Governance', 'Access Control'). " +
        "Use when the user says 'add a control domain', 'create a control group', or sets up framework structure.")]
    public static async Task<string> clovrix_add_control_domain(
        IDbConnection db,
        [Description("Framework code the domain belongs to: ISO42001, GDPR, SOC2, etc.")] string frameworkCode,
        [Description("Domain area name (e.g. 'Data Governance', 'Access Control')")] string area,
        [Description("Reference code for this domain (e.g. ISO42001-6, CC6)")] string refCode,
        [Description("Description of what this domain covers")] string? description = null,
        [Description("Initial risk level: critical, high, medium, low")] string riskLevel = "high",
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = $"{frameworkCode.ToUpper()}-{refCode.Replace(" ", "-").ToUpper()}-{Guid.NewGuid().ToString()[..4]}";
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.control_domains(id, standard, area, ref_code, description, score, status, risk_level)
                VALUES(@Id, @Standard, @Area, @RefCode, @Desc, 0, 'not-started', @RiskLevel)",
                new
                {
                    Id        = id,
                    Standard  = frameworkCode,
                    Area      = area,
                    RefCode   = refCode,
                    Desc      = description,
                    RiskLevel = riskLevel
                });

            await WriteLog(db, sc, userEmail, "add_control_domain",
                new { framework_code = frameworkCode, area, ref_code = refCode },
                new { id, area });

            return Json(new { success = true, domain_id = id, message = $"Control domain '{area}' ({refCode}) added to {frameworkCode}" });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "add_control_domain",
                new { framework_code = frameworkCode, area }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 7. Create Framework ──────────────────────────────────────────────────
    [McpServerTool, Description(
        "Register a new compliance framework in the platform. " +
        "Use when the user says 'add a framework', 'register ISO X', or wants to track a new compliance standard. " +
        "After creating a framework, use clovrix_add_control_domain to add its domains.")]
    public static async Task<string> clovrix_create_framework(
        IDbConnection db,
        [Description("Framework code — unique short identifier (e.g. ISO42001, NIST_CSF, HIPAA)")] string code,
        [Description("Full framework name")] string name,
        [Description("Short display name (3-15 chars, e.g. 'ISO 42001')")] string shortName,
        [Description("Framework category: ai_governance, security, privacy")] string category = "security",
        [Description("Accent color in hex (e.g. #6366f1)")] string color = "#6366f1",
        [Description("Framework description and scope")] string? description = null,
        [Description("Framework version (e.g. '2023')")] string? version = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.frameworks
                  (id, code, name, short_name, description, version, category, color, is_active, created_at, updated_at)
                VALUES
                  (@Id, @Code, @Name, @ShortName, @Desc, @Version, @Category, @Color, true, NOW(), NOW())",
                new { Id = id, Code = code, Name = name, ShortName = shortName, Desc = description, Version = version, Category = category, Color = color });

            // Insert default 6-step audit pipeline for the new framework
            string[] defaultSteps = ["Evidence Collection", "Control Testing", "Gap Analysis", "Report Generation", "Review & Sign-off", "Archive & Close"];
            for (var i = 0; i < defaultSteps.Length; i++)
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.framework_workflow_steps(id, framework_code, step_order, name)
                    VALUES(gen_random_uuid()::VARCHAR, @Code, @Order, @Name)",
                    new { Code = code, Order = i + 1, Name = defaultSteps[i] });

            await WriteLog(db, sc, userEmail, "create_framework",
                new { code, name, short_name = shortName }, new { id, code });

            return Json(new { success = true, framework_id = id, message = $"Framework '{name}' ({code}) registered with 6-step audit pipeline. Use clovrix_add_control_domain to add domains." });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_framework",
                new { code, name }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 8. Create Vendor ─────────────────────────────────────────────────────
    [McpServerTool, Description(
        "Add a new vendor to the vendor risk management register. " +
        "Use when the user says 'add a vendor', 'register a supplier', or a new third party needs risk assessment.")]
    public static async Task<string> clovrix_create_vendor(
        IDbConnection db,
        [Description("Vendor name")] string name,
        [Description("Vendor category: cloud_provider, data_processor, model_provider, SaaS, consulting, infrastructure")] string category,
        [Description("Risk tier: tier-1 (critical), tier-2 (important), tier-3 (standard)")] string riskTier,
        [Description("Criticality: critical, high, medium, low")] string criticality = "medium",
        [Description("Services or products provided")] string? services = null,
        [Description("Owner email (internal contact)")] string? ownerEmail = null,
        [Description("Vendor contact email")] string? contactEmail = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.vendors
                  (id, name, category, risk_tier, criticality, status, notes, owner_email, contact_email, created_at, updated_at)
                VALUES
                  (@Id, @Name, @Category, @RiskTier, @Criticality, 'active', @Notes, @OwnerEmail, @ContactEmail, NOW(), NOW())",
                new
                {
                    Id          = id,
                    Name        = name,
                    Category    = category,
                    RiskTier    = riskTier,
                    Criticality = criticality,
                    Notes       = services,
                    OwnerEmail  = ownerEmail,
                    ContactEmail= contactEmail
                });

            await WriteLog(db, sc, userEmail, "create_vendor",
                new { name, category, risk_tier = riskTier }, new { id, name });

            return Json(new { success = true, vendor_id = id, message = $"Vendor '{name}' registered ({riskTier}, {criticality} criticality)" });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_vendor",
                new { name, category }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 9. Create Governance Objective ──────────────────────────────────────
    [McpServerTool, Description(
        "Add a new AI governance objective to the platform. " +
        "Governance objectives define measurable goals for AI accountability, transparency, and fairness. " +
        "Use when the user says 'add a governance objective', 'create a governance goal', or tracks a policy commitment.")]
    public static async Task<string> clovrix_create_governance_objective(
        IDbConnection db,
        [Description("Objective title")] string title,
        [Description("Governance pillar: fairness, transparency, accountability, safety, privacy, robustness")] string pillar,
        [Description("Detailed description of the objective and success criteria")] string description,
        [Description("Target date to achieve this objective (ISO format)")] string? targetDate = null,
        [Description("Quarter label (e.g. Q3-2025)")] string? quarter = null,
        [Description("Owner email responsible for this objective")] string? ownerEmail = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.governance_objectives
                  (id, title, pillar, description, owner_email, status, target_date, quarter, created_at, updated_at)
                VALUES
                  (@Id, @Title, @Pillar, @Desc, @OwnerEmail, 'on-track', @TargetDate::date, @Quarter, NOW(), NOW())",
                new
                {
                    Id         = id,
                    Title      = title,
                    Pillar     = pillar,
                    Desc       = description,
                    OwnerEmail = ownerEmail,
                    TargetDate = targetDate,
                    Quarter    = quarter
                });

            await WriteLog(db, sc, userEmail, "create_governance_objective",
                new { title, pillar }, new { id, title });

            return Json(new { success = true, objective_id = id, message = $"Governance objective '{title}' created ({pillar} pillar)" });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_governance_objective",
                new { title, pillar }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 10. Run Gap Analysis ─────────────────────────────────────────────────
    [McpServerTool, Description(
        "Run a gap analysis for a compliance framework against current control status. " +
        "Analyses domains and controls, auto-generates findings for non-compliant controls, returns compliance score. " +
        "Use when the user says 'run a gap analysis', 'analyze compliance gaps', or 'assess control coverage for X'.")]
    public static async Task<string> clovrix_run_gap_analysis(
        IDbConnection db,
        [Description("Framework code: ISO42001, GDPR, SOC2, NIST_AI_RMF, EU_AI_ACT, ISO27001")] string framework,
        [Description("Workflow ID to tag generated findings against (optional)")] string? workflowId = null,
        [Description("AI system ID to analyze (optional)")] string? aiSystemId = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            // Get all controls for this framework via domain's standard column
            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref, c.title, c.status,
                       d.id AS domain_id, d.area AS domain, d.ref_code AS domain_ref
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON c.domain_id=d.id
                WHERE d.standard=@Framework",
                new { Framework = framework });

            var ctrlList  = controls.AsList();
            var compliant = ctrlList.Count(c => (string)c.status == "compliant");
            var total     = ctrlList.Count;
            var score     = total > 0 ? (int)Math.Round((double)compliant / total * 100) : 0;

            // Auto-create findings for non-compliant controls (cap at 10)
            var gaps = ctrlList.Where(c => (string)c.status != "compliant").ToList();
            var autoCreated = 0;
            foreach (var gap in gaps.Take(10))
            {
                var existingCount = await db.QuerySingleAsync<int>($@"
                    SELECT COUNT(*) FROM {sc}.findings
                    WHERE control_id=@CtrlId AND status NOT IN ('resolved','closed')",
                    new { CtrlId = (string)gap.id });
                if (existingCount == 0)
                {
                    await db.ExecuteAsync($@"
                        INSERT INTO {sc}.findings
                          (id, title, description, standard, severity, status, source, ai_generated,
                           domain_id, control_id, workflow_id, ai_system_id, created_by, created_at, updated_at)
                        VALUES
                          (gen_random_uuid()::VARCHAR,
                           @Title, @Desc, @Standard, 'medium', 'open', 'gap_analysis', true,
                           @DomainId, @ControlId, @WorkflowId, @AiSystemId, @CreatedBy, NOW(), NOW())",
                        new
                        {
                            Title      = $"Gap: {(string)gap.title} ({(string)gap.status})",
                            Desc       = $"Gap analysis identified control in domain {(string)gap.domain_ref} as '{(string)gap.status}' for {framework}.",
                            Standard   = framework,
                            DomainId   = (string)gap.domain_id,
                            ControlId  = (string)gap.id,
                            WorkflowId = workflowId,
                            AiSystemId = aiSystemId,
                            CreatedBy  = $"gap-analysis:{userEmail}"
                        });
                    autoCreated++;
                }
            }

            var result = new
            {
                framework,
                ai_system_id       = aiSystemId,
                workflow_id        = workflowId,
                total_controls     = total,
                compliant,
                gaps               = gaps.Count,
                compliance_score   = score,
                findings_generated = autoCreated
            };

            await WriteLog(db, sc, userEmail, "run_gap_analysis",
                new { framework, ai_system_id = aiSystemId },
                new { score, findings_generated = autoCreated });

            return Json(new
            {
                success  = true,
                message  = $"Gap analysis for {framework}: {score}% compliant. {gaps.Count} gaps found. {autoCreated} findings auto-logged.",
                analysis = result
            });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "run_gap_analysis",
                new { framework, ai_system_id = aiSystemId }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }

    // ── 11. Create Policy ────────────────────────────────────────────────────
    [McpServerTool, Description(
        "Create a new governance policy or AI policy document in the platform. " +
        "Use when the user says 'create a policy', 'draft an AI governance policy', or needs to track a new policy document.")]
    public static async Task<string> clovrix_create_policy(
        IDbConnection db,
        [Description("Policy title")] string title,
        [Description("Category: ai_governance, data_privacy, security, operational, hr")] string category,
        [Description("Policy content or summary")] string? content = null,
        [Description("Owner email responsible for this policy")] string? ownerEmail = null,
        [Description("Policy version (default 1.0)")] string version = "1.0",
        [Description("Effective date in ISO format")] string? effectiveDate = null,
        [Description("Review date in ISO format")] string? reviewDate = null,
        [Description("User email performing this action")] string userEmail = "mcp-user",
        [Description("Tenant ID (default: demo)")] string? tenant = null)
    {
        var sc = Sc(tenant);
        db.Open();
        try
        {
            var id = Guid.NewGuid().ToString();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.policies
                  (id, title, category, version, status, content, owner_email,
                   effective_date, review_date, created_at, updated_at)
                VALUES
                  (@Id, @Title, @Category, @Version, 'draft', @Content, @OwnerEmail,
                   @EffectiveDate::date, @ReviewDate::date, NOW(), NOW())",
                new
                {
                    Id            = id,
                    Title         = title,
                    Category      = category,
                    Version       = version,
                    Content       = content,
                    OwnerEmail    = ownerEmail,
                    EffectiveDate = effectiveDate,
                    ReviewDate    = reviewDate
                });

            await WriteLog(db, sc, userEmail, "create_policy",
                new { title, category, version }, new { id, title });

            return Json(new { success = true, policy_id = id, message = $"Policy '{title}' created (status: draft). Use approval workflow to publish." });
        }
        catch (Exception ex)
        {
            await WriteLog(db, sc, userEmail, "create_policy",
                new { title, category }, null, "mcp", "failed", ex.Message);
            return Json(new { success = false, error = ex.Message });
        }
        finally { db.Close(); }
    }
}
