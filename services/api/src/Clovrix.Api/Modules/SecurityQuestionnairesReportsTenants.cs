using Minio;
using Minio.DataModel.Args;
using System.Data;
using System.Text;
using System.Text.Json;
using Dapper;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY (Vulnerability + Pentest tracking)
// ══════════════════════════════════════════════════════════════════════════════
public static class SecurityModule
{
    public static WebApplication MapSecurityModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/security").WithTags("Security");

        g.MapGet("/vulnerabilities", async (HttpContext ctx, IDbConnection db,
            string? severity = null, string? status = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var f = new List<string>();
            if (severity != null) f.Add("v.severity=@Severity");
            if (status   != null) f.Add("v.status=@Status");
            var where = f.Any() ? "WHERE " + string.Join(" AND ", f) : "";
            var rows = await db.QueryAsync($@"
                SELECT v.*, s.type as scan_type, s.scanner
                FROM {sc}.vulnerabilities v LEFT JOIN {sc}.security_scans s ON v.scan_id=s.id
                {where} ORDER BY v.cvss_score DESC NULLS LAST, v.severity DESC",
                new { Severity = severity, Status = status });
            return Results.Ok(rows);
        });

        g.MapGet("/stats", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            return Results.Ok(new
            {
                critical    = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vulnerabilities WHERE severity='critical' AND status!='resolved'"),
                high        = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vulnerabilities WHERE severity='high' AND status!='resolved'"),
                medium      = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vulnerabilities WHERE severity='medium' AND status!='resolved'"),
                overdue     = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vulnerabilities WHERE due_date<NOW() AND status!='resolved'"),
                total_scans = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.security_scans"),
                last_scan   = await db.QuerySingleOrDefaultAsync<DateTime?>($"SELECT MAX(completed_at) FROM {sc}.security_scans"),
                active_pentests = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.pentests WHERE status IN ('planned','in-progress')")
            });
        });

        g.MapGet("/scans", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            return Results.Ok(await db.QueryAsync($"SELECT * FROM {sc}.security_scans ORDER BY created_at DESC"));
        });

        g.MapPost("/scans", async (CreateScanReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            var id = Helpers.NewId(); db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.security_scans(id,type,target,scanner,status)
                VALUES(@Id,@Type,@Target,@Scanner,'queued')",
                new { Id = id, req.Type, req.Target, Scanner = req.Scanner ?? "trivy" });
            Hangfire.BackgroundJob.Enqueue<SecurityScanJob>(j => j.RunScan(id, sc, req.Type, req.Target));
            return Results.Created($"/api/security/scans/{id}", new { id, status = "queued" });
        });

        g.MapGet("/pentests", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            return Results.Ok(await db.QueryAsync($"SELECT * FROM {sc}.pentests ORDER BY start_date DESC"));
        });

        g.MapPost("/pentests", async (CreatePentestReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            var id = Helpers.NewId(); db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.pentests(id,title,vendor,scope,status,start_date,end_date)
                VALUES(@Id,@Title,@Vendor,@Scope,'planned',@Start,@End)",
                new { Id = id, req.Title, req.Vendor, req.Scope, Start = req.StartDate, End = req.EndDate });
            return Results.Created($"/api/security/pentests/{id}", new { id });
        });

        g.MapPut("/vulnerabilities/{id}", async (string id, UpdateVulnReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.vulnerabilities SET
                    status=COALESCE(@Status,status), assigned_to=COALESCE(@Assigned,assigned_to),
                    due_date=COALESCE(@Due,due_date),
                    resolved_at=CASE WHEN @Status='resolved' THEN NOW() ELSE resolved_at END,
                    updated_at=NOW() WHERE id=@Id",
                new { Id = id, req.Status, Assigned = req.AssignedTo, Due = req.DueDate });
            return Results.Ok(new { message = "Vulnerability updated" });
        });

        return app;
    }
    record CreateScanReq(string Type, string Target, string? Scanner);
    record CreatePentestReq(string Title, string? Vendor, string? Scope, DateTime? StartDate, DateTime? EndDate);
    record UpdateVulnReq(string? Status, string? AssignedTo, DateTime? DueDate);
}

public class SecurityScanJob
{
    private readonly IDbConnection _db;
    private readonly ILogger<SecurityScanJob> _log;
    public SecurityScanJob(IDbConnection db, ILogger<SecurityScanJob> log) { _db = db; _log = log; }
    public async Task RunScan(string scanId, string schema, string type, string target)
    {
        _log.LogInformation("[SCAN] Running {Type} scan on {Target}", type, target);
        await Task.Delay(2000); // Real: invoke trivy, snyk, etc.
        _db.Open();
        await _db.ExecuteAsync($"UPDATE {schema}.security_scans SET status='completed',completed_at=NOW() WHERE id=@Id", new { Id = scanId });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRES (AI-powered auto-fill via Ollama)
// ══════════════════════════════════════════════════════════════════════════════
public static class QuestionnairesModule
{
    public static WebApplication MapQuestionnairesModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/questionnaires").WithTags("Questionnaires");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            return Results.Ok(await db.QueryAsync($"SELECT * FROM {sc}.questionnaires ORDER BY created_at DESC"));
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var q = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.questionnaires WHERE id=@Id", new { Id = id });
            if (q == null) return Results.NotFound();
            var answers = await db.QueryAsync($"SELECT * FROM {sc}.questionnaire_answers WHERE questionnaire_id=@Id ORDER BY created_at", new { Id = id });
            return Results.Ok(new { questionnaire = q, answers });
        });

        g.MapPost("/", async (CreateQReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            var id = Helpers.NewId(); db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.questionnaires(id,title,requester,requester_org,type,status,total_questions,due_date)
                VALUES(@Id,@Title,@Requester,@Org,@Type,'received',@Total,@Due)",
                new { Id = id, req.Title, req.Requester, Org = req.RequesterOrg, req.Type,
                      Total = req.Questions?.Length ?? 0, Due = req.DueDate });
            if (req.Questions != null)
                foreach (var q in req.Questions)
                    await db.ExecuteAsync($@"
                        INSERT INTO {sc}.questionnaire_answers(id,questionnaire_id,question,status)
                        VALUES(gen_random_uuid()::VARCHAR,@QId,@Q,'pending')",
                        new { QId = id, Q = q });
            return Results.Created($"/api/questionnaires/{id}", new { id });
        });

        // AI auto-fill: send questions to Ollama with policy context
        g.MapPost("/{id}/ai-fill", async (string id, HttpContext ctx, IDbConnection db,
            AppConfig config, IHttpClientFactory httpFactory) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var q = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.questionnaires WHERE id=@Id", new { Id = id });
            if (q == null) return Results.NotFound();

            var answers = (await db.QueryAsync($"SELECT * FROM {sc}.questionnaire_answers WHERE questionnaire_id=@Id AND status='pending'", new { Id = id })).ToList();
            var policies = (await db.QueryAsync($"SELECT title,content FROM {sc}.policies WHERE status='approved' AND content IS NOT NULL LIMIT 10")).ToList();

            var context = string.Join("\n\n", policies.Select(p => $"Policy: {p.title}\n{p.content}"));
            var http = httpFactory.CreateClient("ollama");
            int filled = 0, totalConfidence = 0;

            foreach (var ans in answers)
            {
                var prompt = $@"You are a compliance expert. Based on the following company policies, answer this security questionnaire question concisely and professionally.

COMPANY POLICIES:
{context}

QUESTION: {ans.question}

Provide a clear, factual answer. If the policy doesn't address it, say so. Keep it under 150 words.";

                try
                {
                    var ollamaReq = new { model = config.OllamaModel ?? "llama3.2:1b", prompt, stream = false };
                    using var resp = await http.PostAsync("/api/generate",
                        new StringContent(JsonSerializer.Serialize(ollamaReq), Encoding.UTF8, "application/json"));

                    if (resp.IsSuccessStatusCode)
                    {
                        var body = await resp.Content.ReadAsStringAsync();
                        var json = JsonDocument.Parse(body).RootElement;
                        var aiAnswer = json.TryGetProperty("response", out var r) ? r.GetString() : "";
                        var confidence = aiAnswer?.Length > 50 ? 82 : 45;
                        await db.ExecuteAsync($@"
                            UPDATE {sc}.questionnaire_answers SET ai_answer=@A,confidence=@C,status='ai_draft' WHERE id=@Id",
                            new { A = aiAnswer, C = confidence, Id = (string)ans.id });
                        totalConfidence += confidence;
                        filled++;
                    }
                }
                catch { /* Ollama unavailable — skip this answer */ }
            }

            var avgConf = filled > 0 ? totalConfidence / filled : 0;
            await db.ExecuteAsync($@"
                UPDATE {sc}.questionnaires SET
                    answered_count=answered_count+@Filled, ai_confidence=@Conf,
                    status='ai_drafting', updated_at=NOW() WHERE id=@Id",
                new { Id = id, Filled = filled, Conf = avgConf });

            return Results.Ok(new { filled, avg_confidence = avgConf, total = answers.Count });
        });

        g.MapPut("/answers/{id}/approve", async (string id, ApproveAnswerReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.questionnaire_answers SET
                    final_answer=COALESCE(@Final,ai_answer), status='approved',
                    reviewed_by=@By, reviewed_at=NOW() WHERE id=@Id",
                new { Id = id, Final = req.FinalAnswer, By = email });
            return Results.Ok(new { message = "Answer approved" });
        });

        return app;
    }
    record CreateQReq(string Title, string? Requester, string? RequesterOrg, string Type, string[]? Questions, DateTime? DueDate);
    record ApproveAnswerReq(string? FinalAnswer);
}

// ══════════════════════════════════════════════════════════════════════════════
// TRUST CENTER
// ══════════════════════════════════════════════════════════════════════════════
public static class TrustCenterModule
{
    public static WebApplication MapTrustCenterModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/trust-center").WithTags("Trust Center");

        // Public endpoint — no auth required
        g.MapGet("/public/{tenantSlug}", async (string tenantSlug, IDbConnection db) =>
        {
            var sc = $"tenant_{tenantSlug.Replace("-", "_").Replace(" ", "_")}";
            db.Open();
            try
            {
                var tc = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.trust_center WHERE is_public=true");
                if (tc == null) return Results.NotFound(new { error = "Trust center not found or not public" });
                var domains = await db.QueryAsync($@"
                    SELECT standard,ROUND(AVG(score)) score, COUNT(*) domains
                    FROM {sc}.control_domains GROUP BY standard");
                var certifications = JsonSerializer.Deserialize<object[]>(((string)tc.certifications) ?? "[]");
                return Results.Ok(new { trust_center = tc, frameworks = domains, certifications });
            }
            catch { return Results.NotFound(new { error = "Tenant not found" }); }
        });

        g.MapGet("/", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var tc = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.trust_center");
            var domains = await db.QueryAsync($"SELECT * FROM {sc}.control_domains ORDER BY standard,id");
            return Results.Ok(new { trust_center = tc, domains });
        });

        g.MapPut("/", async (UpdateTrustCenterReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.trust_center SET
                    is_public=COALESCE(@IsPublic,is_public), title=COALESCE(@Title,title),
                    tagline=COALESCE(@Tagline,tagline), accent_color=COALESCE(@Color,accent_color),
                    certifications=COALESCE(@Certs::jsonb,certifications), updated_at=NOW()",
                new { req.IsPublic, req.Title, req.Tagline, Color = req.AccentColor,
                      Certs = req.Certifications != null ? JsonSerializer.Serialize(req.Certifications) : null });
            return Results.Ok(new { message = "Trust center updated" });
        });

        g.MapGet("/embed-widget", (HttpContext ctx) =>
        {
            var host = $"{ctx.Request.Scheme}://{ctx.Request.Host}";
            var tenantId = ctx.Request.Headers["X-Tenant-ID"].FirstOrDefault() ?? "demo";
            var script = $@"<script>(function(){{var d=document.createElement('div');d.id='clovrix-badge';d.style='position:fixed;bottom:20px;right:20px;z-index:9999;';fetch('{host}/api/trust-center/public/{tenantId}').then(r=>r.json()).then(function(data){{d.innerHTML='<div style=""background:#6366f1;color:white;border-radius:8px;padding:8px 14px;font-family:system-ui;font-size:12px;cursor:pointer;"">🔒 Compliance Status: '+Math.round([data.frameworks[0]?.score||0,data.frameworks[1]?.score||0,data.frameworks[2]?.score||0].filter(Boolean).reduce((a,b)=>a+b,0)/Math.max(1,[data.frameworks[0],data.frameworks[1],data.frameworks[2]].filter(Boolean).length))+'%</div>';document.body.appendChild(d);}});}})()</script>";
            ctx.Response.ContentType = "text/javascript";
            return Results.Content(script, "text/javascript");
        });

        return app;
    }
    record UpdateTrustCenterReq(bool? IsPublic, string? Title, string? Tagline, string? AccentColor, object[]? Certifications);
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS — Workflow-based audit reports
// Reports are derived from completed/archived audit workflows.
// A report = a completed audit workflow + its findings + evidence + controls.
// ══════════════════════════════════════════════════════════════════════════════
public static class ReportsModule
{
    public static WebApplication MapReportsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/reports").WithTags("Reports");

        // ── List all reportable workflows (completed + archived) ──────────────
        g.MapGet("/", async (HttpContext ctx, IDbConnection db, string? standard = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var where = standard != null ? "AND w.standard=@Standard" : "";
            var rows = await db.QueryAsync($@"
                SELECT w.id, w.name, w.standard, w.type, w.status, w.progress,
                       w.created_at, w.completed_at, w.agent_name,
                       s.name AS system_name, s.system_id,
                       (SELECT COUNT(*) FROM {sc}.findings f WHERE f.workflow_id=w.id)  AS findings_count,
                       (SELECT COUNT(*) FROM {sc}.findings f WHERE f.workflow_id=w.id AND f.status='open') AS open_findings,
                       (SELECT COUNT(*) FROM {sc}.evidence  e WHERE e.workflow_id=w.id)  AS evidence_count,
                       (SELECT COUNT(*) FROM {sc}.workflow_steps ws WHERE ws.workflow_id=w.id AND ws.status='completed') AS steps_completed,
                       (SELECT COUNT(*) FROM {sc}.workflow_steps ws WHERE ws.workflow_id=w.id) AS steps_total,
                       COALESCE(
                           (SELECT ROUND(AVG(cd.score)) FROM {sc}.control_domains cd WHERE cd.standard=w.standard),
                           0
                       ) AS score,
                       fw.name AS framework_name, fw.color AS framework_color
                FROM {sc}.workflows w
                LEFT JOIN {sc}.ai_systems s  ON w.ai_system_id = s.id
                LEFT JOIN {sc}.frameworks fw ON fw.code = w.standard
                WHERE w.status IN ('completed','archived') {where}
                ORDER BY w.completed_at DESC NULLS LAST, w.created_at DESC",
                new { Standard = standard });
            return Results.Ok(rows);
        });

        // ── Executive summary — derived purely from live workflow + findings data ─
        g.MapGet("/executive-summary", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();

            // Per-framework scores from control_domains (set by domain scoring in audits)
            var fwScores = await db.QueryAsync($@"
                SELECT f.code, f.short_name, f.name, f.color,
                       COALESCE(ROUND(AVG(cd.score)),0) AS score,
                       COUNT(cd.id) AS domain_count
                FROM {sc}.frameworks f
                LEFT JOIN {sc}.control_domains cd ON cd.standard = f.code
                WHERE f.is_active = true
                GROUP BY f.code, f.short_name, f.name, f.color, f.sort_order
                ORDER BY f.sort_order");

            var fwList   = ((IEnumerable<dynamic>)fwScores).ToList();
            var fwWithData = fwList.Where(f => (long)f.domain_count > 0).ToList();
            var overall  = fwWithData.Any() ? (int)Math.Round(fwWithData.Average(f => (double)(long)f.score)) : 0;

            // by_framework: keyed by framework code, value has name/score/color for UI rings
            var byFramework = fwList.ToDictionary(
                f => (string)f.code,
                f => (object)new { name = (string)(f.short_name ?? f.name), score = (int)(long)f.score, color = (string)(f.color ?? "#6366f1") });

            var openFindings  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.findings WHERE status='open'");
            var openRems      = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.remediations WHERE status NOT IN ('resolved','cancelled')");
            var vendorRisk    = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vendors WHERE risk_score>=70 AND status='active'");
            var completedWfs  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflows WHERE status IN ('completed','archived')");
            var domains       = (await db.QueryAsync($"SELECT * FROM {sc}.control_domains ORDER BY standard, risk_level DESC")).ToList();
            var topFindings   = (await db.QueryAsync($@"
                SELECT f.*, d.area as domain_name
                FROM {sc}.findings f
                LEFT JOIN {sc}.control_domains d ON f.domain_id = d.id
                WHERE f.status='open'
                ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 5")).ToList();
            var findingsBySev = await db.QueryAsync($@"
                SELECT severity, COUNT(*) as count
                FROM {sc}.findings WHERE status='open'
                GROUP BY severity
                ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END");

            return Results.Ok(new
            {
                generated_at         = DateTime.UtcNow,
                scores               = new { overall, by_framework = byFramework },
                open_findings        = openFindings,
                critical_risks       = openFindings,
                open_remediations    = openRems,
                high_risk_vendors    = vendorRisk,
                completed_audits     = completedWfs,
                frameworks           = fwList,
                domains,
                top_findings         = topFindings,
                findings_by_severity = findingsBySev,
            });
        });

        // ── Download PDF for a specific workflow ──────────────────────────────
        g.MapGet("/{workflowId}/pdf", async (string workflowId, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();

            var wf = await db.QueryFirstOrDefaultAsync($@"
                SELECT w.*, s.name AS system_name, s.system_id
                FROM {sc}.workflows w
                LEFT JOIN {sc}.ai_systems s ON w.ai_system_id=s.id
                WHERE w.id=@Id", new { Id = workflowId });
            if (wf == null) return Results.NotFound(new { error = "Workflow not found" });

            var std      = (string)wf.standard;
            var domains  = (await db.QueryAsync($"SELECT * FROM {sc}.control_domains WHERE standard=@S ORDER BY id", new { S = std })).ToList();
            var controls = (await db.QueryAsync($@"
                SELECT c.ref, c.title, c.status, d.area AS domain_name
                FROM {sc}.controls c JOIN {sc}.control_domains d ON c.domain_id=d.id
                WHERE d.standard=@S ORDER BY d.id, c.ref", new { S = std })).ToList();
            var findings  = (await db.QueryAsync($@"
                SELECT f.*, d.area AS domain_name
                FROM {sc}.findings f
                LEFT JOIN {sc}.control_domains d ON f.domain_id=d.id
                WHERE f.workflow_id=@Id OR f.standard=@Std
                ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 30",
                new { Id = workflowId, Std = std })).ToList();
            var evidence  = (await db.QueryAsync($@"
                SELECT e.original_name, e.filename, e.collected_by, e.created_at, c.ref AS control_ref
                FROM {sc}.evidence e LEFT JOIN {sc}.controls c ON e.control_id=c.id
                WHERE e.workflow_id=@Id ORDER BY e.created_at", new { Id = workflowId })).ToList();
            var steps     = (await db.QueryAsync($@"
                SELECT name, status, started_at, completed_at
                FROM {sc}.workflow_steps WHERE workflow_id=@Id ORDER BY step_order", new { Id = workflowId })).ToList();

            var score     = domains.Any() ? (int)domains.Average(d => (double)(int)d.score) : 0;
            var wfName    = (string)wf.name;
            var sysName   = (string?)wf.system_name ?? "—";

            var pdfBytes = Document.Create(doc =>
            {
                doc.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(40);
                    page.DefaultTextStyle(t => t.FontSize(10).FontFamily("Helvetica"));

                    page.Header().Column(col =>
                    {
                        col.Item().Text($"Audit Report — {std}").FontSize(20).Bold().FontColor(Colors.Indigo.Medium);
                        col.Item().Text(wfName).FontSize(13).FontColor(Colors.Grey.Darken1);
                        col.Item().PaddingTop(2).Text($"AI System: {sysName}  ·  Type: {(string?)wf.type ?? "—"}  ·  Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC")
                            .FontSize(9).FontColor(Colors.Grey.Medium);
                        col.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                    });

                    page.Content().Column(col =>
                    {
                        // Score summary
                        col.Item().PaddingTop(16).Row(row =>
                        {
                            row.RelativeItem().Column(c =>
                            {
                                c.Item().Text($"Compliance Score: {score}%").FontSize(16).Bold();
                                c.Item().Text($"Status: {(string)wf.status}  ·  Progress: {(int)wf.progress}%").FontSize(10).FontColor(Colors.Grey.Darken1);
                            });
                            row.ConstantItem(120).Column(c =>
                            {
                                c.Item().Text($"Findings: {findings.Count}").FontSize(10);
                                c.Item().Text($"Evidence: {evidence.Count} files").FontSize(10);
                                c.Item().Text($"Controls: {controls.Count}").FontSize(10);
                            });
                        });

                        // Audit Steps
                        if (steps.Any())
                        {
                            col.Item().PaddingTop(16).Text("Audit Pipeline Steps").FontSize(13).Bold();
                            col.Item().PaddingTop(4).Table(t =>
                            {
                                t.ColumnsDefinition(c => { c.RelativeColumn(4); c.ConstantColumn(80); c.RelativeColumn(2); c.RelativeColumn(2); });
                                t.Header(h =>
                                {
                                    foreach (var hdr in new[] { "Step", "Status", "Started", "Completed" })
                                        h.Cell().Background(Colors.Indigo.Lighten4).Padding(4).Text(hdr).Bold().FontSize(9);
                                });
                                foreach (var s in steps)
                                {
                                    t.Cell().Padding(4).Text((string)s.name);
                                    t.Cell().Padding(4).Text((string)s.status);
                                    t.Cell().Padding(4).Text(s.started_at != null ? ((DateTime)s.started_at).ToString("yyyy-MM-dd") : "—").FontSize(9);
                                    t.Cell().Padding(4).Text(s.completed_at != null ? ((DateTime)s.completed_at).ToString("yyyy-MM-dd") : "—").FontSize(9);
                                }
                            });
                        }

                        // Control Domains
                        if (domains.Any())
                        {
                            col.Item().PaddingTop(16).Text("Control Domains").FontSize(13).Bold();
                            col.Item().PaddingTop(4).Table(t =>
                            {
                                t.ColumnsDefinition(c => { c.ConstantColumn(60); c.RelativeColumn(4); c.ConstantColumn(55); c.ConstantColumn(80); c.ConstantColumn(55); });
                                t.Header(h =>
                                {
                                    foreach (var hdr in new[] { "Ref", "Domain", "Score", "Status", "Risk" })
                                        h.Cell().Background(Colors.Indigo.Lighten4).Padding(4).Text(hdr).Bold().FontSize(9);
                                });
                                foreach (var d in domains)
                                {
                                    t.Cell().Padding(4).Text((string?)d.ref_code ?? "");
                                    t.Cell().Padding(4).Text((string)d.area);
                                    t.Cell().Padding(4).Text($"{(int)d.score}%");
                                    t.Cell().Padding(4).Text((string)d.status);
                                    t.Cell().Padding(4).Text((string)d.risk_level);
                                }
                            });
                        }

                        // Findings
                        if (findings.Any())
                        {
                            col.Item().PaddingTop(16).Text($"Findings ({findings.Count})").FontSize(13).Bold();
                            col.Item().PaddingTop(4).Table(t =>
                            {
                                t.ColumnsDefinition(c => { c.ConstantColumn(60); c.RelativeColumn(5); c.ConstantColumn(80); c.ConstantColumn(90); });
                                t.Header(h =>
                                {
                                    foreach (var hdr in new[] { "Severity", "Title", "Domain", "Status" })
                                        h.Cell().Background(Colors.Red.Lighten4).Padding(4).Text(hdr).Bold().FontSize(9);
                                });
                                foreach (var f in findings)
                                {
                                    t.Cell().Padding(4).Text(((string)f.severity).ToUpper()).FontSize(9);
                                    t.Cell().Padding(4).Text((string)f.title).FontSize(9);
                                    t.Cell().Padding(4).Text((string?)f.domain_name ?? "—").FontSize(9);
                                    t.Cell().Padding(4).Text((string)f.status).FontSize(9);
                                }
                            });
                        }

                        // Evidence
                        if (evidence.Any())
                        {
                            col.Item().PaddingTop(16).Text($"Evidence ({evidence.Count} files)").FontSize(13).Bold();
                            col.Item().PaddingTop(4).Table(t =>
                            {
                                t.ColumnsDefinition(c => { c.RelativeColumn(4); c.ConstantColumn(70); c.RelativeColumn(2); c.ConstantColumn(80); });
                                t.Header(h =>
                                {
                                    foreach (var hdr in new[] { "Filename", "Control", "Uploaded By", "Date" })
                                        h.Cell().Background(Colors.Green.Lighten4).Padding(4).Text(hdr).Bold().FontSize(9);
                                });
                                foreach (var e in evidence)
                                {
                                    t.Cell().Padding(4).Text((string?)e.original_name ?? (string)e.filename).FontSize(9);
                                    t.Cell().Padding(4).Text((string?)e.control_ref ?? "—").FontSize(9);
                                    t.Cell().Padding(4).Text((string?)e.collected_by ?? "—").FontSize(9);
                                    t.Cell().Padding(4).Text(((DateTime)e.created_at).ToString("yyyy-MM-dd")).FontSize(9);
                                }
                            });
                        }
                    });

                    page.Footer().AlignRight().Text(txt =>
                    {
                        txt.Span("Clovrix Audit Report  ·  Page ").FontSize(8).FontColor(Colors.Grey.Medium);
                        txt.CurrentPageNumber().FontSize(8);
                        txt.Span(" / ").FontSize(8);
                        txt.TotalPages().FontSize(8);
                    });
                });
            }).GeneratePdf();

            var safeName = wfName.Replace(" ", "-").Replace("/", "-").ToLower();
            ctx.Response.Headers["Content-Disposition"] = $"attachment; filename=clovrix-audit-{safeName}-{DateTime.UtcNow:yyyyMMdd}.pdf";
            return Results.File(pdfBytes, "application/pdf");
        });

        return app;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// TENANT PROVISIONING
// ══════════════════════════════════════════════════════════════════════════════
public static class TenantsModule
{
    public static WebApplication MapTenantsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/tenants").WithTags("Tenants");

        g.MapGet("/", async (IDbConnection db) =>
        {
            db.Open();
            var rows = await db.QueryAsync("SELECT id,name,slug,plan,region,is_active,created_at FROM public.tenants ORDER BY name");
            return Results.Ok(rows);
        });

        g.MapPost("/", async (CreateTenantReq req, IDbConnection db, IMinioClient minio) =>
        {
            var slug = req.Slug.ToLower().Replace(" ", "_").Replace("-", "_");
            db.Open();
            var id = Helpers.NewId();

            // 1. Insert tenant record
            await db.ExecuteAsync($"INSERT INTO public.tenants(id,name,slug,plan,region) VALUES(@Id,@Name,@Slug,@Plan,@Region)",
                new { Id = id, req.Name, Slug = slug, Plan = req.Plan ?? "standard", Region = req.Region ?? "us-east-1" });

            // 2. Create PostgreSQL schema + all tables
            var schema = $"tenant_{slug}";
            await db.ExecuteAsync($"CREATE SCHEMA IF NOT EXISTS {schema}");

            // 3. Create schema tables (same DDL as 01-schema.sql but parameterized to schema)
            var tables = AcsiSchemaBuilder.BuildSchema(schema);
            foreach (var sql in tables) await db.ExecuteAsync(sql);

            // 4. Create MinIO bucket
            var bucket = $"evidence-{slug}";
            bool bucketExists = await minio.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket));
            if (!bucketExists)
                await minio.MakeBucketAsync(new MakeBucketArgs().WithBucket(bucket));

            // 5. Seed default integrations
            await SeedDefaultIntegrations(db, schema);

            return Results.Created($"/api/tenants/{id}", new { id, slug, schema, bucket });
        });

        return app;
    }

    static async Task SeedDefaultIntegrations(IDbConnection db, string schema)
    {
        var providers = new[]
        {
            (id: Helpers.NewId(), provider: "aws",           name: "Amazon Web Services",    cat: "cloud",         auth: "access_key"),
            (id: Helpers.NewId(), provider: "github",        name: "GitHub",                 cat: "scm",           auth: "oauth2"),
            (id: Helpers.NewId(), provider: "okta",          name: "Okta",                   cat: "identity",      auth: "oauth2"),
            (id: Helpers.NewId(), provider: "azure",         name: "Microsoft Azure",        cat: "cloud",         auth: "oauth2"),
            (id: Helpers.NewId(), provider: "google_workspace",name:"Google Workspace",      cat: "identity",      auth: "oauth2"),
            (id: Helpers.NewId(), provider: "jira",          name: "Jira",                   cat: "ticketing",     auth: "oauth2"),
            (id: Helpers.NewId(), provider: "slack",         name: "Slack",                  cat: "communication", auth: "oauth2"),
            (id: Helpers.NewId(), provider: "snyk",          name: "Snyk",                   cat: "security",      auth: "token"),
            (id: Helpers.NewId(), provider: "gcp",           name: "Google Cloud Platform",  cat: "cloud",         auth: "oauth2"),
            (id: Helpers.NewId(), provider: "crowdstrike",   name: "CrowdStrike Falcon",     cat: "security",      auth: "oauth2"),
        };
        foreach (var p in providers)
            await db.ExecuteAsync($@"
                INSERT INTO {schema}.integrations(id,provider,display_name,category,status,auth_type)
                VALUES(@Id,@Provider,@Name,@Cat,'not_connected',@Auth)
                ON CONFLICT DO NOTHING",
                new { p.id, p.provider, Name = p.name, Cat = p.cat, Auth = p.auth });
    }

    record CreateTenantReq(string Name, string Slug, string? Plan, string? Region);
}

// ── Schema DDL builder for new tenants ───────────────────────────────────────
public static class AcsiSchemaBuilder
{
    public static IEnumerable<string> BuildSchema(string sc) => new[]
    {
        $"CREATE TABLE IF NOT EXISTS {sc}.control_domains (id VARCHAR(20) PRIMARY KEY, standard VARCHAR(20) NOT NULL, area VARCHAR(300) NOT NULL, ref_code VARCHAR(30), description TEXT, score SMALLINT NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'not-started', risk_level VARCHAR(20) NOT NULL DEFAULT 'high', controls_count SMALLINT NOT NULL DEFAULT 0, findings_count SMALLINT NOT NULL DEFAULT 0, last_tested_at TIMESTAMPTZ, next_review_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.controls (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, domain_id VARCHAR(20) REFERENCES {sc}.control_domains(id), ref VARCHAR(50), title VARCHAR(400) NOT NULL, description TEXT, testing_procedure TEXT, evidence_required TEXT, frequency VARCHAR(20) DEFAULT 'annual', status VARCHAR(30) DEFAULT 'not-tested', automated BOOLEAN DEFAULT FALSE, last_tested_at TIMESTAMPTZ, owner_email VARCHAR(200), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.evidence (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, control_id VARCHAR(36), domain_id VARCHAR(20), workflow_id VARCHAR(36), filename VARCHAR(500) NOT NULL, original_name VARCHAR(500) NOT NULL, file_size BIGINT, mime_type VARCHAR(200), storage_bucket VARCHAR(200) NOT NULL, storage_key TEXT NOT NULL, ocr_text TEXT, ocr_status VARCHAR(20) DEFAULT 'pending', description TEXT, tags JSONB DEFAULT '[]', collected_by VARCHAR(200), source VARCHAR(50) DEFAULT 'manual', expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.workflows (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, name VARCHAR(300) NOT NULL, standard VARCHAR(20) NOT NULL, type VARCHAR(30) DEFAULT 'full-audit', status VARCHAR(30) DEFAULT 'pending', progress SMALLINT DEFAULT 0, agent_name VARCHAR(100), description TEXT, scheduled_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, next_run_at TIMESTAMPTZ, recurrence VARCHAR(20), evidence_count INT DEFAULT 0, findings_count INT DEFAULT 0, created_by VARCHAR(200), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.workflow_steps (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, workflow_id VARCHAR(36) REFERENCES {sc}.workflows(id) ON DELETE CASCADE, name VARCHAR(200) NOT NULL, description TEXT, step_order SMALLINT NOT NULL, status VARCHAR(30) DEFAULT 'pending', started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, output TEXT, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.findings (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, domain_id VARCHAR(20), control_id VARCHAR(36), workflow_id VARCHAR(36), standard VARCHAR(20) NOT NULL, title VARCHAR(500) NOT NULL, description TEXT, severity VARCHAR(20) DEFAULT 'medium', status VARCHAR(30) DEFAULT 'open', source VARCHAR(30) DEFAULT 'manual', ai_generated BOOLEAN DEFAULT FALSE, assigned_to VARCHAR(200), due_date DATE, resolved_at TIMESTAMPTZ, created_by VARCHAR(200), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.remediations (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, finding_id VARCHAR(36), title VARCHAR(500) NOT NULL, description TEXT, priority VARCHAR(20) DEFAULT 'medium', status VARCHAR(30) DEFAULT 'open', assigned_to VARCHAR(200), assigned_by VARCHAR(200), due_date DATE, sla_days SMALLINT DEFAULT 30, sla_breached BOOLEAN DEFAULT FALSE, resolution_notes TEXT, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.risks (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, title VARCHAR(500) NOT NULL, description TEXT, category VARCHAR(50) DEFAULT 'operational', likelihood SMALLINT DEFAULT 3, impact SMALLINT DEFAULT 3, treatment VARCHAR(20) DEFAULT 'mitigate', status VARCHAR(30) DEFAULT 'open', domain_id VARCHAR(20), owner_email VARCHAR(200), due_date DATE, review_date DATE, mitigations JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.personnel (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, email VARCHAR(200) NOT NULL UNIQUE, full_name VARCHAR(200) NOT NULL, department VARCHAR(100), title VARCHAR(200), role VARCHAR(30) DEFAULT 'employee', employment_status VARCHAR(30) DEFAULT 'active', start_date DATE, end_date DATE, manager_email VARCHAR(200), background_check_status VARCHAR(30) DEFAULT 'pending', mfa_enabled BOOLEAN DEFAULT FALSE, access_review_due DATE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.training (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, personnel_id VARCHAR(36) REFERENCES {sc}.personnel(id) ON DELETE CASCADE, course_name VARCHAR(300) NOT NULL, course_type VARCHAR(50) DEFAULT 'security', status VARCHAR(30) DEFAULT 'assigned', assigned_at TIMESTAMPTZ DEFAULT NOW(), due_date DATE, completed_at TIMESTAMPTZ, score SMALLINT, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.access_reviews (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, personnel_id VARCHAR(36) REFERENCES {sc}.personnel(id), reviewer_email VARCHAR(200), system_name VARCHAR(200) NOT NULL, access_level VARCHAR(100), status VARCHAR(30) DEFAULT 'pending', review_type VARCHAR(30) DEFAULT 'periodic', due_date DATE, completed_at TIMESTAMPTZ, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.vendors (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, name VARCHAR(300) NOT NULL, website VARCHAR(500), category VARCHAR(50) DEFAULT 'SaaS', criticality VARCHAR(20) DEFAULT 'medium', risk_score SMALLINT DEFAULT 50, risk_tier VARCHAR(10) DEFAULT 'tier-2', status VARCHAR(30) DEFAULT 'active', data_types JSONB DEFAULT '[]', dpa_signed BOOLEAN DEFAULT FALSE, dpa_expiry DATE, soc2_type VARCHAR(5), soc2_expiry DATE, iso27001_certified BOOLEAN DEFAULT FALSE, last_assessment_date DATE, next_assessment_due DATE, owner_email VARCHAR(200), contact_email VARCHAR(200), notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.vendor_assessments (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, vendor_id VARCHAR(36) REFERENCES {sc}.vendors(id) ON DELETE CASCADE, type VARCHAR(30) DEFAULT 'annual', status VARCHAR(30) DEFAULT 'draft', risk_score SMALLINT, assessor_email VARCHAR(200), questions JSONB DEFAULT '[]', responses JSONB DEFAULT '{{}}', findings JSONB DEFAULT '[]', sent_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.policies (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, title VARCHAR(300) NOT NULL, category VARCHAR(50) DEFAULT 'security', version VARCHAR(10) DEFAULT '1.0', status VARCHAR(30) DEFAULT 'draft', content TEXT, content_hash VARCHAR(64), owner_email VARCHAR(200), approved_by VARCHAR(200), approved_at TIMESTAMPTZ, effective_date DATE, review_date DATE, frameworks JSONB DEFAULT '[]', requires_signoff BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.policy_signoffs (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, policy_id VARCHAR(36) REFERENCES {sc}.policies(id) ON DELETE CASCADE, personnel_id VARCHAR(36) REFERENCES {sc}.personnel(id), version VARCHAR(10), status VARCHAR(20) DEFAULT 'pending', signed_at TIMESTAMPTZ, signature_hash VARCHAR(64), ip_address VARCHAR(50), created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(policy_id,personnel_id))",
        $"CREATE TABLE IF NOT EXISTS {sc}.policy_versions (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, policy_id VARCHAR(36) REFERENCES {sc}.policies(id) ON DELETE CASCADE, version VARCHAR(10) NOT NULL, content TEXT, changed_by VARCHAR(200), change_note TEXT, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.integrations (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, provider VARCHAR(50) NOT NULL UNIQUE, display_name VARCHAR(200) NOT NULL, category VARCHAR(50) NOT NULL, status VARCHAR(30) DEFAULT 'not_connected', auth_type VARCHAR(20) DEFAULT 'oauth2', config JSONB DEFAULT '{{}}', scopes JSONB DEFAULT '[]', last_sync_at TIMESTAMPTZ, next_sync_at TIMESTAMPTZ, sync_stats JSONB DEFAULT '{{}}', error_msg TEXT, controls_linked SMALLINT DEFAULT 0, evidence_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.integration_credentials (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, integration_id VARCHAR(36) REFERENCES {sc}.integrations(id) ON DELETE CASCADE UNIQUE, access_token TEXT, refresh_token TEXT, token_type VARCHAR(50), expires_at TIMESTAMPTZ, raw_config JSONB DEFAULT '{{}}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.integration_checks (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, integration_id VARCHAR(36) REFERENCES {sc}.integrations(id) ON DELETE CASCADE, control_id VARCHAR(36), name VARCHAR(300) NOT NULL, description TEXT, check_type VARCHAR(50) DEFAULT 'api', status VARCHAR(20) DEFAULT 'unknown', last_run_at TIMESTAMPTZ, last_passed_at TIMESTAMPTZ, failure_count SMALLINT DEFAULT 0, details JSONB DEFAULT '{{}}', created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.ccm_rules (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, integration_id VARCHAR(36), control_id VARCHAR(36), name VARCHAR(300) NOT NULL, description TEXT, frequency VARCHAR(20) DEFAULT 'daily', is_active BOOLEAN DEFAULT TRUE, last_run_at TIMESTAMPTZ, last_result VARCHAR(20), failure_streak SMALLINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.security_scans (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, type VARCHAR(30) NOT NULL, target VARCHAR(500) NOT NULL, scanner VARCHAR(100), status VARCHAR(20) DEFAULT 'queued', critical_count SMALLINT DEFAULT 0, high_count SMALLINT DEFAULT 0, medium_count SMALLINT DEFAULT 0, low_count SMALLINT DEFAULT 0, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, report_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.vulnerabilities (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, scan_id VARCHAR(36), cve_id VARCHAR(50), title VARCHAR(500) NOT NULL, description TEXT, severity VARCHAR(20) DEFAULT 'medium', cvss_score DECIMAL(3,1), component VARCHAR(300), component_version VARCHAR(50), fixed_version VARCHAR(50), status VARCHAR(30) DEFAULT 'open', assigned_to VARCHAR(200), due_date DATE, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.pentests (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, title VARCHAR(300) NOT NULL, vendor VARCHAR(200), scope TEXT, status VARCHAR(30) DEFAULT 'planned', start_date DATE, end_date DATE, report_url TEXT, critical_count SMALLINT DEFAULT 0, high_count SMALLINT DEFAULT 0, remediation_count SMALLINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.questionnaires (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, title VARCHAR(300) NOT NULL, type VARCHAR(30) DEFAULT 'security', status VARCHAR(30) DEFAULT 'draft', recipient_email VARCHAR(200), recipient_name VARCHAR(200), due_date DATE, sent_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, ai_filled_at TIMESTAMPTZ, created_by VARCHAR(200), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.questionnaire_answers (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, questionnaire_id VARCHAR(36) REFERENCES {sc}.questionnaires(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT, ai_answer TEXT, final_answer TEXT, status VARCHAR(20) DEFAULT 'pending', confidence DECIMAL(3,2), source_references JSONB DEFAULT '[]', approved_by VARCHAR(200), approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.trust_center (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, company_name VARCHAR(300) NOT NULL, tagline TEXT, logo_url TEXT, is_public BOOLEAN DEFAULT FALSE, show_certifications BOOLEAN DEFAULT TRUE, show_controls BOOLEAN DEFAULT FALSE, show_uptime BOOLEAN DEFAULT TRUE, show_pen_tests BOOLEAN DEFAULT FALSE, certifications JSONB DEFAULT '[]', custom_sections JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.ai_systems (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, name VARCHAR(300) NOT NULL, description TEXT, system_type VARCHAR(50) DEFAULT 'ml-model', risk_level VARCHAR(20) DEFAULT 'medium', status VARCHAR(30) DEFAULT 'active', frameworks JSONB DEFAULT '[]', owner_email VARCHAR(200), technical_contact VARCHAR(200), deployment_env VARCHAR(50) DEFAULT 'production', training_data_types JSONB DEFAULT '[]', output_types JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.audit_logs (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, user_email VARCHAR(200), action VARCHAR(100) NOT NULL, entity_type VARCHAR(50), entity_id VARCHAR(36), details JSONB DEFAULT '{{}}', ip_address VARCHAR(50), created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.users (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, email VARCHAR(200) NOT NULL UNIQUE, full_name VARCHAR(200), role VARCHAR(30) DEFAULT 'viewer', status VARCHAR(20) DEFAULT 'active', last_login_at TIMESTAMPTZ, invited_by VARCHAR(200), invited_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.framework_workflow_steps (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, framework_code VARCHAR(50) NOT NULL, step_order SMALLINT NOT NULL, name VARCHAR(200) NOT NULL, description TEXT, step_type VARCHAR(30) DEFAULT 'custom', is_active BOOLEAN DEFAULT TRUE, allow_file_upload BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())",
        $"CREATE TABLE IF NOT EXISTS {sc}.finding_assignees (finding_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, assigned_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(finding_id,user_id))",
        $"CREATE TABLE IF NOT EXISTS {sc}.control_domain_map (control_id VARCHAR(36) NOT NULL, domain_id VARCHAR(20) NOT NULL, is_mandatory BOOLEAN DEFAULT FALSE, PRIMARY KEY(control_id,domain_id))",
        $"CREATE TABLE IF NOT EXISTS {sc}.statement_of_applicability (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, framework_code VARCHAR(30) NOT NULL UNIQUE, status VARCHAR(30) NOT NULL DEFAULT 'draft', approver VARCHAR(200), approved_at TIMESTAMPTZ, rejected_at TIMESTAMPTZ, comments TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        $"CREATE TABLE IF NOT EXISTS {sc}.auditor_history (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR, entity_type VARCHAR(40) NOT NULL, entity_id VARCHAR(60) NOT NULL, action VARCHAR(80) NOT NULL, actor_email VARCHAR(200), comments TEXT, metadata JSONB NOT NULL DEFAULT '{{}}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        $"ALTER TABLE {sc}.controls ADD COLUMN IF NOT EXISTS soa_applicability VARCHAR(30) NOT NULL DEFAULT 'applicable'",
        $"ALTER TABLE {sc}.controls ADD COLUMN IF NOT EXISTS soa_justification TEXT",
        $"ALTER TABLE {sc}.controls ADD COLUMN IF NOT EXISTS soa_locked BOOLEAN NOT NULL DEFAULT FALSE",
        $"ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'pending'",
        $"ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verification_comments TEXT",
        $"ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verified_by VARCHAR(200)",
        $"ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ",
        $"ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validation_status VARCHAR(30) NOT NULL DEFAULT 'pending'",
        $"ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validation_comments TEXT",
        $"ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validated_by VARCHAR(200)",
        $"ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ",
        $"ALTER TABLE {sc}.remediations ADD COLUMN IF NOT EXISTS closure_status VARCHAR(30) NOT NULL DEFAULT 'pending'",
        $"ALTER TABLE {sc}.remediations ADD COLUMN IF NOT EXISTS closure_notes TEXT",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS description TEXT",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS minimum_approvals SMALLINT NOT NULL DEFAULT 1",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS assigned_approvers JSONB NOT NULL DEFAULT '[]'",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS expiry_date DATE",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_size INT",
        $"ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)",
        $"CREATE INDEX IF NOT EXISTS idx_soa_status ON {sc}.statement_of_applicability(status)",
        $"CREATE INDEX IF NOT EXISTS idx_auditor_history_entity ON {sc}.auditor_history(entity_type, entity_id, created_at DESC)",
    };
}
