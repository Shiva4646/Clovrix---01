using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ═════════════════════════════════════════════════════════════════════════════
// RISK REGISTER — CRUD over tenant_<t>.risks (Dapper, no EF).
//
//   GET  /api/risks         list (filter: status, category, q)
//   GET  /api/risks/stats   rollup for the register header
//   GET  /api/risks/{id}    single
//   POST /api/risks         create
//   PUT  /api/risks/{id}    update status / treatment
//
// inherent_score / residual_score are generated columns (likelihood*impact).
// Tenant from X-Tenant-ID (Helpers.Schema), matching the other SPA modules.
// ═════════════════════════════════════════════════════════════════════════════
public static class RisksModule
{
    private const string Cols = @"
        id AS ""id"", title AS ""title"", description AS ""description"", category AS ""category"",
        ai_risk_category AS ""aiRiskCategory"", ai_system_id AS ""aiSystemId"",
        likelihood AS ""likelihood"", impact AS ""impact"", inherent_score AS ""inherentScore"",
        residual_likelihood AS ""residualLikelihood"", residual_impact AS ""residualImpact"",
        residual_score AS ""residualScore"", treatment AS ""treatment"", treatment_plan AS ""treatmentPlan"",
        status AS ""status"", domain_id AS ""domainId"", owner_email AS ""ownerEmail"",
        due_date AS ""dueDate"", review_date AS ""reviewDate"", created_by AS ""createdBy"",
        created_at AS ""createdAt""";

    public static WebApplication MapRisksModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/risks").WithTags("Risk Register").RequireAuthorization();

        // ── List ──────────────────────────────────────────────────────────────
        g.MapGet("/", async (HttpContext ctx, IDbConnection db, string? status, string? category, string? q) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var rows = await db.QueryAsync($@"
                SELECT {Cols} FROM {sc}.risks
                WHERE (@Status   IS NULL OR status   = @Status)
                  AND (@Category IS NULL OR category = @Category)
                  AND (@Q        IS NULL OR title ILIKE '%'||@Q||'%')
                ORDER BY inherent_score DESC, created_at DESC",
                new
                {
                    Status   = string.IsNullOrWhiteSpace(status) ? null : status,
                    Category = string.IsNullOrWhiteSpace(category) ? null : category,
                    Q        = string.IsNullOrWhiteSpace(q) ? null : q
                });
            return Results.Ok(rows);
        });

        // ── Stats ─────────────────────────────────────────────────────────────
        g.MapGet("/stats", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var stats = await db.QuerySingleAsync($@"
                SELECT
                    COUNT(*)                                        AS ""total"",
                    COUNT(*) FILTER (WHERE status='open')           AS ""open"",
                    COUNT(*) FILTER (WHERE status='closed')         AS ""closed"",
                    COUNT(*) FILTER (WHERE inherent_score >= 15)    AS ""high"",
                    COUNT(*) FILTER (WHERE inherent_score BETWEEN 8 AND 14) AS ""medium"",
                    COUNT(*) FILTER (WHERE inherent_score < 8)      AS ""low"",
                    COALESCE(ROUND(AVG(inherent_score)),0)          AS ""avgInherent""
                FROM {sc}.risks");
            return Results.Ok(stats);
        });

        // ── Single ────────────────────────────────────────────────────────────
        g.MapGet("/{id}", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var row = await db.QueryFirstOrDefaultAsync(
                $"SELECT {Cols} FROM {sc}.risks WHERE id = @Id", new { Id = id });
            return row is null ? Results.NotFound(new { error = "risk not found" }) : Results.Ok(row);
        });

        // ── Create ────────────────────────────────────────────────────────────
        g.MapPost("/", async (HttpContext ctx, IDbConnection db, CreateRiskReq req) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            if (string.IsNullOrWhiteSpace(req.Title))
                return Results.BadRequest(new { error = "title is required" });

            db.Open();
            var id = Helpers.NewId();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.risks
                    (id, title, description, category, ai_system_id, likelihood, impact,
                     residual_likelihood, residual_impact, treatment, status, owner_email, created_by, created_at)
                VALUES
                    (@Id, @Title, @Description, @Category, @AiSystemId, @Likelihood, @Impact,
                     @ResLikelihood, @ResImpact, @Treatment, 'open', @Owner, @By, NOW())",
                new
                {
                    Id = id, req.Title, req.Description,
                    Category      = string.IsNullOrWhiteSpace(req.Category) ? "operational" : req.Category,
                    AiSystemId    = req.AiSystemId,
                    Likelihood    = Clamp(req.Likelihood ?? 3),
                    Impact        = Clamp(req.Impact ?? 3),
                    ResLikelihood = Clamp(req.ResidualLikelihood ?? 2),
                    ResImpact     = Clamp(req.ResidualImpact ?? 2),
                    Treatment     = string.IsNullOrWhiteSpace(req.Treatment) ? "mitigate" : req.Treatment,
                    Owner         = req.OwnerEmail ?? email, By = email
                });

            await Helpers.Log(db, sc, email, "risk.created", "risks", id, new { req.Title });
            var created = await db.QueryFirstOrDefaultAsync(
                $"SELECT {Cols} FROM {sc}.risks WHERE id = @Id", new { Id = id });
            return Results.Created($"/api/risks/{id}", created);
        });

        // ── Update (status / treatment) ─────────────────────────────────────────
        g.MapPut("/{id}", async (HttpContext ctx, IDbConnection db, string id, UpdateRiskReq req) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var n = await db.ExecuteAsync($@"
                UPDATE {sc}.risks SET
                    status         = COALESCE(@Status, status),
                    treatment      = COALESCE(@Treatment, treatment),
                    treatment_plan = COALESCE(@TreatmentPlan, treatment_plan),
                    updated_at     = NOW()
                WHERE id = @Id",
                new { Id = id, req.Status, req.Treatment, req.TreatmentPlan });
            if (n == 0) return Results.NotFound(new { error = "risk not found" });
            await Helpers.Log(db, sc, email, "risk.updated", "risks", id, new { });
            var row = await db.QueryFirstOrDefaultAsync(
                $"SELECT {Cols} FROM {sc}.risks WHERE id = @Id", new { Id = id });
            return Results.Ok(row);
        });

        return app;
    }

    private static int Clamp(int v) => v < 1 ? 1 : v > 5 ? 5 : v;
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
public record CreateRiskReq(
    string Title, string? Description, string? Category, string? AiSystemId,
    int? Likelihood, int? Impact, int? ResidualLikelihood, int? ResidualImpact,
    string? Treatment, string? OwnerEmail);

public record UpdateRiskReq(string? Status, string? Treatment, string? TreatmentPlan);
