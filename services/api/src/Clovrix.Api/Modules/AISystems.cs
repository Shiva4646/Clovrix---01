using System.Data;
using System.Text.Json;
using Dapper;

namespace Clovrix.Api.Modules;

// ═════════════════════════════════════════════════════════════════════════════
// AI SYSTEM REGISTRY — CRUD over tenant_<t>.ai_systems (Dapper, no EF).
//
//   GET    /api/ai-systems            list (filter: stage, risk, q)
//   GET    /api/ai-systems/{id}       single
//   POST   /api/ai-systems            register a new AI system
//   PUT    /api/ai-systems/{id}       update
//   POST   /api/ai-systems/{id}/retire   soft-retire (lifecycle → retired)
//
// Tenant from X-Tenant-ID (Helpers.Schema), matching the other read/write
// modules the SPA already calls. The jsonb columns (frameworks, deployment_envs,
// data_sources) are written as JSON strings cast to ::jsonb.
// ═════════════════════════════════════════════════════════════════════════════
public static class AISystemsModule
{
    private const string Cols = @"
        id AS ""id"", system_id AS ""systemId"", name AS ""name"", description AS ""description"",
        model_type AS ""modelType"", business_unit AS ""businessUnit"", business_owner AS ""businessOwner"",
        technical_owner AS ""technicalOwner"", lifecycle_stage AS ""lifecycleStage"", risk_class AS ""riskClass"",
        status AS ""status"", primary_framework AS ""primaryFramework"", frameworks AS ""frameworks"",
        deployment_envs AS ""deploymentEnvs"", data_sources AS ""dataSources"", vendor_id AS ""vendorId"",
        version AS ""version"", compliance_score AS ""complianceScore"", next_review_date AS ""nextReviewDate"",
        registered_by AS ""registeredBy"", created_at AS ""createdAt"", updated_at AS ""updatedAt""";

    public static WebApplication MapAISystemsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/ai-systems").WithTags("AI Systems").RequireAuthorization();

        // ── List ──────────────────────────────────────────────────────────────
        g.MapGet("", async (HttpContext ctx, IDbConnection db, string? stage, string? risk, string? q) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var rows = await db.QueryAsync($@"
                SELECT {Cols} FROM {sc}.ai_systems
                WHERE (@Stage IS NULL OR lifecycle_stage = @Stage)
                  AND (@Risk  IS NULL OR risk_class      = @Risk)
                  AND (@Q     IS NULL OR name ILIKE '%'||@Q||'%' OR system_id ILIKE '%'||@Q||'%')
                ORDER BY created_at DESC",
                new
                {
                    Stage = string.IsNullOrWhiteSpace(stage) ? null : stage!.ToLowerInvariant(),
                    Risk  = string.IsNullOrWhiteSpace(risk)  ? null : risk!.ToLowerInvariant(),
                    Q     = string.IsNullOrWhiteSpace(q)     ? null : q
                });
            return Results.Ok(rows);
        });

        // ── Single ────────────────────────────────────────────────────────────
        g.MapGet("/{id}", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var row = await db.QueryFirstOrDefaultAsync(
                $"SELECT {Cols} FROM {sc}.ai_systems WHERE id = @Id OR system_id = @Id", new { Id = id });
            return row is null ? Results.NotFound(new { error = "AI system not found" }) : Results.Ok(row);
        });

        // ── Register ────────────────────────────────────────────────────────────
        g.MapPost("", async (HttpContext ctx, IDbConnection db, CreateAISystemRequest req) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.BadRequest(new { error = "name is required" });

            db.Open();
            var id       = Helpers.NewId();
            var systemId = req.SystemId?.Trim() is { Length: > 0 } sid ? sid : $"AI-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

            var frameworks = JsonSerializer.Serialize(req.Frameworks ?? Array.Empty<string>());
            var envs       = JsonSerializer.Serialize(
                string.IsNullOrWhiteSpace(req.DeploymentEnv) ? Array.Empty<string>() : new[] { req.DeploymentEnv! });
            var sources    = JsonSerializer.Serialize(
                string.IsNullOrWhiteSpace(req.DataSources) ? Array.Empty<string>() : new[] { req.DataSources! });

            await db.ExecuteAsync($@"
                INSERT INTO {sc}.ai_systems
                    (id, system_id, name, description, model_type, business_unit, business_owner,
                     lifecycle_stage, risk_class, status, primary_framework, frameworks, deployment_envs,
                     data_sources, vendor_id, next_review_date, compliance_score, registered_by, created_at)
                VALUES
                    (@Id, @SystemId, @Name, @Description, @ModelType, @BusinessUnit, @BusinessOwner,
                     @Stage, @Risk, 'active', @PrimaryFramework, @Frameworks::jsonb, @Envs::jsonb,
                     @Sources::jsonb, @VendorId, @NextReview, 0, @By, NOW())",
                new
                {
                    Id = id, SystemId = systemId, req.Name, req.Description,
                    ModelType = string.IsNullOrWhiteSpace(req.ModelType) ? "classification" : req.ModelType,
                    BusinessUnit = req.BusinessUnit, BusinessOwner = req.BusinessOwner,
                    Stage = (req.LifecycleStage ?? "development").ToLowerInvariant(),
                    Risk  = (req.RiskClass ?? "medium").ToLowerInvariant(),
                    PrimaryFramework = req.Frameworks is { Length: > 0 } ? req.Frameworks![0] : null,
                    Frameworks = frameworks, Envs = envs, Sources = sources,
                    VendorId = req.ThirdParty == true ? req.Vendor : null,
                    NextReview = ParseDate(req.GoLive), By = email
                });

            await Helpers.Log(db, sc, email, "ai_system.created", "ai_systems", id, new { systemId, req.Name });
            var created = await db.QueryFirstOrDefaultAsync(
                $"SELECT {Cols} FROM {sc}.ai_systems WHERE id = @Id", new { Id = id });
            return Results.Created($"/api/ai-systems/{id}", created);
        });

        // ── Update ────────────────────────────────────────────────────────────
        g.MapPut("/{id}", async (HttpContext ctx, IDbConnection db, string id, UpdateAISystemRequest req) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            var exists = await db.QueryFirstOrDefaultAsync<string>(
                $"SELECT id FROM {sc}.ai_systems WHERE id = @Id", new { Id = id });
            if (exists is null) return Results.NotFound(new { error = "AI system not found" });

            await db.ExecuteAsync($@"
                UPDATE {sc}.ai_systems SET
                    name            = COALESCE(@Name, name),
                    description     = COALESCE(@Description, description),
                    model_type      = COALESCE(@ModelType, model_type),
                    business_unit   = COALESCE(@BusinessUnit, business_unit),
                    business_owner  = COALESCE(@BusinessOwner, business_owner),
                    lifecycle_stage = COALESCE(@Stage, lifecycle_stage),
                    risk_class      = COALESCE(@Risk, risk_class),
                    vendor_id       = COALESCE(@VendorId, vendor_id),
                    updated_at      = NOW()
                WHERE id = @Id",
                new
                {
                    Id = id, req.Name, req.Description, req.ModelType, req.BusinessUnit, req.BusinessOwner,
                    Stage = req.LifecycleStage?.ToLowerInvariant(), Risk = req.RiskClass?.ToLowerInvariant(),
                    VendorId = req.Vendor
                });

            await Helpers.Log(db, sc, email, "ai_system.updated", "ai_systems", id, new { });
            var row = await db.QueryFirstOrDefaultAsync(
                $"SELECT {Cols} FROM {sc}.ai_systems WHERE id = @Id", new { Id = id });
            return Results.Ok(row);
        });

        // ── Retire (soft) ───────────────────────────────────────────────────────
        g.MapPost("/{id}/retire", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var n = await db.ExecuteAsync(
                $"UPDATE {sc}.ai_systems SET lifecycle_stage='retired', status='retired', updated_at=NOW() WHERE id=@Id",
                new { Id = id });
            if (n == 0) return Results.NotFound(new { error = "AI system not found" });
            await Helpers.Log(db, sc, email, "ai_system.retired", "ai_systems", id, new { });
            return Results.Ok(new { id, status = "retired" });
        });

        return app;
    }

    private static DateTime? ParseDate(string? s) =>
        DateTime.TryParse(s, out var d) ? d.Date : null;
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
public record CreateAISystemRequest(
    string Name, string? SystemId, string? Description, string? ModelType,
    string? BusinessUnit, string? BusinessOwner, string? LifecycleStage, string? RiskClass,
    string? DataSources, bool? ThirdParty, string? Vendor, string? DeploymentEnv,
    string? GoLive, string[]? Frameworks);

public record UpdateAISystemRequest(
    string? Name, string? Description, string? ModelType, string? BusinessUnit,
    string? BusinessOwner, string? LifecycleStage, string? RiskClass, string? Vendor);
