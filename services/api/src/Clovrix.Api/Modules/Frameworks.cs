using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// FRAMEWORKS — Dynamic compliance framework registry
// Zero code changes to add a new framework — just POST to /api/frameworks
// ══════════════════════════════════════════════════════════════════════════════
public static class FrameworksModule
{
    public static WebApplication MapFrameworksModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/frameworks").WithTags("Frameworks");

        // ── List all active frameworks ────────────────────────────────────────
        g.MapGet("/", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var rows = await db.QueryAsync($@"
                SELECT f.*,
                    (SELECT COUNT(*) FROM {sc}.control_domains cd WHERE cd.standard=f.code) AS domain_count_live,
                    (SELECT COUNT(*) FROM {sc}.controls c
                        JOIN {sc}.control_domains cd ON c.domain_id = cd.id
                        WHERE cd.standard=f.code) AS control_count_live,
                    (SELECT COALESCE(ROUND(AVG(cd.score)),0) FROM {sc}.control_domains cd WHERE cd.standard=f.code) AS avg_score
                FROM {sc}.frameworks f
                WHERE f.is_active=true
                ORDER BY f.sort_order, f.code");
            return Results.Ok(rows);
        });

        // ── Get single framework with domains ─────────────────────────────────
        g.MapGet("/{code}", async (string code, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var fw = await db.QueryFirstOrDefaultAsync(
                $"SELECT * FROM {sc}.frameworks WHERE code=@Code AND is_active=true",
                new { Code = code.ToUpper() });
            if (fw == null) return Results.NotFound();

            var domains = await db.QueryAsync(
                $"SELECT * FROM {sc}.control_domains WHERE standard=@Code ORDER BY id",
                new { Code = code.ToUpper() });

            var steps = await db.QueryAsync(
                $"SELECT * FROM {sc}.framework_workflow_steps WHERE framework_code=@Code ORDER BY step_order",
                new { Code = code.ToUpper() });

            return Results.Ok(new { framework = fw, domains, workflow_steps = steps });
        });

        // ── Get workflow steps for a framework ────────────────────────────────
        g.MapGet("/{code}/steps", async (string code, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var steps = await db.QueryAsync(
                $"SELECT * FROM {sc}.framework_workflow_steps WHERE framework_code=@Code AND is_active=true ORDER BY step_order",
                new { Code = code.ToUpper() });
            return Results.Ok(steps);
        });

        // ── Get all controls for a framework (template library, read-only) ────
        // Powers the Compliance Admin's framework selection: lists every control
        // in the framework so they can be selected and copied into AuditControls.
        g.MapGet("/{code}/controls", async (string code, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var rows = await db.QueryAsync($@"
                SELECT c.id                AS ""id"",
                       c.ref               AS ""controlId"",
                       cd.area             AS ""controlObjective"",
                       c.title             AS ""controlTitle"",
                       c.description       AS ""requirementSummary"",
                       c.evidence_required AS ""evidenceRequired"",
                       cd.standard         AS ""frameworkCode"",
                       'Medium'            AS ""priority"",
                       cd.area             AS ""theme""
                FROM {sc}.controls c
                JOIN {sc}.control_domains cd ON c.domain_id = cd.id
                WHERE cd.standard = @Code
                ORDER BY c.ref",
                new { Code = code.ToUpper() });
            return Results.Ok(rows);
        });

        // ── Create a new framework (zero code changes needed) ─────────────────
        g.MapPost("/", async (CreateFrameworkReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var code  = req.Code.ToUpper().Replace(" ", "_").Replace("-", "_");
            db.Open();

            // Check code is unique
            var exists = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {sc}.frameworks WHERE code=@Code", new { Code = code });
            if (exists > 0)
                return Results.Conflict(new { error = $"Framework with code '{code}' already exists" });

            // Insert framework
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.frameworks(id,code,name,short_name,version,description,category,color,icon,is_active,sort_order)
                VALUES(gen_random_uuid()::VARCHAR,@Code,@Name,@ShortName,@Version,@Desc,@Category,@Color,@Icon,true,@Sort)",
                new { Code = code, req.Name, ShortName = req.ShortName ?? req.Name,
                      req.Version, Desc = req.Description, Category = req.Category ?? "security",
                      Color = req.Color ?? "#6366f1", Icon = req.Icon ?? "◈", Sort = req.SortOrder ?? 99 });

            // Create workflow steps:
            //  Standard system steps: Evidence Collection (1), Control Testing (2),
            //                         Gap Analysis (gap_analysis), Report Generation, Review, Archive
            //  User custom steps: inserted between Control Testing and Gap Analysis
            var systemSteps = new[]
            {
                (1, "Evidence Collection", "evidence_collection", "Gather all required evidence for this framework's controls"),
                (2, "Control Testing",     "control_testing",     "Test each control against the collected evidence"),
            };
            var systemStepsPost = new[]
            {
                ("Gap Analysis",      "gap_analysis",      "AI-assisted identification of gaps and non-conformities"),
                ("Report Generation", "report_generation", "Generate draft audit report from findings"),
                ("Review & Sign-off", "review_signoff",    "Auditor review and lead sign-off on findings"),
                ("Archive & Close",   "archive_close",     "Archive evidence, finalise report and close the audit cycle"),
            };

            // Insert pre-gap system steps
            foreach (var (order, name, stype, desc) in systemSteps)
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.framework_workflow_steps(id,framework_code,step_order,name,description,step_type)
                    VALUES(gen_random_uuid()::VARCHAR,@Code,@Order,@Name,@Desc,@Type)",
                    new { Code = code, Order = order, Name = name, Desc = desc, Type = stype });

            // Insert user custom steps between 2 and gap
            var customOffset = 3;
            if (req.WorkflowSteps?.Length > 0)
            {
                foreach (var (step, i) in req.WorkflowSteps.Select((s, i) => (s, i)))
                    await db.ExecuteAsync($@"
                        INSERT INTO {sc}.framework_workflow_steps(id,framework_code,step_order,name,description,step_type)
                        VALUES(gen_random_uuid()::VARCHAR,@Code,@Order,@Name,@Desc,'custom')",
                        new { Code = code, Order = customOffset + i, Name = step.Name, Desc = step.Description ?? "" });
                customOffset += req.WorkflowSteps.Length;
            }

            // Insert post-gap system steps
            foreach (var (name, stype, desc) in systemStepsPost)
            {
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.framework_workflow_steps(id,framework_code,step_order,name,description,step_type)
                    VALUES(gen_random_uuid()::VARCHAR,@Code,@Order,@Name,@Desc,@Type)",
                    new { Code = code, Order = customOffset++, Name = name, Desc = desc, Type = stype });
            }

            // If domains provided, create them
            if (req.Domains != null)
            {
                foreach (var d in req.Domains)
                {
                    var domainId = $"{code.Substring(0, Math.Min(6, code.Length))}-{(req.Domains.ToList().IndexOf(d) + 1):D2}";
                    await db.ExecuteAsync($@"
                        INSERT INTO {sc}.control_domains(id,standard,area,ref_code,description,score,status,risk_level,controls_count)
                        VALUES(@Id,@Standard,@Area,@Ref,@Desc,0,'not-started','high',0)
                        ON CONFLICT DO NOTHING",
                        new { Id = domainId, Standard = code, Area = d.Area, Ref = d.RefCode, Desc = d.Description });
                }

                await db.ExecuteAsync($@"
                    UPDATE {sc}.frameworks SET domain_count=@Count WHERE code=@Code",
                    new { Count = req.Domains.Length, Code = code });
            }

            await Helpers.Log(db, sc, email, "framework.created", "frameworks", code,
                new { name = req.Name, code, domains = req.Domains?.Length ?? 0 });

            var totalSteps = systemSteps.Length + (req.WorkflowSteps?.Length ?? 0) + systemStepsPost.Length;
            return Results.Created($"/api/frameworks/{code}", new
            {
                code,
                message = $"Framework '{req.Name}' created. Add domains via POST /api/frameworks/{code}/domains",
                workflow_steps = totalSteps
            });
        });

        // ── Update workflow steps for a framework ─────────────────────────────
        // Accepts an array of custom step objects {name,description}.
        // Preserves existing system steps (evidence_collection, control_testing, gap_analysis,
        // report_generation, review_signoff, archive_close); replaces only 'custom' rows.
        g.MapPut("/{code}/steps", async (string code, WorkflowStepReq[] steps, HttpContext ctx, IDbConnection db) =>
        {
            var sc  = Helpers.Schema(ctx);
            var fwCode = code.ToUpper();
            db.Open();

            // Ensure system steps exist for this framework (idempotent)
            var systemStepDefs = new[]
            {
                (1, "Evidence Collection", "evidence_collection", "Gather all required evidence"),
                (2, "Control Testing",     "control_testing",     "Test each control against evidence"),
                (3, "Gap Analysis",        "gap_analysis",        "AI-assisted gap identification"),
                (4, "Report Generation",   "report_generation",   "Generate draft audit report"),
                (5, "Review & Sign-off",   "review_signoff",      "Auditor review and sign-off"),
                (6, "Archive & Close",     "archive_close",       "Archive and close the audit cycle"),
            };
            foreach (var (order, name, stype, desc) in systemStepDefs)
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.framework_workflow_steps(id,framework_code,step_order,name,description,step_type,is_active)
                    VALUES(gen_random_uuid()::VARCHAR,@Code,@Order,@Name,@Desc,@Type,true)
                    ON CONFLICT DO NOTHING",
                    new { Code = fwCode, Order = order, Name = name, Desc = desc, Type = stype });

            // Also fix any seeded system steps that have NULL step_type
            await db.ExecuteAsync($@"
                UPDATE {sc}.framework_workflow_steps SET step_type=CASE
                    WHEN name='Evidence Collection' THEN 'evidence_collection'
                    WHEN name='Control Testing'     THEN 'control_testing'
                    WHEN name='Gap Analysis'        THEN 'gap_analysis'
                    WHEN name='Report Generation'   THEN 'report_generation'
                    WHEN name ILIKE '%Sign%'        THEN 'review_signoff'
                    WHEN name ILIKE '%Archive%'     THEN 'archive_close'
                    ELSE 'standard'
                END
                WHERE framework_code=@Code AND (step_type IS NULL OR step_type='standard')
                  AND name IN ('Evidence Collection','Control Testing','Gap Analysis',
                               'Report Generation','Review & Sign-off','Archive & Close')",
                new { Code = fwCode });

            // Remove old custom steps, then re-insert the new ones
            await db.ExecuteAsync($@"
                DELETE FROM {sc}.framework_workflow_steps
                WHERE framework_code=@Code AND step_type='custom'",
                new { Code = fwCode });

            // Slot custom steps between control_testing (order 2) and gap_analysis
            // Shift post-gap system steps up to make room
            var customCount = steps.Length;
            if (customCount > 0)
            {
                // Push gap_analysis and above up by customCount
                await db.ExecuteAsync($@"
                    UPDATE {sc}.framework_workflow_steps
                    SET step_order = step_order + @Shift
                    WHERE framework_code=@Code
                      AND step_type IN ('gap_analysis','report_generation','review_signoff','archive_close')",
                    new { Code = fwCode, Shift = customCount });

                for (int i = 0; i < steps.Length; i++)
                    await db.ExecuteAsync($@"
                        INSERT INTO {sc}.framework_workflow_steps(id,framework_code,step_order,name,description,step_type,is_active,allow_file_upload)
                        VALUES(gen_random_uuid()::VARCHAR,@Code,@Order,@Name,@Desc,'custom',true,@AllowUpload)",
                        new { Code = fwCode, Order = 3 + i, Name = steps[i].Name, Desc = steps[i].Description ?? "", AllowUpload = steps[i].AllowFileUpload });
            }

            var all = await db.QueryAsync(
                $"SELECT * FROM {sc}.framework_workflow_steps WHERE framework_code=@Code AND is_active=true ORDER BY step_order",
                new { Code = fwCode });
            return Results.Ok(all);
        });

        // ── Add domain to existing framework ──────────────────────────────────
        g.MapPost("/{code}/domains", async (string code, CreateDomainReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var fwCode = code.ToUpper();
            db.Open();

            var fw = await db.QueryFirstOrDefaultAsync(
                $"SELECT id FROM {sc}.frameworks WHERE code=@Code", new { Code = fwCode });
            if (fw == null) return Results.NotFound(new { error = $"Framework '{fwCode}' not found" });

            var count = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {sc}.control_domains WHERE standard=@Code", new { Code = fwCode });
            var domainId = $"{fwCode.Substring(0, Math.Min(4, fwCode.Length))}-{(count + 1):D2}";

            await db.ExecuteAsync($@"
                INSERT INTO {sc}.control_domains(id,standard,area,ref_code,description,score,status,risk_level,controls_count)
                VALUES(@Id,@Standard,@Area,@Ref,@Desc,0,'not-started',@Risk,0)",
                new { Id = req.DomainId ?? domainId, Standard = fwCode, Area = req.Area,
                      Ref = req.RefCode, Desc = req.Description, Risk = req.RiskLevel ?? "medium" });

            await db.ExecuteAsync(
                $"UPDATE {sc}.frameworks SET domain_count=domain_count+1,updated_at=NOW() WHERE code=@Code",
                new { Code = fwCode });

            return Results.Created($"/api/frameworks/{fwCode}/domains", new { id = req.DomainId ?? domainId });
        });

        // ── Update framework metadata ─────────────────────────────────────────
        g.MapPut("/{code}", async (string code, UpdateFrameworkReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.frameworks SET
                    name=COALESCE(@Name,name),
                    short_name=COALESCE(@ShortName,short_name),
                    description=COALESCE(@Desc,description),
                    color=COALESCE(@Color,color),
                    icon=COALESCE(@Icon,icon),
                    sort_order=COALESCE(@Sort,sort_order),
                    updated_at=NOW()
                WHERE code=@Code",
                new { Code = code.ToUpper(), req.Name, ShortName = req.ShortName,
                      Desc = req.Description, req.Color, req.Icon, Sort = req.SortOrder });
            return Results.Ok(new { message = "Framework updated" });
        });

        // -- Deactivate framework (soft delete) --
        g.MapDelete("/{code}", async (string code, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync(
                $"UPDATE {sc}.frameworks SET is_active=false,updated_at=NOW() WHERE code=@Code",
                new { Code = code.ToUpper() });
            await Helpers.Log(db, sc, email, "framework.deactivated", "frameworks", code.ToUpper());
            return Results.Ok(new { message = $"Framework '{code}' deactivated" });
        });
        // ── Cross-mapping matrix ──────────────────────────────────────────
        g.MapGet("/cross-map", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();

            var frameworks = (await db.QueryAsync(
                $"SELECT code,name,short_name,color FROM {sc}.frameworks WHERE is_active=true ORDER BY sort_order")).ToList();

            var domains = (await db.QueryAsync($@"
                SELECT cd.standard, cd.area, cd.ref_code, cd.score, cd.status, cd.risk_level,
                       f.name as framework_name, f.color as framework_color, f.short_name as framework_short
                FROM {sc}.control_domains cd
                JOIN {sc}.frameworks f ON cd.standard=f.code AND f.is_active=true
                ORDER BY cd.standard, cd.area")).ToList();

            var allAreas = ((IEnumerable<dynamic>)domains)
                .Select(d => (string)d.area).Distinct().OrderBy(a => a).ToList();

            // Shared areas: areas present in 2+ frameworks
            var sharedAreas = allAreas
                .Select(area => {
                    var fws = ((IEnumerable<dynamic>)domains)
                        .Where(d => (string)d.area == area)
                        .Select(d => new {
                            code  = (string)d.standard,
                            name  = (string)(d.framework_short ?? d.framework_name),
                            score = (int)d.score,
                            status= (string)d.status,
                            color = (string)(d.framework_color ?? "#6366f1"),
                        }).ToList();
                    return new { area, frameworks_covered = fws, coverage_count = fws.Count,
                        avg_score = fws.Any() ? (int)Math.Round(fws.Average(f => f.score)) : 0 };
                })
                .Where(a => a.coverage_count > 1)
                .OrderByDescending(a => a.coverage_count).ThenByDescending(a => a.avg_score)
                .ToList();

            // Matrix: rows = frameworks, cols = areas
            var matrixRows = ((IEnumerable<dynamic>)frameworks).Select(fw => {
                var fwCode   = (string)fw.code;
                var fwDomains = ((IEnumerable<dynamic>)domains).Where(d => (string)d.standard == fwCode).ToList();
                return new {
                    framework_code  = fwCode,
                    framework_name  = (string)(fw.short_name ?? fw.name),
                    color           = (string)(fw.color ?? "#6366f1"),
                    cells           = allAreas.Select(area => {
                        var m = fwDomains.FirstOrDefault(d => (string)d.area == area);
                        return new { area, present = m != null, score = m != null ? (int)m.score : 0,
                            status = m != null ? (string)m.status : "gap" };
                    }).ToList(),
                    total_areas = fwDomains.Count,
                    avg_score   = fwDomains.Any() ? (int)Math.Round(fwDomains.Average(d => (int)d.score)) : 0,
                };
            }).ToList();

            // Gap summary per framework
            var gapSummary = ((IEnumerable<dynamic>)frameworks).Select(fw => {
                var fwCode     = (string)fw.code;
                var covered    = ((IEnumerable<dynamic>)domains).Where(d => (string)d.standard == fwCode).Select(d => (string)d.area).ToHashSet();
                var gaps       = allAreas.Where(a => !covered.Contains(a) &&
                    ((IEnumerable<dynamic>)domains).Count(d => (string)d.area == a) >= 2).ToList();
                return new { framework_code = fwCode, framework_name = (string)(fw.short_name ?? fw.name),
                    covered = covered.Count, gaps = gaps.Count, gap_areas = gaps.Take(5).ToList() };
            }).ToList();

            return Results.Ok(new {
                frameworks, shared_areas = sharedAreas, matrix_areas = allAreas,
                matrix_rows = matrixRows, gap_summary = gapSummary, total_areas = allAreas.Count,
            });
        });

        // ── Deactivate framework (soft delete) ─────────────────────────�
        return app;
    }

    record CreateFrameworkReq(
        string Code, string Name, string? ShortName, string? Version,
        string? Description, string? Category, string? Color, string? Icon,
        int? SortOrder, DomainInput[]? Domains, WorkflowStepReq[]? WorkflowSteps);

    record DomainInput(string Area, string? RefCode, string? Description, string? DomainId, string? RiskLevel);

    record CreateDomainReq(string Area, string? RefCode, string? Description, string? DomainId, string? RiskLevel);

    record UpdateFrameworkReq(string? Name, string? ShortName, string? Description,
        string? Color, string? Icon, int? SortOrder);

    record WorkflowStepReq(string Name, string? Description, bool AllowFileUpload = false);
}
