using System.Data;
using Dapper;
using StackExchange.Redis;
using System.Text.Json;

namespace Clovrix.Api.Modules;

public static class DashboardModule
{
    public static WebApplication MapDashboardModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/dashboard").WithTags("Dashboard");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db, IConnectionMultiplexer valkey) =>
        {
            var sc    = Helpers.Schema(ctx);
            var cache = valkey.GetDatabase();
            var key   = $"{sc}:dashboard:v5";
            var cached = await cache.StringGetAsync(key);
            if (cached.HasValue) return Results.Ok(JsonSerializer.Deserialize<object>(cached!));

            db.Open();

            // ── Core counts ──────────────────────────────────────────────────
            var pendingAudits  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflows WHERE status IN ('pending','running')");
            var activePolicies = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.policies WHERE status IN ('active','approved')");
            var openFindings   = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.findings WHERE status='open'");
            var completedWfs   = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.workflows WHERE status='completed'");

            // ── Framework coverage — derived from completed workflows ─────────
            var frameworks = (await db.QueryAsync($@"
                SELECT code, name, short_name, color
                FROM {sc}.frameworks WHERE is_active=true ORDER BY sort_order")).ToList();

            var domains = (await db.QueryAsync($@"
                SELECT standard, score, status FROM {sc}.control_domains")).ToList();

            var frameworkCoverage = frameworks.Select(fw =>
            {
                var fwCode = (string)fw.code;
                var fwDomains = domains.Where(d => (string)d.standard == fwCode).ToList();
                // Score = average domain score if domains exist, else 0 (no dummy fallback)
                var score = fwDomains.Any() ? (int)Math.Round(fwDomains.Average(d => (double)(int)d.score)) : 0;
                // Count completed workflows for this framework
                return new { code = fwCode, name = (string)(fw.short_name ?? fw.name), score, domains = fwDomains.Count, color = (string)(fw.color ?? "#6366f1") };
            }).ToList();

            // Overall score = average across frameworks that have domains with scores
            var scoredFrameworks = frameworkCoverage.Where(f => f.domains > 0).ToList();
            var overallScore     = scoredFrameworks.Any() ? (int)Math.Round(scoredFrameworks.Average(f => f.score)) : 0;

            // ── Workflow status breakdown (replaces risk heatmap) ─────────────
            var workflowStats = await db.QueryAsync($@"
                SELECT status, COUNT(*) as count
                FROM {sc}.workflows
                GROUP BY status ORDER BY status");

            // ── Findings by standard (replaces risk by category) ─────────────
            var findingsByStandard = await db.QueryAsync($@"
                SELECT COALESCE(standard,'unknown') as category,
                       COUNT(*) as count,
                       SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count
                FROM {sc}.findings
                GROUP BY standard ORDER BY open_count DESC LIMIT 8");

            // ── Open findings by severity ─────────────────────────────────────
            var findingsBySeverity = await db.QueryAsync($@"
                SELECT severity, COUNT(*) as count
                FROM {sc}.findings WHERE status='open'
                GROUP BY severity ORDER BY
                  CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END");

            // ── Live alerts — recent open critical/high findings ──────────────
            var liveAlerts = await db.QueryAsync($@"
                SELECT f.title as title, 'finding' as type, f.created_at as time,
                       f.standard as category, s.name as system_name, f.severity
                FROM {sc}.findings f
                LEFT JOIN {sc}.ai_systems s ON f.ai_system_id=s.id
                WHERE f.status='open' AND f.severity IN ('critical','high')
                ORDER BY CASE f.severity WHEN 'critical' THEN 1 ELSE 2 END, f.created_at DESC LIMIT 5");

            // ── AI Maturity Index — derived entirely from real data ───────────
            var policyCount  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.policies WHERE status='active'");
            var controlImpl  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.operational_controls WHERE status='implemented'");
            var controlTotal = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.operational_controls");

            var maturityCompliance = overallScore;
            var maturityControls   = controlTotal > 0 ? (int)Math.Round(controlImpl * 100.0 / controlTotal) : 0;
            var maturityAudit      = Math.Min(100, completedWfs * 15 + policyCount * 3);
            // Remediation rate as proxy for operations health
            var openRems     = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.remediations WHERE status NOT IN ('resolved','cancelled')");
            var totalRems    = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.remediations");
            var maturityOperations = totalRems > 0 ? (int)Math.Round((totalRems - openRems) * 100.0 / totalRems) : 0;
            var maturityIndex      = (maturityCompliance + maturityOperations + maturityControls + maturityAudit) / 4;

            // ── Recent activity ──────────────────────────────────────────────
            var recentActivity = await db.QueryAsync($"SELECT * FROM {sc}.audit_log ORDER BY created_at DESC LIMIT 10");

            // ── Recent workflows ─────────────────────────────────────────────
            var recentWorkflows = await db.QueryAsync($@"
                SELECT w.*, s.name as system_name
                FROM {sc}.workflows w
                LEFT JOIN {sc}.ai_systems s ON w.ai_system_id=s.id
                ORDER BY w.created_at DESC LIMIT 5");

            // ── Posture trend — compliance score per month from completed workflows ──
            var trendRows = await db.QueryAsync($@"
                SELECT DATE_TRUNC('month', w.completed_at) as month,
                       COALESCE(ROUND(AVG(cd.score)), 0) as score
                FROM {sc}.workflows w
                JOIN {sc}.control_domains cd ON cd.standard = w.standard
                WHERE w.status IN ('completed','archived')
                  AND w.completed_at >= NOW() - INTERVAL '9 months'
                GROUP BY DATE_TRUNC('month', w.completed_at)
                ORDER BY month");

            var trendMap = ((IEnumerable<dynamic>)trendRows)
                .ToDictionary(r => ((DateTime)r.month).ToString("MMM"), r => (int)(decimal.ToInt32((decimal)(r.score ?? 0m))));

            var trend = Enumerable.Range(0, 9).Select(i =>
            {
                var dt    = DateTime.UtcNow.AddMonths(i - 8);
                var label = dt.ToString("MMM");
                var score = trendMap.TryGetValue(label, out var v) ? v : 0;
                return new { month = label, score, target = Math.Min(99, score + 5) };
            }).ToList();

            var result = new
            {
                // ── KPI fields ───────────────────────────────────────────────
                score              = overallScore,
                open_findings      = openFindings,
                pending_audits     = pendingAudits,
                completed_audits   = completedWfs,
                active_policies    = activePolicies,

                // ── Rich data ────────────────────────────────────────────────
                framework_coverage   = frameworkCoverage,
                workflow_stats       = workflowStats,
                findings_by_standard = findingsByStandard,
                findings_by_severity = findingsBySeverity,
                live_alerts          = liveAlerts,
                recent_activity      = recentActivity,
                recent_workflows     = recentWorkflows,
                posture_trend        = trend,

                // ── AI Maturity Index ────────────────────────────────────────
                ai_maturity_index  = maturityIndex,
                maturity_breakdown = new
                {
                    compliance = maturityCompliance,
                    operations = maturityOperations,
                    controls   = maturityControls,
                    audit      = Math.Min(100, maturityAudit),
                },

                // ── Legacy compat ────────────────────────────────────────────
                overall_score    = overallScore,
                open_risks       = openFindings, // findings are the risk proxy now
                active_workflows = pendingAudits,
                domains          = domains,
                generated_at     = DateTime.UtcNow,
            };

            await cache.StringSetAsync(key, JsonSerializer.Serialize(result), TimeSpan.FromMinutes(3));
            return Results.Ok(result);
        });

        g.MapPost("/invalidate", async (HttpContext ctx, IConnectionMultiplexer valkey) =>
        {
            var sc = Helpers.Schema(ctx);
            await valkey.GetDatabase().KeyDeleteAsync($"{sc}:dashboard:v5");
            return Results.Ok(new { message = "Cache cleared" });
        });

        return app;
    }
}
