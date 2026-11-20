using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ─────────────────────────────────────────────────────────────────────────────
// Control Mappings module — cross-framework control mapping and alignment.
//
// Mappings represent relationships between controls across different frameworks:
//   - ISO 27001 A.5.1 ≈ SOC 2 CC6.1 (equivalent)
//   - ISO 27001 A.7.1 ≈ SOC 2 L1.1 (partial alignment)
//   - SOC 2 CC6.1 → CSF AC-1 (related)
//
// Mappings are tenant-scoped and can be:
//   1. Reference mappings (shared across audits)
//   2. Audit-specific mappings (linked to audit_control_mappings)
//
// Types: equivalent, partial, related, complements
// Alignment Score: 0.0–1.0 (confidence of mapping)
// ─────────────────────────────────────────────────────────────────────────────
public static class ControlMappingsModule
{
    private static readonly string[] ValidMappingTypes = { "equivalent", "partial", "related", "complements" };

    public static WebApplication MapControlMappingsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/mappings").WithTags("Control Mappings").RequireAuthorization();

        // ── GET /api/mappings/frameworks — list all framework mappings ────────
        g.MapGet("/frameworks", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var mappings = await db.QueryAsync<FrameworkMappingDto>($@"
                SELECT
                    source_framework AS ""SourceFramework"",
                    target_framework AS ""TargetFramework"",
                    COUNT(*) AS ""Count"",
                    AVG(alignment_score) AS ""AvgAlignment"",
                    MIN(alignment_score) AS ""MinAlignment"",
                    MAX(alignment_score) AS ""MaxAlignment""
                FROM {schema}.control_mappings
                GROUP BY source_framework, target_framework
                ORDER BY source_framework, target_framework",
                null);

            return Results.Ok(mappings);
        });

        // ── GET /api/mappings/cross-map/{from}/{to} — get cross-map for frameworks ──
        g.MapGet("/cross-map/{from}/{to}", async (HttpContext ctx, IDbConnection db, string from, string to) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var mappings = await db.QueryAsync<CrossMapDto>($@"
                SELECT
                    id AS ""Id"",
                    source_framework AS ""SourceFramework"",
                    source_control_id AS ""SourceControlId"",
                    target_framework AS ""TargetFramework"",
                    target_control_id AS ""TargetControlId"",
                    mapping_type AS ""MappingType"",
                    alignment_score AS ""AlignmentScore"",
                    notes AS ""Notes""
                FROM {schema}.control_mappings
                WHERE source_framework = @From AND target_framework = @To
                ORDER BY alignment_score DESC, source_control_id",
                new { From = from, To = to });

            return Results.Ok(mappings);
        });

        // ── POST /api/mappings/map-controls — create a new mapping ──────────────
        g.MapPost("/map-controls", async (HttpContext ctx, IDbConnection db, MapControlsRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            if (string.IsNullOrWhiteSpace(req.SourceFramework) || string.IsNullOrWhiteSpace(req.SourceControlId))
                return Results.BadRequest(new { error = "sourceFramework and sourceControlId are required" });
            if (string.IsNullOrWhiteSpace(req.TargetFramework) || string.IsNullOrWhiteSpace(req.TargetControlId))
                return Results.BadRequest(new { error = "targetFramework and targetControlId are required" });
            if (!ValidMappingTypes.Contains(req.MappingType ?? "equivalent"))
                return Results.BadRequest(new { error = $"mappingType must be one of: {string.Join(", ", ValidMappingTypes)}" });

            db.Open();

            var id = Helpers.NewId();
            var createdBy = Helpers.UserEmail(ctx);

            try
            {
                await db.ExecuteAsync($@"
                    INSERT INTO {schema}.control_mappings
                        (id, source_framework, source_control_id, target_framework, target_control_id,
                         mapping_type, alignment_score, notes, created_by, created_at)
                    VALUES
                        (@Id, @SrcFw, @SrcCtl, @TgtFw, @TgtCtl, @Type, @Score, @Notes, @By, NOW())",
                    new
                    {
                        Id = id,
                        SrcFw = req.SourceFramework,
                        SrcCtl = req.SourceControlId,
                        TgtFw = req.TargetFramework,
                        TgtCtl = req.TargetControlId,
                        Type = req.MappingType ?? "equivalent",
                        Score = req.AlignmentScore ?? 0.5m,
                        Notes = req.Notes,
                        By = createdBy
                    });

                await Helpers.Log(db, schema, createdBy, "map-controls", "control_mapping", id,
                    new { source = $"{req.SourceFramework}/{req.SourceControlId}", target = $"{req.TargetFramework}/{req.TargetControlId}" });

                return Results.Created($"/api/mappings/{id}", new { id, req.SourceFramework, req.SourceControlId, req.TargetFramework, req.TargetControlId, req.MappingType, req.AlignmentScore, req.Notes });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("unique"))
                    return Results.Problem(statusCode: 409, title: "Conflict", detail: "Mapping already exists for these controls");
                throw;
            }
        });

        // ── GET /api/control/{id}/mappings — get mappings for an audit control ──
        g.MapGet("/control/{id}/mappings", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            // Get the source control ID for this audit control
            var ac = await db.QuerySingleOrDefaultAsync<(string? SourceId, string? Framework)>($@"
                SELECT source_control_id, framework_code FROM {schema}.audit_controls WHERE id = @Id",
                new { Id = id });

            if (ac.SourceId is null)
                return Results.Ok(new List<ControlMappingDto>());

            // Find all mappings where this control is either source or target
            var mappings = await db.QueryAsync<ControlMappingDto>($@"
                SELECT
                    id AS ""Id"",
                    source_framework AS ""SourceFramework"",
                    source_control_id AS ""SourceControlId"",
                    target_framework AS ""TargetFramework"",
                    target_control_id AS ""TargetControlId"",
                    mapping_type AS ""MappingType"",
                    alignment_score AS ""AlignmentScore"",
                    notes AS ""Notes""
                FROM {schema}.control_mappings
                WHERE (source_control_id = @CtlRef AND source_framework = @Fw)
                   OR (target_control_id = @CtlRef)
                ORDER BY alignment_score DESC",
                new { CtlRef = ac.SourceId, Fw = ac.Framework ?? "" });

            return Results.Ok(mappings);
        });

        // ── PUT /api/mappings/{id}/notes — update mapping notes ────────────────
        g.MapPut("/mappings/{id}/notes", async (HttpContext ctx, IDbConnection db, string id, UpdateNotesRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var updated = await db.ExecuteAsync($@"
                UPDATE {schema}.control_mappings
                SET notes = @Notes, updated_at = NOW()
                WHERE id = @Id",
                new { Id = id, Notes = req.Notes });

            if (updated == 0)
                return Results.NotFound(new { error = "mapping not found" });

            var updatedBy = Helpers.UserEmail(ctx);
            await Helpers.Log(db, schema, updatedBy, "update-mapping", "control_mapping", id, new { notes = req.Notes });

            return Results.Ok(new { id, notes = req.Notes });
        });

        // ── DELETE /api/mappings/{id} — delete a mapping ───────────────────────
        g.MapDelete("/mappings/{id}", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var deleted = await db.ExecuteAsync($@"
                DELETE FROM {schema}.control_mappings WHERE id = @Id",
                new { Id = id });

            if (deleted == 0)
                return Results.NotFound(new { error = "mapping not found" });

            var deletedBy = Helpers.UserEmail(ctx);
            await Helpers.Log(db, schema, deletedBy, "delete-mapping", "control_mapping", id, new { });

            return Results.Ok(new { id, deleted });
        });

        // ── GET /api/mappings/audit-coverage — audit cross-compliance coverage ──
        g.MapGet("/audit-coverage", async (HttpContext ctx, IDbConnection db, string? auditId) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var query = $@"
                SELECT
                    a.id AS ""AuditId"",
                    a.name AS ""AuditName"",
                    a.framework_code AS ""PrimaryFramework"",
                    COUNT(DISTINCT ac.id) AS ""TotalControls"",
                    COUNT(DISTINCT acm.mapping_id) AS ""MappedControls"",
                    COUNT(DISTINCT m.target_framework) AS ""SecondaryFrameworks"",
                    ROUND(100.0 * COUNT(DISTINCT acm.mapping_id) / NULLIF(COUNT(DISTINCT ac.id), 0), 2) AS ""MappingCoverage""
                FROM {schema}.audits a
                LEFT JOIN {schema}.audit_controls ac ON ac.audit_id = a.id
                LEFT JOIN {schema}.audit_control_mappings acm ON acm.audit_control_id = ac.id
                LEFT JOIN {schema}.control_mappings m ON m.id = acm.mapping_id
                WHERE 1=1";

            if (!string.IsNullOrWhiteSpace(auditId))
                query += " AND a.id = @AuditId";

            query += @"
                GROUP BY a.id, a.name, a.framework_code
                ORDER BY a.created_at DESC";

            var coverage = await db.QueryAsync<AuditCoverageDto>(query, new { AuditId = auditId });
            return Results.Ok(coverage);
        });

        return app;
    }
}

// ── DTOs ───────────────────────────────────────────────────────────────────────
public record MapControlsRequest(
    string SourceFramework, string SourceControlId,
    string TargetFramework, string TargetControlId,
    string? MappingType, decimal? AlignmentScore, string? Notes);

public record FrameworkMappingDto(
    string SourceFramework, string TargetFramework, int Count,
    decimal? AvgAlignment, decimal? MinAlignment, decimal? MaxAlignment);

public record CrossMapDto(
    string Id, string SourceFramework, string SourceControlId,
    string TargetFramework, string TargetControlId,
    string MappingType, decimal? AlignmentScore, string? Notes);

public record ControlMappingDto(
    string Id, string SourceFramework, string SourceControlId,
    string TargetFramework, string TargetControlId,
    string MappingType, decimal? AlignmentScore, string? Notes);

public record AuditCoverageDto(
    string AuditId, string AuditName, string? PrimaryFramework,
    int TotalControls, int MappedControls, int SecondaryFrameworks,
    decimal MappingCoverage);
