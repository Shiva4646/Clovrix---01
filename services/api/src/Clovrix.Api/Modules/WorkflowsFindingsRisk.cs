using System.Data;
using Dapper;
using MassTransit;
using Minio;
using Minio.DataModel.Args;
using StackExchange.Redis;
using Clovrix.Api.Messages;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOWS
// ══════════════════════════════════════════════════════════════════════════════
public static class WorkflowsModule
{
    public static WebApplication MapWorkflowsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/workflows").WithTags("Workflows");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db, string? status = null, string? standard = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var filters = new List<string>();
            if (status   != null) filters.Add("status=@Status");
            if (standard != null) filters.Add("standard=@Standard");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";
            var rows  = await db.QueryAsync($"SELECT * FROM {sc}.workflows {where} ORDER BY created_at DESC",
                new { Status = status, Standard = standard });
            return Results.Ok(rows);
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();

            // Workflow with system name
            var wf = await db.QueryFirstOrDefaultAsync($@"
                SELECT w.*, s.name AS system_name
                FROM {sc}.workflows w
                LEFT JOIN {sc}.ai_systems s ON w.ai_system_id = s.id
                WHERE w.id = @Id", new { Id = id });
            if (wf == null) return Results.NotFound();

            var standard    = (string)wf.standard;
            var aiSystemId  = (string?)wf.ai_system_id;

            // Steps
            var steps = await db.QueryAsync(
                $"SELECT * FROM {sc}.workflow_steps WHERE workflow_id=@Id ORDER BY step_order",
                new { Id = id });

            // Evidence: linked to this workflow directly, OR controls in the same standard
            var evidence = await db.QueryAsync($@"
                SELECT e.*, c.ref AS control_ref, c.title AS control_title,
                            d.area AS domain_name
                FROM {sc}.evidence e
                LEFT JOIN {sc}.controls c          ON e.control_id = c.id
                LEFT JOIN {sc}.control_domains d   ON d.id = COALESCE(e.domain_id, c.domain_id)
                WHERE e.workflow_id = @Id
                   OR (d.standard = @Std AND @Std IS NOT NULL)
                ORDER BY e.created_at DESC
                LIMIT 50",
                new { Id = id, Std = standard });

            // Findings: linked to this workflow OR same standard
            var findings = await db.QueryAsync($@"
                SELECT f.*
                FROM {sc}.findings f
                WHERE f.workflow_id = @Id
                   OR f.standard = @Std
                ORDER BY
                  CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                  f.created_at DESC
                LIMIT 50",
                new { Id = id, Std = standard });

            // Controls being tested (from the workflow's framework)
            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref, c.title, c.status, c.description,
                       d.area AS domain_name, d.standard, d.ref_code AS domain_ref
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON c.domain_id = d.id
                WHERE d.standard = @Std
                ORDER BY d.id, c.ref
                LIMIT 60",
                new { Std = standard });

            return Results.Ok(new { workflow = wf, steps, evidence, findings, controls });
        });

        g.MapPost("/", async (CreateWorkflowReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var id    = Helpers.NewId();
            db.Open();

            await db.ExecuteAsync($@"
                INSERT INTO {sc}.workflows(id,name,standard,type,status,progress,agent_name,description,scheduled_at,created_by,ai_system_id)
                VALUES(@Id,@Name,@Standard,@Type,'pending',0,@Agent,@Desc,@Scheduled,@CreatedBy,@AiSystemId)",
                new { Id = id, req.Name, req.Standard, Type = req.Type ?? "full-audit",
                      Agent = req.AgentName ?? "AuditAgent-Alpha", Desc = req.Description,
                      Scheduled = req.ScheduledAt, CreatedBy = email, AiSystemId = req.AiSystemId });

            // Always seed the 6 system steps. Then slot any custom steps from the
            // framework between step 2 (Control Testing) and step 3 (Gap Analysis).
            var systemDefaults = new[]
            {
                (1,"Evidence Collection","evidence_collection","Gather all required evidence"),
                (2,"Control Testing",    "control_testing",    "Test each control against evidence"),
                (3,"Gap Analysis",       "gap_analysis",       "AI-assisted gap identification"),
                (4,"Report Generation",  "report_generation",  "Generate draft audit report"),
                (5,"Review & Sign-off",  "review_signoff",     "Auditor review and sign-off"),
                (6,"Archive & Close",    "archive_close",      "Archive and close the audit cycle"),
            };

            // Load only custom steps from the framework (includes allow_file_upload flag)
            var customFwSteps = (await db.QueryAsync(
                $"SELECT name,description,COALESCE(allow_file_upload,false) AS allow_file_upload FROM {sc}.framework_workflow_steps WHERE framework_code=@Std AND step_type='custom' AND is_active=true ORDER BY step_order",
                new { Std = req.Standard })).ToList();

            // Build final ordered list: steps 1-2, then custom steps, then steps 3-6
            var finalSteps = new List<(int order, string name, string type, string desc, bool allowUpload)>();
            foreach (var (order, name, stype, desc) in systemDefaults)
            {
                bool sysUpload = stype == "evidence_collection"; // Step 1 always allows upload
                if (order <= 2)
                    finalSteps.Add((order, name, stype, desc, sysUpload));
            }
            int customOrder = 3;
            foreach (var cs in customFwSteps)
                finalSteps.Add((customOrder++, (string)cs.name, "custom", (string)(cs.description ?? string.Empty), (bool)cs.allow_file_upload));
            foreach (var (order, name, stype, desc) in systemDefaults)
            {
                if (order >= 3)
                    finalSteps.Add((customOrder++, name, stype, desc, false));
            }

            foreach (var (order, name, stype, desc, allowUpload) in finalSteps)
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.workflow_steps(id,workflow_id,name,description,step_order,step_type,status,allow_file_upload)
                    VALUES(gen_random_uuid()::VARCHAR,@WfId,@Name,@Desc,@Order,@Type,'pending',@AllowUpload)",
                    new { WfId = id, Name = name, Desc = desc, Order = order, Type = stype, AllowUpload = allowUpload });

            await Helpers.Log(db, sc, email, "workflow.created", "workflows", id, new { name = req.Name });
            return Results.Created($"/api/workflows/{id}", new { id });
        });

        g.MapPut("/{id}/start", async (string id, HttpContext ctx, IDbConnection db, IBus bus) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var wf = await db.QueryFirstOrDefaultAsync($"SELECT standard FROM {sc}.workflows WHERE id=@Id", new { Id = id });
            if (wf == null) return Results.NotFound();

            await db.ExecuteAsync($@"
                UPDATE {sc}.workflows SET status='running',started_at=NOW(),progress=5,updated_at=NOW() WHERE id=@Id", new { Id = id });
            await db.ExecuteAsync($@"
                UPDATE {sc}.workflow_steps SET status='running',started_at=NOW() WHERE workflow_id=@Id AND step_order=1", new { Id = id });

            await bus.Publish(new WorkflowStartedEvent(id, sc, (string)wf.standard));
            await Helpers.Log(db, sc, email, "workflow.started", "workflows", id);
            return Results.Ok(new { message = "Workflow started" });
        });

        g.MapPut("/{id}/cancel", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($"UPDATE {sc}.workflows SET status='cancelled',updated_at=NOW() WHERE id=@Id", new { Id = id });
            return Results.Ok(new { message = "Workflow cancelled" });
        });

        // ── Complete current running step → auto-advance to next ─────────────
        g.MapPut("/{id}/steps/complete", async (string id, CompleteStepReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            // Find the currently running step (or specific stepId if provided)
            dynamic? currentStep;
            if (!string.IsNullOrEmpty(req.StepId))
                currentStep = await db.QueryFirstOrDefaultAsync(
                    $"SELECT * FROM {sc}.workflow_steps WHERE id=@StepId AND workflow_id=@WfId",
                    new { StepId = req.StepId, WfId = id });
            else
                currentStep = await db.QueryFirstOrDefaultAsync(
                    $"SELECT * FROM {sc}.workflow_steps WHERE workflow_id=@Id AND status='running' ORDER BY step_order LIMIT 1",
                    new { Id = id });

            if (currentStep == null)
                return Results.BadRequest(new { error = "No running step found" });

            int currentOrder = (int)currentStep.step_order;

            // Mark current step completed
            await db.ExecuteAsync($@"
                UPDATE {sc}.workflow_steps
                SET status='completed', completed_at=NOW(),
                    notes=COALESCE(@Notes, notes), updated_at=NOW()
                WHERE id=@StepId",
                new { StepId = (string)currentStep.id, Notes = req.Notes });

            // Find next step
            var nextStep = await db.QueryFirstOrDefaultAsync(
                $"SELECT * FROM {sc}.workflow_steps WHERE workflow_id=@Id AND step_order=@Next",
                new { Id = id, Next = currentOrder + 1 });

            int totalSteps = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {sc}.workflow_steps WHERE workflow_id=@Id", new { Id = id });

            bool workflowDone = nextStep == null;
            int  newProgress  = workflowDone ? 100 : (int)Math.Round(currentOrder * 100.0 / totalSteps);

            if (!workflowDone && nextStep != null)
            {
                await db.ExecuteAsync($@"
                    UPDATE {sc}.workflow_steps
                    SET status='running', started_at=NOW(), updated_at=NOW()
                    WHERE id=@NextId",
                    new { NextId = (string)nextStep.id });

                await db.ExecuteAsync($@"
                    UPDATE {sc}.workflows
                    SET progress=@Progress, updated_at=NOW()
                    WHERE id=@Id",
                    new { Progress = newProgress, Id = id });
            }
            else
            {
                // All steps done → complete workflow
                await db.ExecuteAsync($@"
                    UPDATE {sc}.workflows
                    SET status='completed', progress=100, completed_at=NOW(), updated_at=NOW()
                    WHERE id=@Id",
                    new { Id = id });
            }

            await Helpers.Log(db, sc, email, "workflow.step.completed", "workflows", id,
                new { step = currentOrder, step_name = (string)currentStep.name, notes = req.Notes });

            return Results.Ok(new
            {
                message          = workflowDone ? "Workflow completed" : $"Step {currentOrder} completed",
                step_completed   = currentOrder,
                next_step        = nextStep != null ? (int?)((int)nextStep.step_order) : null,
                next_step_name   = nextStep != null ? (string?)((string)nextStep.name) : null,
                workflow_done    = workflowDone,
                progress         = workflowDone ? 100 : newProgress,
            });
        });

        // ── Update individual step status/notes (manual pipeline) ────────────
        g.MapPut("/{id}/steps/{stepId}", async (string id, string stepId, StepUpdateReq req,
            HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            var step = await db.QueryFirstOrDefaultAsync(
                $"SELECT * FROM {sc}.workflow_steps WHERE id=@StepId AND workflow_id=@WfId",
                new { StepId = stepId, WfId = id });
            if (step == null) return Results.NotFound();

            var newStatus = req.Status ?? (string)step.status;

            await db.ExecuteAsync($@"
                UPDATE {sc}.workflow_steps SET
                    status      = @Status,
                    notes       = COALESCE(@Notes, notes),
                    started_at  = CASE WHEN @Status='running'   AND started_at   IS NULL THEN NOW() ELSE started_at   END,
                    completed_at= CASE WHEN @Status='completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                    updated_at  = NOW()
                WHERE id=@StepId",
                new { StepId = stepId, Status = newStatus, Notes = req.Notes });

            // Recalculate progress
            var totalSteps = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {sc}.workflow_steps WHERE workflow_id=@Id", new { Id = id });
            var doneSteps  = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {sc}.workflow_steps WHERE workflow_id=@Id AND status='completed'", new { Id = id });
            var allDone    = doneSteps == totalSteps;
            var progress   = totalSteps > 0 ? (int)Math.Round(doneSteps * 100.0 / totalSteps) : 0;

            await db.ExecuteAsync($@"
                UPDATE {sc}.workflows SET
                    progress   = @Progress,
                    status     = CASE WHEN @AllDone THEN 'completed' ELSE status END,
                    completed_at = CASE WHEN @AllDone AND completed_at IS NULL THEN NOW() ELSE completed_at END,
                    updated_at = NOW()
                WHERE id=@Id",
                new { Id = id, Progress = progress, AllDone = allDone });

            await Helpers.Log(db, sc, email, "workflow.step.updated", "workflows", id,
                new { stepId, status = newStatus, notes = req.Notes });

            return Results.Ok(new { message = "Step updated", status = newStatus, progress, workflow_done = allDone });
        });

        // ── AI Gap Analysis for a workflow ────────────────────────────────────
        g.MapPost("/{id}/gap-analysis", async (string id, GapAnalysisReq req, HttpContext ctx,
            IDbConnection db, AppConfig cfg, IHttpClientFactory http) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            var wf = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.workflows WHERE id=@Id", new { Id = id });
            if (wf == null) return Results.NotFound();

            // Gather context from DB
            var standard = (string)wf.standard;
            var aiSystemId = (string?)wf.ai_system_id;

            var controls = await db.QueryAsync($@"
                SELECT c.ref AS control_ref, c.title, c.status, c.description
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON c.domain_id = d.id
                WHERE d.standard = @Std
                LIMIT 20", new { Std = standard });

            var evidence = await db.QueryAsync($@"
                SELECT filename, control_id FROM {sc}.evidence
                WHERE workflow_id=@Id LIMIT 10", new { Id = id });

            string sysContext = "";
            if (!string.IsNullOrEmpty(aiSystemId))
            {
                var sys = await db.QueryFirstOrDefaultAsync(
                    $"SELECT name,risk_class,lifecycle_stage,use_cases FROM {sc}.ai_systems WHERE id=@Id OR system_id=@Id",
                    new { Id = aiSystemId });
                if (sys != null)
                    sysContext = $"\nAI System: {sys.name} | Risk: {sys.risk_class} | Stage: {sys.lifecycle_stage}\nUse cases: {sys.use_cases}";
            }

            var controlsList = string.Join("\n", ((IEnumerable<dynamic>)controls).Select(c =>
                $"- [{c.control_ref}] {c.title} (status: {c.status})"));

            var evidenceList = ((IEnumerable<dynamic>)evidence).Any()
                ? string.Join(", ", ((IEnumerable<dynamic>)evidence).Select(e => (string)e.filename))
                : "No evidence uploaded yet";

            var domainFilter = req.Domain ?? "all";
            var prompt = $@"You are a compliance gap analysis expert for {standard}.
{sysContext}
Existing Controls ({standard}):
{(controlsList.Length > 0 ? controlsList : "No controls defined yet")}
Uploaded Evidence: {evidenceList}
Domain filter: {domainFilter}

Perform a gap analysis and return:
1. Top 3 control gaps (specific control references and what is missing)
2. For each gap: specific remediation steps (2-3 steps max)
3. Estimated effort in days
4. Evidence sufficiency score 0-100

Be specific, reference regulation articles/clauses, and prioritise by business impact.
Format as structured analysis with clear sections.";

            string reply;
            try
            {
                var payload = System.Text.Json.JsonSerializer.Serialize(new
                {
                    model    = cfg.OllamaModel,
                    messages = new[] { new { role = "user", content = prompt } },
                    stream   = false,
                    options  = new { temperature = 0.3, num_predict = 600 }
                });
                using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(3));
                var client = http.CreateClient("ollama");
                client.Timeout = TimeSpan.FromMinutes(3);
                var res  = await client.PostAsync("/api/chat",
                    new System.Net.Http.StringContent(payload, System.Text.Encoding.UTF8, "application/json"), cts.Token);
                var body = await res.Content.ReadAsStringAsync();
                var doc  = System.Text.Json.JsonDocument.Parse(body);
                reply    = doc.RootElement.GetProperty("message").GetProperty("content").GetString() ?? "No response from AI";
            }
            catch (Exception ex)
            {
                reply = $"Gap analysis unavailable (Ollama offline). Manual review required.\n\nCommon gaps for {standard}:\n• Risk classification documentation\n• Explainability reports for automated decisions\n• Human oversight mechanism design\n• Data quality and lineage records\n\nError: {ex.Message}";
            }

            // ── Auto-create findings for non-compliant controls ───────────────
            var gapStep = await db.QueryFirstOrDefaultAsync(
                $"SELECT id FROM {sc}.workflow_steps WHERE workflow_id=@Id AND name ILIKE '%gap%' LIMIT 1",
                new { Id = id });
            var gapStepId = gapStep != null ? (string?)((string)gapStep.id) : null;

            var nonCompliantControls = ((IEnumerable<dynamic>)controls)
                .Where(c => (string)c.status is not ("pass" or "implemented" or "compliant"))
                .ToList();

            int autoCreated = 0;
            foreach (var ctrl in nonCompliantControls)
            {
                // Skip if finding already exists for this control+workflow
                var exists = await db.QuerySingleAsync<int>($@"
                    SELECT COUNT(*) FROM {sc}.findings
                    WHERE workflow_id=@WfId AND control_ref=@Ref AND source='gap-analysis'",
                    new { WfId = id, Ref = (string)ctrl.control_ref });
                if (exists > 0) continue;

                var fid = Helpers.NewId();
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.findings
                      (id, title, description, standard, severity, status, source, ai_generated,
                       workflow_id, step_id, control_ref, created_by, created_at, updated_at)
                    VALUES
                      (gen_random_uuid()::VARCHAR,
                       @Title, @Desc, @Standard, 'medium', 'open', 'gap_analysis', true,
                       @WorkflowId, @StepId, @ControlRef, @CreatedBy, NOW(), NOW())",
                    new
                    {
                        Title      = $"Gap: {(string)ctrl.control_ref} — {(string)ctrl.title}",
                        Desc       = $"Gap analysis identified control in domain {(string)ctrl.domain_ref} as '{(string)ctrl.status}' for {standard}.",
                        Standard   = standard,
                        WorkflowId = id,
                        StepId     = gapStepId,
                        ControlRef = (string)ctrl.control_ref,
                        CreatedBy  = $"gap-analysis:{email}"
                    });
                autoCreated++;
            }

            // Save analysis to workflow notes
            await db.ExecuteAsync($@"
                UPDATE {sc}.workflows SET description=CONCAT(COALESCE(description,''),' | Gap analysis run: ',NOW()::text),updated_at=NOW()
                WHERE id=@Id", new { Id = id });

            await Helpers.Log(db, sc, email, "workflow.gap-analysis.run", "workflows", id,
                new { standard, domain = domainFilter, auto_findings = autoCreated });

            return Results.Ok(new
            {
                workflow_id      = id,
                standard,
                domain           = domainFilter,
                analysis         = reply,
                generated_at     = DateTime.UtcNow,
                controls_count   = ((IEnumerable<dynamic>)controls).Count(),
                evidence_count   = ((IEnumerable<dynamic>)evidence).Count(),
                auto_findings    = autoCreated,
                non_compliant    = nonCompliantControls.Count,
            });
        });

        // ── List all evidence for a workflow ──────────────────────────────────
        g.MapGet("/{id}/evidence", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var evidence = await db.QueryAsync($@"
                SELECT e.*, c.ref AS control_ref, c.title AS control_title
                FROM {sc}.evidence e
                LEFT JOIN {sc}.controls c ON c.id = e.control_id
                WHERE e.workflow_id = @Id
                ORDER BY e.created_at DESC",
                new { Id = id });
            return Results.Ok(evidence);
        });

        g.MapPut("/{id}/schedule", async (string id, ScheduleReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($"UPDATE {sc}.workflows SET scheduled_at=@At,recurrence=@Rec,updated_at=NOW() WHERE id=@Id",
                new { Id = id, At = req.ScheduledAt, Rec = req.Recurrence });
            if (req.Recurrence != null)
                Hangfire.RecurringJob.AddOrUpdate($"workflow-{id}", () => TriggerWorkflow(id, sc), req.Recurrence);
            return Results.Ok(new { message = "Workflow scheduled" });
        });

        return app;
    }

    public static async Task TriggerWorkflow(string workflowId, string schema)
    {
        // Called by Hangfire recurring job
    }

    record CreateWorkflowReq(string Name, string Standard, string? Type, string? AgentName,
        string? Description, DateTime? ScheduledAt, string? AiSystemId);
    record ScheduleReq(DateTime ScheduledAt, string? Recurrence);
    record CompleteStepReq(string? StepId, string? Notes);
    record StepUpdateReq(string? Status, string? Notes);
    record GapAnalysisReq(string? Domain, string? AiSystemId);
}

// ══════════════════════════════════════════════════════════════════════════════
// FINDINGS
// ══════════════════════════════════════════════════════════════════════════════
public static class FindingsModule
{
    public static WebApplication MapFindingsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/findings").WithTags("Findings");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db,
            string? severity = null, string? status = null, string? standard = null,
            string? domainId = null, string? controlId = null, string? aiSystemId = null,
            string? assignedTo = null, string? workflowId = null, string? stepId = null,
            int page = 1, int size = 50) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var f = new List<string>();
            if (severity   != null) f.Add("f.severity=@Severity");
            if (status     != null) f.Add("f.status=@Status");
            if (standard   != null) f.Add("f.standard=@Standard");
            if (domainId   != null) f.Add("f.domain_id=@DomainId");
            if (controlId  != null) f.Add("f.control_id=@ControlId");
            if (aiSystemId != null) f.Add("f.ai_system_id=@AiSystemId");
            if (assignedTo != null) f.Add("f.assigned_to=@AssignedTo");
            if (workflowId != null) f.Add("f.workflow_id=@WorkflowId");
            if (stepId     != null) f.Add("f.step_id=@StepId");
            var where = f.Any() ? "WHERE " + string.Join(" AND ", f) : "";
            var (offset, sz) = Pagination.Parse(page, size);
            var items = await db.QueryAsync($@"
                SELECT f.*,
                       d.area AS domain_name, d.ref_code AS domain_ref,
                       c.ref  AS control_ref_resolved, c.title AS control_title,
                       (SELECT COUNT(*) FROM {sc}.finding_files ff WHERE ff.finding_id=f.id) AS file_count,
                       (SELECT STRING_AGG(pu.full_name || ' <' || pu.email || '>', ', ' ORDER BY pu.full_name)
                        FROM {sc}.finding_assignees fa
                        JOIN {sc}.platform_users pu ON pu.id = fa.user_id
                        WHERE fa.finding_id = f.id) AS assignees_names,
                       (SELECT COUNT(*) FROM {sc}.finding_assignees fa WHERE fa.finding_id = f.id) AS assignees_count
                FROM {sc}.findings f
                LEFT JOIN {sc}.control_domains d ON f.domain_id = d.id
                LEFT JOIN {sc}.controls c        ON f.control_id = c.id
                {where}
                ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                         f.created_at DESC LIMIT @Sz OFFSET @Off",
                new { Severity = severity, Status = status, Standard = standard,
                      DomainId = domainId, ControlId = controlId, AiSystemId = aiSystemId,
                      AssignedTo = assignedTo, WorkflowId = workflowId, StepId = stepId,
                      Sz = sz, Off = offset });
            var total = await db.QuerySingleAsync<int>($@"
                SELECT COUNT(*) FROM {sc}.findings f {where}",
                new { Severity = severity, Status = status, Standard = standard,
                      DomainId = domainId, ControlId = controlId, AiSystemId = aiSystemId,
                      AssignedTo = assignedTo, WorkflowId = workflowId, StepId = stepId });
            return Results.Ok(Pagination.Of(items, total, page, sz));
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var finding = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.findings WHERE id=@Id", new { Id = id });
            if (finding == null) return Results.NotFound();
            var remediation = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.remediations WHERE finding_id=@Id", new { Id = id });
            return Results.Ok(new { finding, remediation });
        });

        g.MapPost("/", async (CreateFindingReq req, HttpContext ctx, IDbConnection db, IBus bus) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var id    = Helpers.NewId();
            db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.findings(id,domain_id,control_id,control_ref,workflow_id,step_id,standard,
                    title,description,severity,status,source,ai_generated,assigned_to,
                    ai_system_id,due_date,created_by)
                VALUES(@Id,@DomainId,@ControlId,@ControlRef,@WorkflowId,@StepId,@Standard,
                    @Title,@Desc,@Sev,'open',@Source,@AiGen,@AssignedTo,
                    @SysId,@Due,@CreatedBy)",
                new { Id = id, req.DomainId, ControlId = req.ControlId,
                      ControlRef = req.ControlRef,
                      WorkflowId = req.WorkflowId, StepId = req.StepId,
                      Standard = req.Standard ?? "ISO42001",
                      req.Title, Desc = req.Description, Sev = req.Severity ?? "medium",
                      Source = req.Source ?? "manual", AiGen = req.AiGenerated ?? false,
                      AssignedTo = req.AssignedTo,
                      SysId = string.IsNullOrEmpty(req.AiSystemId) ? (string?)null : req.AiSystemId,
                      Due = req.DueDate, CreatedBy = email });

            if (req.DomainId != null)
                await db.ExecuteAsync($"UPDATE {sc}.control_domains SET findings_count=findings_count+1 WHERE id=@Id", new { Id = req.DomainId });

            // Auto-create remediation for critical/high
            if (req.Severity is "critical" or "high")
            {
                var remId = Helpers.NewId();
                var slaDays = req.Severity == "critical" ? 7 : 14;
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.remediations(id,finding_id,title,priority,status,assigned_to,assigned_by,due_date,sla_days)
                    VALUES(@Id,@FindingId,@Title,@Priority,'open',@AssignedTo,@AssignedBy,@Due,@Sla)",
                    new { Id = remId, FindingId = id, Title = $"Remediate: {req.Title}",
                          Priority = req.Severity, AssignedTo = req.AssignedTo, AssignedBy = email,
                          Due = DateTime.UtcNow.AddDays(slaDays), Sla = slaDays });

                if (!string.IsNullOrEmpty(req.AssignedTo))
                    await bus.Publish(new SendNotificationEvent(req.AssignedTo,
                        $"[Clovrix] {req.Severity!.ToUpper()} Finding Assigned: {req.Title}",
                        $"<p>A {req.Severity} finding has been assigned to you in Clovrix.</p><p><strong>{req.Title}</strong></p><p>Due: {DateTime.UtcNow.AddDays(slaDays):yyyy-MM-dd}</p>",
                        "finding_assigned"));
            }

            await Helpers.Log(db, sc, email, "finding.created", "findings", id, new { severity = req.Severity });
            return Results.Created($"/api/findings/{id}", new { id });
        });

        g.MapPut("/{id}", async (string id, UpdateFindingReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.findings SET
                    title            = COALESCE(@Title, title),
                    description      = COALESCE(@Desc, description),
                    severity         = COALESCE(@Severity, severity),
                    status           = COALESCE(@Status, status),
                    assigned_to      = COALESCE(@AssignedTo, assigned_to),
                    due_date         = COALESCE(@DueDate, due_date),
                    mitigation_plan  = COALESCE(@MitigationPlan, mitigation_plan),
                    mitigation_due   = COALESCE(@MitigationDue, mitigation_due),
                    closed_at        = CASE WHEN @Status IN ('resolved','accepted') AND closed_at IS NULL THEN NOW() ELSE closed_at END,
                    updated_at       = NOW()
                WHERE id = @Id",
                new { Id = id, req.Title, Desc = req.Description,
                      req.Severity, req.Status, req.AssignedTo, req.DueDate,
                      req.MitigationPlan, req.MitigationDue });
            await Helpers.Log(db, sc, email, "finding.updated", "findings", id, new { status = req.Status });
            return Results.Ok(new { message = "Finding updated" });
        });

        // ── Get files for a finding ───────────────────────────────────────────
        g.MapGet("/{id}/files", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var files = await db.QueryAsync(
                $"SELECT * FROM {sc}.finding_files WHERE finding_id=@Id ORDER BY created_at DESC",
                new { Id = id });
            return Results.Ok(files);
        });

        // ── Upload file attachment to a finding ───────────────────────────────
        g.MapPost("/{id}/files", async (string id, HttpContext ctx, IDbConnection db,
            IMinioClient minio, IFormFile file,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? purpose) =>
        {
            var sc     = Helpers.Schema(ctx);
            var email  = Helpers.UserEmail(ctx);
            var purp   = purpose ?? "evidence";
            var fileId = Helpers.NewId();
            var ext    = Path.GetExtension(file.FileName);
            var tenantId = sc.Replace("tenant_", "");
            var bucket = $"findings-{tenantId}";
            var storKey = $"{id}/{fileId}{ext}";

            // Ensure bucket exists and upload
            string? uploadedKey = null;
            try
            {
                var bucketExists = await minio.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket));
                if (!bucketExists) await minio.MakeBucketAsync(new MakeBucketArgs().WithBucket(bucket));

                byte[] fb; using (var t = new System.IO.MemoryStream()) { await file.CopyToAsync(t); fb = t.ToArray(); }
                if (fb.Length > 0)
                {
                    using var stream = new System.IO.MemoryStream(fb);
                    await minio.PutObjectAsync(new PutObjectArgs()
                        .WithBucket(bucket).WithObject(storKey)
                        .WithStreamData(stream).WithObjectSize((long)fb.Length)
                        .WithContentType(file.ContentType ?? "application/octet-stream"));
                }
                uploadedKey = storKey;
            }
            catch { /* MinIO unavailable — store metadata only */ }

            db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.finding_files(id,finding_id,filename,original_name,file_size,mime_type,storage_key,uploaded_by,purpose)
                VALUES(@Id,@FindingId,@Filename,@OrigName,@Size,@Mime,@Key,@By,@Purpose)",
                new { Id = fileId, FindingId = id,
                      Filename     = uploadedKey ?? file.FileName,
                      OrigName     = file.FileName,
                      Size         = file.Length,
                      Mime         = file.ContentType,
                      Key          = uploadedKey,
                      By           = email,
                      Purpose      = purp });

            await Helpers.Log(db, sc, email, "finding.file.uploaded", "findings", id,
                new { filename = file.FileName, purpose = purp });

            return Results.Ok(new { id = fileId, filename = file.FileName, purpose = purp });
        }).DisableAntiforgery();

        // ── Request exception for a finding ──────────────────────────────────
        g.MapPost("/{id}/exception", async (string id, ExceptionReq req, HttpContext ctx, IDbConnection db, IBus bus) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var finding = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.findings WHERE id=@Id", new { Id = id });
            if (finding == null) return Results.NotFound();

            await db.ExecuteAsync($@"
                UPDATE {sc}.findings SET
                    status                   = 'exception-requested',
                    exception_status         = 'pending',
                    exception_reason         = @Reason,
                    exception_requested_by   = @Email,
                    exception_approver_id    = @ApproverId,
                    exception_approver_email = @ApproverEmail,
                    mitigation_plan          = COALESCE(@MitigationPlan, mitigation_plan),
                    mitigation_due           = COALESCE(@MitigationDue, mitigation_due),
                    updated_at               = NOW()
                WHERE id = @Id",
                new { Id = id, Reason = req.Reason, Email = email,
                      ApproverId = req.ApproverId, ApproverEmail = req.ApproverEmail,
                      MitigationPlan = req.MitigationPlan, MitigationDue = req.MitigationDue });

            await Helpers.Log(db, sc, email, "finding.exception.requested", "findings", id,
                new { reason = req.Reason });

            return Results.Ok(new { message = "Exception requested — awaiting reviewer approval" });
        });


        // ── Approve / Reject exception ────────────────────────────────────────
        g.MapPut("/{id}/exception/{decision}", async (string id, string decision, ExceptionDecideReq req, HttpContext ctx, IDbConnection db, IBus bus) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var finding = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.findings WHERE id=@Id", new { Id = id });
            if (finding == null) return Results.NotFound();
            if (decision != "approve" && decision != "reject") return Results.BadRequest("decision must be approve or reject");

            var newStatus = decision == "approve" ? "accepted" : "open";
            var excStatus = decision == "approve" ? "approved" : "rejected";

            await db.ExecuteAsync($@"
                UPDATE {sc}.findings SET
                    status           = @Status,
                    exception_status = @ExcStatus,
                    exception_notes  = COALESCE(@Notes, exception_notes),
                    updated_at       = NOW()
                WHERE id = @Id",
                new { Id = id, Status = newStatus, ExcStatus = excStatus, Notes = req.Notes });

            await Helpers.Log(db, sc, email, $"finding.exception.{decision}d", "findings", id,
                new { decision, notes = req.Notes });

            return Results.Ok(new { message = $"Exception {decision}d" });
        });

        // ── Check findings for a workflow step ───────────────────────────────
        g.MapGet("/check-step/{workflowId}/{stepId}", async (string workflowId, string stepId, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var open = await db.QueryAsync($@"
                SELECT id, title, severity, status FROM {sc}.findings
                WHERE workflow_id=@W AND step_id=@S AND status NOT IN ('resolved','accepted')
                ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END",
                new { W = workflowId, S = stepId });
            var openList = open.ToList();
            return Results.Ok(new { findings = openList, open_findings = openList.Count, can_complete = openList.Count == 0 });
        });

        // ── User search (for assignee picker) ────────────────────────────────
        g.MapGet("/users/search", async (HttpContext ctx, IDbConnection db, string? q) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var like = $"%{q ?? ""}%";
            var users = await db.QueryAsync($@"
                SELECT id, full_name, email, role FROM {sc}.platform_users
                WHERE (full_name ILIKE @Q OR email ILIKE @Q) AND status='active'
                ORDER BY full_name LIMIT 20",
                new { Q = like });
            return Results.Ok(users);
        });

        // ── Finding assignees ─────────────────────────────────────────────────
        g.MapGet("/{id}/assignees", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var rows = await db.QueryAsync($@"
                SELECT pu.id, pu.full_name, pu.email, pu.role
                FROM {sc}.finding_assignees fa
                JOIN {sc}.platform_users pu ON pu.id = fa.user_id
                WHERE fa.finding_id = @Id
                ORDER BY pu.full_name",
                new { Id = id });
            return Results.Ok(rows);
        });

        g.MapPost("/{id}/assignees", async (string id, AssigneeReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.finding_assignees(finding_id, user_id)
                VALUES(@FindingId, @UserId)
                ON CONFLICT DO NOTHING",
                new { FindingId = id, UserId = req.UserId });
            await Helpers.Log(db, sc, email, "finding.assignee.added", "findings", id, new { userId = req.UserId });
            return Results.Ok(new { message = "Assignee added" });
        });

        g.MapDelete("/{id}/assignees/{userId}", async (string id, string userId, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($"DELETE FROM {sc}.finding_assignees WHERE finding_id=@F AND user_id=@U",
                new { F = id, U = userId });
            await Helpers.Log(db, sc, email, "finding.assignee.removed", "findings", id, new { userId });
            return Results.Ok(new { message = "Assignee removed" });
        });

        return app;
    }

    record CreateFindingReq(string Title, string? Description, string? Severity, string? Status,
        string? DomainId, string? ControlId, string? ControlRef, string? WorkflowId, string? StepId,
        string? Standard, string? Source, bool? AiGenerated, string? AssignedTo,
        string? AiSystemId, DateTime? DueDate);
    record UpdateFindingReq(string? Title, string? Description, string? Severity, string? Status,
        string? DomainId, string? ControlId, string? ControlRef, string? WorkflowId, string? StepId,
        string? Standard, string? AssignedTo, string? AiSystemId, DateTime? DueDate,
        string? MitigationPlan, DateTime? MitigationDue);
    record ExceptionReq(string Reason, string? MitigationPlan, DateTime? MitigationDue,
        string? ApproverId, string? ApproverEmail);
    record ExceptionDecideReq(string? Notes);
    record AssigneeReq(string UserId);
}
