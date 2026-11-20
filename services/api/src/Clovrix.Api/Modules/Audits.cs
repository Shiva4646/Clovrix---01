using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ─────────────────────────────────────────────────────────────────────────────
// Audits module — the audit cycle (create → assign → assess → review → close).
//
//   Block A: secured shell + auth/tenant smoke endpoints.
//   Block B: audit CRUD (create / list / get).
//   Block C: assign-controls (copy framework templates → audit_controls).
//
// The whole group requires an authenticated user; the audit-management endpoints
// additionally require the `admin` policy. Tenant is derived strictly from the
// validated JWT via Helpers.TenantSchema — never from a client header.
// ─────────────────────────────────────────────────────────────────────────────
public static class AuditsModule
{
    public static WebApplication MapAuditsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/audits").WithTags("Audits").RequireAuthorization();

        // ── Diagnostics (Block A) ──────────────────────────────────────────────
        g.MapGet("/_whoami", (HttpContext ctx) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            return Results.Ok(new { tenant = schema, user = Helpers.UserEmail(ctx), roles = Helpers.Roles(ctx) });
        });

        g.MapGet("/_admin-check", (HttpContext ctx) =>
            Results.Ok(new { ok = true, user = Helpers.UserEmail(ctx) }))
         .RequireAuthorization("admin");

        // Reusable projection so every audit read returns the same shape.
        const string AuditCols = @"
            id AS ""Id"", name AS ""Name"", description AS ""Description"", department AS ""Department"",
            business_unit AS ""BusinessUnit"", framework_code AS ""FrameworkCode"",
            start_date AS ""StartDate"", end_date AS ""EndDate"", control_lead AS ""ControlLead"",
            status AS ""Status"", created_by AS ""CreatedBy"", created_at AS ""CreatedAt""";

        // ── Block B: create audit ──────────────────────────────────────────────
        g.MapPost("", async (HttpContext ctx, IDbConnection db, CreateAuditRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.Name)) return Results.BadRequest(new { error = "name is required" });
            if (string.IsNullOrWhiteSpace(req.FrameworkCode)) return Results.BadRequest(new { error = "frameworkCode is required" });

            db.Open();
            var id = Helpers.NewId();
            var createdBy = Helpers.UserEmail(ctx);

            var audit = await db.QuerySingleAsync<AuditDto>($@"
                INSERT INTO {schema}.audits
                    (id, name, description, department, business_unit, framework_code,
                     start_date, end_date, control_lead, status, created_by, created_at)
                VALUES
                    (@Id, @Name, @Description, @Department, @BusinessUnit, @FrameworkCode,
                     @StartDate, @EndDate, @ControlLead, 'draft', @CreatedBy, NOW())
                RETURNING {AuditCols}",
                new
                {
                    Id = id, req.Name, req.Description, req.Department, req.BusinessUnit,
                    req.FrameworkCode, req.StartDate, req.EndDate, req.ControlLead, CreatedBy = createdBy
                });

            await Helpers.Log(db, schema, createdBy, "create", "audit", id, new { req.Name, req.FrameworkCode });
            return Results.Created($"/api/audits/{id}", audit);
        }).RequireAuthorization("admin");

        // ── Block B: list audits ───────────────────────────────────────────────
        g.MapGet("", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var rows = await db.QueryAsync<AuditDto>(
                $"SELECT {AuditCols} FROM {schema}.audits ORDER BY created_at DESC");
            return Results.Ok(rows);
        }).RequireAuthorization("admin");

        // ── Block B: get one audit ─────────────────────────────────────────────
        g.MapGet("/{id}", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var audit = await db.QuerySingleOrDefaultAsync<AuditDto>(
                $"SELECT {AuditCols} FROM {schema}.audits WHERE id = @Id", new { Id = id });
            return audit is null ? Results.NotFound(new { error = "audit not found" }) : Results.Ok(audit);
        }).RequireAuthorization("admin");

        // ── Dashboard metrics (tenant-wide audit-cycle rollup) ─────────────────
        // Single DB source for the dashboards. Readable by any authenticated role
        // (not admin-only) so every role's landing page shows the same live numbers.
        g.MapGet("/metrics", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            var open = new[] { "open", "in_progress", "in-remediation" };
            db.Open();
            var m = await db.QuerySingleAsync<AuditMetricsDto>($@"
                SELECT
                  (SELECT COUNT(*) FROM {schema}.audits)                                   AS ""TotalAudits"",
                  (SELECT COUNT(*) FROM {schema}.audits WHERE status='draft')              AS ""DraftAudits"",
                  (SELECT COUNT(*) FROM {schema}.audits WHERE status='active')             AS ""ActiveAudits"",
                  (SELECT COUNT(*) FROM {schema}.audits WHERE status='closed')             AS ""ClosedAudits"",
                  (SELECT COUNT(*) FROM {schema}.audit_controls)                           AS ""TotalControls"",
                  (SELECT COUNT(*) FROM {schema}.audit_controls WHERE ready_for_assessment) AS ""ReadyControls"",
                  (SELECT COUNT(DISTINCT audit_control_id) FROM {schema}.assessments)      AS ""AssessedControls"",
                  (SELECT COUNT(*) FROM (SELECT DISTINCT ON (audit_control_id) result
                        FROM {schema}.assessments ORDER BY audit_control_id, tested_at DESC) t
                     WHERE t.result='pass')                                                AS ""PassedControls"",
                  (SELECT COUNT(*) FROM (SELECT DISTINCT ON (audit_control_id) result
                        FROM {schema}.assessments ORDER BY audit_control_id, tested_at DESC) t
                     WHERE t.result='fail')                                                AS ""FailedControls"",
                  (SELECT COUNT(*) FROM {schema}.assessments WHERE review_status='pending') AS ""PendingReview"",
                  (SELECT COUNT(*) FROM {schema}.findings WHERE LOWER(status)=ANY(@Open))  AS ""OpenFindings""",
                new { Open = open });

            var completionPct = m.ReadyControls > 0 ? (int)Math.Round(100.0 * m.AssessedControls / m.ReadyControls) : 0;
            var passRate      = m.AssessedControls > 0 ? (int)Math.Round(100.0 * m.PassedControls / m.AssessedControls) : 0;

            return Results.Ok(new
            {
                m.TotalAudits, m.DraftAudits, m.ActiveAudits, m.ClosedAudits,
                m.TotalControls, m.ReadyControls, m.AssessedControls,
                m.PassedControls, m.FailedControls, m.PendingReview, m.OpenFindings,
                completionPct, passRate
            });
        });

        // ── Block C: assign controls ───────────────────────────────────────────
        // Copies the selected framework control templates into audit_controls. The
        // source `controls`/`control_domains` rows are read-only and never mutated.
        g.MapPost("/{id}/assign-controls", async (HttpContext ctx, IDbConnection db, string id, AssignControlsRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            if (req.ControlIds is null || req.ControlIds.Length == 0)
                return Results.BadRequest(new { error = "controlIds is required" });
            if (string.IsNullOrWhiteSpace(req.ControlLead))
                return Results.BadRequest(new { error = "controlLead is required" });

            db.Open();

            // audit must exist
            var auditId = await db.QuerySingleOrDefaultAsync<string>(
                $"SELECT id FROM {schema}.audits WHERE id = @Id", new { Id = id });
            if (auditId is null) return Results.NotFound(new { error = "audit not found" });

            // read the selected control templates (join to domain for objective + framework)
            var templates = (await db.QueryAsync<ControlTemplateRow>($@"
                SELECT c.id                AS ""Id"",
                       c.ref               AS ""Ref"",
                       c.title             AS ""Title"",
                       c.description       AS ""Description"",
                       c.evidence_required AS ""EvidenceRequired"",
                       cd.area             AS ""Area"",
                       cd.standard         AS ""Standard""
                FROM {schema}.controls c
                JOIN {schema}.control_domains cd ON c.domain_id = cd.id
                WHERE c.id = ANY(@Ids)", new { Ids = req.ControlIds })).ToList();

            if (templates.Count == 0)
                return Results.BadRequest(new { error = "no matching controls found for the given controlIds" });

            var by = Helpers.UserEmail(ctx);
            var created = new List<AuditControlDto>();

            using var tx = db.BeginTransaction();
            try
            {
                foreach (var t in templates)
                {
                    var acId = Helpers.NewId();

                    await db.ExecuteAsync($@"
                        INSERT INTO {schema}.audit_controls
                            (id, audit_id, source_control_id, framework_code, control_ref, control_objective,
                             control_title, requirement_summary, priority, theme, implementation_status,
                             assigned_control_lead, version, created_at)
                        VALUES
                            (@Id, @AuditId, @Src, @Fw, @Ref, @Objective, @Title, @Summary, @Priority, @Theme,
                             'Not Started', @Lead, 1, NOW())",
                        new
                        {
                            Id = acId, AuditId = id, Src = t.Id, Fw = t.Standard, Ref = t.Ref,
                            Objective = t.Area, Title = t.Title, Summary = t.Description,
                            Priority = "Medium", Theme = t.Area, Lead = req.ControlLead
                        }, tx);

                    await db.ExecuteAsync($@"
                        INSERT INTO {schema}.audit_control_versions
                            (id, audit_control_id, version, field, modified_by, modified_at, previous_value, updated_value)
                        VALUES (@Id, @AcId, 1, 'Assignment', @By, NOW(), '—', @Val)",
                        new { Id = Helpers.NewId(), AcId = acId, By = by, Val = $"Assigned to {req.ControlLead}" }, tx);

                    created.Add(new AuditControlDto(
                        acId, id, t.Id, t.Standard, t.Ref, t.Area, t.Title, t.Description,
                        "Medium", t.Area, "Not Started", req.ControlLead, 1, DateTime.UtcNow));
                }

                await db.ExecuteAsync(
                    $"UPDATE {schema}.audits SET status='active', updated_at=NOW() WHERE id = @Id",
                    new { Id = id }, tx);

                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }

            await Helpers.Log(db, schema, by, "assign-controls", "audit", id,
                new { count = created.Count, controlLead = req.ControlLead });

            return Results.Ok(created);
        }).RequireAuthorization("admin");

        return app;
    }
}

// ── DTOs (shapes match the frontend mock API) ─────────────────────────────────
public record CreateAuditRequest(
    string Name, string? Description, string? Department, string? BusinessUnit,
    string FrameworkCode, DateTime? StartDate, DateTime? EndDate, string? ControlLead);

public record AuditDto(
    string Id, string Name, string? Description, string? Department, string? BusinessUnit,
    string FrameworkCode, DateTime? StartDate, DateTime? EndDate, string? ControlLead,
    string Status, string? CreatedBy, DateTime CreatedAt);

public record AssignControlsRequest(string[] ControlIds, string ControlLead);

public record AuditControlDto(
    string Id, string AuditId, string? SourceControlId, string? FrameworkCode,
    string ControlRef, string? ControlObjective, string ControlTitle, string? RequirementSummary,
    string? Priority, string? Theme, string ImplementationStatus, string? AssignedControlLead,
    int Version, DateTime CreatedAt);

// Internal row shape when reading source control templates.
public record ControlTemplateRow(
    string Id, string Ref, string Title, string? Description, string? EvidenceRequired,
    string? Area, string Standard);

// Tenant-wide audit-cycle metrics for the dashboards (counts are bigint → long).
public record AuditMetricsDto(
    long TotalAudits, long DraftAudits, long ActiveAudits, long ClosedAudits,
    long TotalControls, long ReadyControls, long AssessedControls,
    long PassedControls, long FailedControls, long PendingReview, long OpenFindings);
