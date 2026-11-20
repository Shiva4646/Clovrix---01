using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// CONTROL LIBRARY — Centralized domain + control management
// Endpoints:
//   GET    /api/control-library/domains                       list all domains
//   PUT    /api/control-library/domains/:id                   update domain
//   GET    /api/control-library/domains/:id/controls          list controls in domain
//   POST   /api/control-library/domains/:id/controls          add control to domain
//   GET    /api/control-library/controls/search               search existing controls
//   PUT    /api/control-library/controls/:id                  update control
//   DELETE /api/control-library/domains/:domainId/controls/:controlId  remove from domain
//   PUT    /api/control-library/domains/:domainId/controls/:controlId/mandatory  toggle mandatory
// ══════════════════════════════════════════════════════════════════════════════
public static class ControlLibraryModule
{
    public static WebApplication MapControlLibraryModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/control-library").WithTags("ControlLibrary");

        // ── List domains (optionally filter by framework) ─────────────────────
        g.MapGet("/domains", async (HttpContext ctx, IDbConnection db,
            string? framework = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var where = framework != null ? "WHERE cd.standard = @Framework" : "";
            var domains = await db.QueryAsync($@"
                SELECT cd.*,
                    f.name        AS framework_name,
                    f.color       AS framework_color,
                    f.icon        AS framework_icon,
                    COUNT(c.id)   AS total_controls,
                    COUNT(c.id) FILTER (WHERE c.is_mandatory) AS mandatory_controls,
                    COUNT(c.id) FILTER (WHERE c.status IN ('implemented','pass','compliant')) AS passing_controls
                FROM {sc}.control_domains cd
                LEFT JOIN {sc}.frameworks f   ON f.code = cd.standard
                LEFT JOIN {sc}.controls   c   ON c.domain_id = cd.id
                {where}
                GROUP BY cd.id, f.name, f.color, f.icon
                ORDER BY cd.standard, cd.ref_code NULLS LAST, cd.area",
                new { Framework = framework });
            return Results.Ok(domains);
        });

        // ── Update domain details ─────────────────────────────────────────────
        g.MapPut("/domains/{id}", async (string id, UpdateDomainReq req,
            HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            // Accept either Area or Name (frontend may send either)
            var areaValue = req.Area ?? req.Name;
            await db.ExecuteAsync($@"
                UPDATE {sc}.control_domains SET
                    area        = COALESCE(@Area, area),
                    ref_code    = COALESCE(@RefCode, ref_code),
                    description = COALESCE(@Description, description),
                    risk_level  = COALESCE(@RiskLevel, risk_level),
                    updated_at  = NOW()
                WHERE id = @Id",
                new { Id = id, Area = areaValue, req.RefCode, req.Description, req.RiskLevel });
            await Helpers.Log(db, sc, email, "domain.updated", "control_domains", id);
            return Results.Ok(new { message = "Domain updated" });
        });

        // ── List controls in a domain ─────────────────────────────────────────
        g.MapGet("/domains/{id}/controls", async (string id,
            HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            // Return controls from both primary domain_id and the control_domain_map
            var controls = await db.QueryAsync($@"
                SELECT DISTINCT c.*,
                    COALESCE(cdm.is_mandatory, c.is_mandatory) AS is_mandatory,
                    cd.area AS domain_area, cd.standard,
                    EXISTS(
                        SELECT 1 FROM {sc}.control_domain_map m
                        WHERE m.control_id = c.id AND m.domain_id != @DomainId
                    ) AS shared_across_domains
                FROM {sc}.controls c
                LEFT JOIN {sc}.control_domain_map cdm
                    ON cdm.control_id = c.id AND cdm.domain_id = @DomainId
                LEFT JOIN {sc}.control_domains cd ON cd.id = c.domain_id
                WHERE c.domain_id = @DomainId
                   OR cdm.control_id IS NOT NULL
                ORDER BY c.ref",
                new { DomainId = id });
            return Results.Ok(controls);
        });

        // ── Search existing controls (for reuse across domains) ───────────────
        g.MapGet("/controls/search", async (HttpContext ctx, IDbConnection db,
            string? q = null, string? framework = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var filters = new List<string>();
            if (!string.IsNullOrWhiteSpace(q))
                filters.Add("(LOWER(c.ref) LIKE @Pattern OR LOWER(c.title) LIKE @Pattern OR LOWER(c.description) LIKE @Pattern)");
            if (!string.IsNullOrWhiteSpace(framework))
                filters.Add("cd.standard = @Framework");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";
            var pattern = string.IsNullOrWhiteSpace(q) ? null : $"%{q.ToLower()}%";

            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref, c.title, c.description, c.status, c.is_mandatory,
                       cd.id AS domain_id, cd.area AS domain_area, cd.standard,
                       f.name AS framework_name, f.color AS framework_color
                FROM {sc}.controls c
                JOIN {sc}.control_domains cd ON cd.id = c.domain_id
                LEFT JOIN {sc}.frameworks f ON f.code = cd.standard
                {where}
                ORDER BY c.ref
                LIMIT 50",
                new { Pattern = pattern, Framework = framework });
            return Results.Ok(controls);
        });

        // ── Add a control to a domain (new or reuse existing) ─────────────────
        g.MapPost("/domains/{domainId}/controls", async (string domainId,
            AddControlReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            var domain = await db.QueryFirstOrDefaultAsync(
                $"SELECT * FROM {sc}.control_domains WHERE id=@Id", new { Id = domainId });
            if (domain == null) return Results.NotFound(new { error = "Domain not found" });

            string controlId;

            if (!string.IsNullOrEmpty(req.ExistingControlId))
            {
                // Reuse existing control — just add to control_domain_map
                controlId = req.ExistingControlId;
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.control_domain_map(id, control_id, domain_id, is_mandatory)
                    VALUES(gen_random_uuid()::VARCHAR, @CtrlId, @DomainId, @IsMandatory)
                    ON CONFLICT(control_id, domain_id) DO UPDATE SET is_mandatory=EXCLUDED.is_mandatory",
                    new { CtrlId = controlId, DomainId = domainId,
                          IsMandatory = req.IsMandatory ?? false });
            }
            else
            {
                // Create new control
                controlId = Helpers.NewId();
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.controls(id,domain_id,ref,title,description,testing_procedure,
                        evidence_required,frequency,status,automated,owner_email,is_mandatory)
                    VALUES(@Id,@DomainId,@Ref,@Title,@Desc,@TestProc,@EvidReq,@Freq,'not-tested',@Auto,@Owner,@IsMandatory)",
                    new { Id = controlId, DomainId = domainId,
                          Ref     = req.Ref ?? $"{(string)domain.ref_code}-{DateTime.UtcNow.Ticks % 1000:D3}",
                          req.Title, Desc = req.Description,
                          TestProc = req.TestingProcedure, EvidReq = req.EvidenceRequired,
                          Freq  = req.Frequency ?? "annual", Auto  = req.Automated ?? false,
                          Owner = req.OwnerEmail,
                          IsMandatory = req.IsMandatory ?? false });

                // Also add to map
                await db.ExecuteAsync($@"
                    INSERT INTO {sc}.control_domain_map(id, control_id, domain_id, is_mandatory)
                    VALUES(gen_random_uuid()::VARCHAR, @CtrlId, @DomainId, @IsMandatory)
                    ON CONFLICT DO NOTHING",
                    new { CtrlId = controlId, DomainId = domainId,
                          IsMandatory = req.IsMandatory ?? false });

                await db.ExecuteAsync(
                    $"UPDATE {sc}.control_domains SET controls_count=controls_count+1 WHERE id=@Id",
                    new { Id = domainId });
            }

            await Helpers.Log(db, sc, email, "control.added", "controls", controlId,
                new { domain_id = domainId, reused = !string.IsNullOrEmpty(req.ExistingControlId) });
            return Results.Created($"/api/control-library/controls/{controlId}",
                new { id = controlId });
        });

        // ── Update control details ────────────────────────────────────────────
        g.MapPut("/controls/{id}", async (string id, UpdateControlReq req,
            HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.controls SET
                    ref                = COALESCE(@Ref, ref),
                    title              = COALESCE(@Title, title),
                    description        = COALESCE(@Desc, description),
                    testing_procedure  = COALESCE(@TestProc, testing_procedure),
                    evidence_required  = COALESCE(@EvidReq, evidence_required),
                    frequency          = COALESCE(@Frequency, frequency),
                    owner_email        = COALESCE(@OwnerEmail, owner_email),
                    is_mandatory       = COALESCE(@IsMandatory, is_mandatory),
                    updated_at         = NOW()
                WHERE id = @Id",
                new { Id = id, req.Ref, req.Title, Desc = req.Description,
                      TestProc = req.TestingProcedure, EvidReq = req.EvidenceRequired,
                      req.Frequency, req.OwnerEmail, req.IsMandatory });
            await Helpers.Log(db, sc, email, "control.updated", "controls", id);
            return Results.Ok(new { message = "Control updated" });
        });

        // ── Remove control from domain (removes link, not the control itself) ─
        g.MapDelete("/domains/{domainId}/controls/{controlId}", async (
            string domainId, string controlId, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            // Check if this is the primary domain
            var control = await db.QueryFirstOrDefaultAsync(
                $"SELECT domain_id FROM {sc}.controls WHERE id=@Id", new { Id = controlId });
            if (control == null) return Results.NotFound();

            if ((string)control.domain_id == domainId)
            {
                // Check if there are other domain links — if so, remap primary
                var otherMap = await db.QueryFirstOrDefaultAsync($@"
                    SELECT domain_id FROM {sc}.control_domain_map
                    WHERE control_id=@CtrlId AND domain_id != @DomainId
                    LIMIT 1",
                    new { CtrlId = controlId, DomainId = domainId });

                if (otherMap != null)
                {
                    // Remap primary to another domain
                    await db.ExecuteAsync(
                        $"UPDATE {sc}.controls SET domain_id=@NewDomain WHERE id=@Id",
                        new { Id = controlId, NewDomain = (string)otherMap.domain_id });
                }
                else
                {
                    // No other links — fully delete the control
                    await db.ExecuteAsync($"DELETE FROM {sc}.controls WHERE id=@Id", new { Id = controlId });
                    await db.ExecuteAsync(
                        $"UPDATE {sc}.control_domains SET controls_count=GREATEST(controls_count-1,0) WHERE id=@Id",
                        new { Id = domainId });
                    await Helpers.Log(db, sc, email, "control.deleted", "controls", controlId);
                    return Results.Ok(new { message = "Control deleted" });
                }
            }

            // Remove from map
            await db.ExecuteAsync($@"
                DELETE FROM {sc}.control_domain_map
                WHERE control_id=@CtrlId AND domain_id=@DomainId",
                new { CtrlId = controlId, DomainId = domainId });

            await db.ExecuteAsync(
                $"UPDATE {sc}.control_domains SET controls_count=GREATEST(controls_count-1,0) WHERE id=@Id",
                new { Id = domainId });

            await Helpers.Log(db, sc, email, "control.removed_from_domain", "controls", controlId,
                new { domain_id = domainId });
            return Results.Ok(new { message = "Control removed from domain" });
        });

        // ── Link an existing control to an additional domain ─────────────────
        g.MapPost("/controls/{controlId}/link-domain", async (string controlId,
            LinkDomainReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var ctrl = await db.QueryFirstOrDefaultAsync(
                $"SELECT id FROM {sc}.controls WHERE id=@Id", new { Id = controlId });
            if (ctrl == null) return Results.NotFound(new { error = "Control not found" });

            await db.ExecuteAsync($@"
                INSERT INTO {sc}.control_domain_map(id, control_id, domain_id, is_mandatory)
                VALUES(gen_random_uuid()::VARCHAR, @CtrlId, @DomainId, @IsMandatory)
                ON CONFLICT(control_id, domain_id) DO UPDATE SET is_mandatory=EXCLUDED.is_mandatory",
                new { CtrlId = controlId, DomainId = req.DomainId, IsMandatory = req.IsMandatory ?? false });

            await db.ExecuteAsync(
                $"UPDATE {sc}.control_domains SET controls_count=controls_count+1 WHERE id=@Id",
                new { Id = req.DomainId });

            await Helpers.Log(db, sc, email, "control.linked_to_domain", "controls", controlId,
                new { domain_id = req.DomainId });
            return Results.Ok(new { message = "Control linked to domain" });
        });

        // ── Toggle mandatory flag on control+domain relationship ──────────────
        g.MapPut("/domains/{domainId}/controls/{controlId}/mandatory", async (
            string domainId, string controlId, MandatoryReq req,
            HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            // Update in map (scoped to domain)
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.control_domain_map(id, control_id, domain_id, is_mandatory)
                VALUES(gen_random_uuid()::VARCHAR, @CtrlId, @DomainId, @IsMandatory)
                ON CONFLICT(control_id, domain_id) DO UPDATE SET is_mandatory=EXCLUDED.is_mandatory",
                new { CtrlId = controlId, DomainId = domainId, IsMandatory = req.IsMandatory });

            // Also update on the control itself (primary domain relationship)
            var isPrimary = await db.QuerySingleAsync<bool>(
                $"SELECT domain_id=@DomainId FROM {sc}.controls WHERE id=@CtrlId",
                new { CtrlId = controlId, DomainId = domainId });
            if (isPrimary)
                await db.ExecuteAsync(
                    $"UPDATE {sc}.controls SET is_mandatory=@IsMandatory WHERE id=@Id",
                    new { Id = controlId, IsMandatory = req.IsMandatory });

            await Helpers.Log(db, sc, email, "control.mandatory_updated", "controls", controlId,
                new { domain_id = domainId, is_mandatory = req.IsMandatory });
            return Results.Ok(new { message = $"Control marked as {(req.IsMandatory ? "mandatory" : "optional")}" });
        });

        return app;
    }

    record UpdateDomainReq(string? Area, string? Name, string? RefCode, string? Description, string? RiskLevel);

    record AddControlReq(
        string? ExistingControlId,   // if set, reuse this control
        string? Ref, string? Title, string? Description,
        string? TestingProcedure, string? EvidenceRequired,
        string? Frequency, bool? Automated, string? OwnerEmail,
        bool? IsMandatory);

    record UpdateControlReq(
        string? Ref, string? Title, string? Description,
        string? TestingProcedure, string? EvidenceRequired,
        string? Frequency, string? OwnerEmail, bool? IsMandatory);

    record MandatoryReq(bool IsMandatory);
    record LinkDomainReq(string DomainId, bool? IsMandatory);
}
