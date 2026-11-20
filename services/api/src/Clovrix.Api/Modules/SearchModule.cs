using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════════════════════════════════════════
public static class SearchModule
{
    public static WebApplication MapSearchModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/search").WithTags("Search");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db, string? q = null) =>
        {
            var sc = Helpers.Schema(ctx);
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return Results.Ok(new { results = Array.Empty<object>(), total = 0 });

            db.Open();
            var term = $"%{q.ToLower()}%";
            var results = new List<object>();

            // ── AI Systems ───────────────────────────────────────────────────
            var systems = await db.QueryAsync($@"
                SELECT id, system_id as sys_ref, name, risk_class as badge, lifecycle_stage as sub,
                       'inventory' as page, 'AI System' as type
                FROM {sc}.ai_systems
                WHERE LOWER(name) LIKE @T OR LOWER(system_id) LIKE @T OR LOWER(description) LIKE @T
                LIMIT 5", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)systems).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.name,
                sub   = $"{r.sys_ref} · {r.sub}",
                badge = (string?)r.badge,
            }));

            // ── Controls ─────────────────────────────────────────────────────
            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref as ctrl_ref, c.title, c.status as badge, d.standard as sub,
                       'operations' as page, 'Control' as type
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON c.domain_id = d.id
                WHERE LOWER(c.title) LIKE @T OR LOWER(c.ref) LIKE @T OR LOWER(c.description) LIKE @T
                LIMIT 5", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)controls).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.title,
                sub   = $"{r.ctrl_ref} · {r.sub}",
                badge = (string?)r.badge,
            }));

            // ── Findings ─────────────────────────────────────────────────────
            var findings = await db.QueryAsync($@"
                SELECT id, title, severity as badge, standard as sub,
                       'findings' as page, 'Finding' as type
                FROM {sc}.findings
                WHERE LOWER(title) LIKE @T OR LOWER(description) LIKE @T
                LIMIT 4", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)findings).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.title,
                sub   = (string?)r.sub,
                badge = (string?)r.badge,
            }));

            // ── Policies ─────────────────────────────────────────────────────
            var policies = await db.QueryAsync($@"
                SELECT id, title, status as badge, category as sub,
                       'policies' as page, 'Policy' as type
                FROM {sc}.policies
                WHERE LOWER(title) LIKE @T OR LOWER(content) LIKE @T
                LIMIT 4", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)policies).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.title,
                sub   = (string?)r.sub,
                badge = (string?)r.badge,
            }));

            // ── Risks ────────────────────────────────────────────────────────
            var risks = await db.QueryAsync($@"
                SELECT id, title, category as sub, status as badge,
                       'risk' as page, 'Risk' as type
                FROM {sc}.risks
                WHERE LOWER(title) LIKE @T OR LOWER(description) LIKE @T
                LIMIT 4", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)risks).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.title,
                sub   = (string?)r.sub,
                badge = (string?)r.badge,
            }));

            // ── Workflows ────────────────────────────────────────────────────
            var workflows = await db.QueryAsync($@"
                SELECT id, name as title, standard as sub, status as badge,
                       'workflows' as page, 'Workflow' as type
                FROM {sc}.workflows
                WHERE LOWER(name) LIKE @T OR LOWER(standard) LIKE @T
                LIMIT 3", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)workflows).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.title,
                sub   = (string?)r.sub,
                badge = (string?)r.badge,
            }));

            // ── Vendors ──────────────────────────────────────────────────────
            var vendors = await db.QueryAsync($@"
                SELECT id, name as title, category as sub, status as badge,
                       'vendors' as page, 'Vendor' as type
                FROM {sc}.vendors
                WHERE LOWER(name) LIKE @T OR LOWER(category) LIKE @T
                LIMIT 3", new { T = term });
            results.AddRange(((IEnumerable<dynamic>)vendors).Select(r => new
            {
                id = (string)r.id, type = (string)r.type, page = (string)r.page,
                title = (string)r.title,
                sub   = (string?)r.sub,
                badge = (string?)r.badge,
            }));

            return Results.Ok(new { results, total = results.Count, query = q });
        });

        return app;
    }
}
