using System.Data;
using Dapper;
using MassTransit;

namespace Clovrix.Api.Modules;

// ── Shared Helpers used by all modules ───────────────────────────────────────
public static class Helpers
{
    // LEGACY resolver — trusts the X-Tenant-ID header and falls back to "demo".
    // Kept for existing (anonymous) endpoints only. New, authenticated endpoints
    // MUST use TenantSchema(), which derives the tenant from the validated JWT.
    public static string Schema(HttpContext ctx)
    {
        var tid = ctx.Request.Headers["X-Tenant-ID"].FirstOrDefault()
               ?? ctx.User?.FindFirst("tenant_id")?.Value
               ?? "demo";
        var clean = System.Text.RegularExpressions.Regex.Replace(tid, @"[^a-zA-Z0-9_]", "");
        return $"tenant_{(string.IsNullOrEmpty(clean) ? "demo" : clean)}";
    }

    // STRICT resolver — derives the tenant schema ONLY from the validated JWT
    // (the `tenant_id` claim). Never trusts a client header. Returns null when the
    // token has no usable tenant claim; authenticated endpoints should then return 401.
    public static string? TenantSchema(HttpContext ctx)
    {
        var tid = ctx.User?.FindFirst("tenant_id")?.Value;
        if (string.IsNullOrWhiteSpace(tid)) return null;
        var clean = System.Text.RegularExpressions.Regex.Replace(tid, @"[^a-zA-Z0-9_]", "");
        return string.IsNullOrEmpty(clean) ? null : $"tenant_{clean}";
    }

    // Roles carried on the validated principal (flattened from Keycloak realm_access).
    public static IEnumerable<string> Roles(HttpContext ctx) =>
        ctx.User?.FindAll(System.Security.Claims.ClaimTypes.Role).Select(c => c.Value)
        ?? Enumerable.Empty<string>();

    public static string UserId(HttpContext ctx) =>
        ctx.User?.FindFirst("preferred_username")?.Value
      ?? ctx.User?.FindFirst("sub")?.Value
      ?? "system";

    public static string UserEmail(HttpContext ctx) =>
        ctx.User?.FindFirst("email")?.Value ?? UserId(ctx);

    public static async Task Log(IDbConnection db, string schema, string userEmail,
        string action, string resource, string? resourceId, object? details = null)
    {
        await db.ExecuteAsync($@"
            INSERT INTO {schema}.audit_log(id,user_email,action,resource,resource_id,details,created_at)
            VALUES(gen_random_uuid()::VARCHAR,@Email,@Action,@Resource,@ResourceId,@Details::jsonb,NOW())",
            new
            {
                Email = userEmail, Action = action, Resource = resource, ResourceId = resourceId,
                Details = System.Text.Json.JsonSerializer.Serialize(details ?? new { })
            });
    }

    public static string NewId() => Guid.NewGuid().ToString();
}

// ── Pagination helper ─────────────────────────────────────────────────────────
public record PagedResult<T>(IEnumerable<T> Items, int Total, int Page, int Size, int Pages);

public static class Pagination
{
    public static (int offset, int size) Parse(int page, int size)
    {
        size = Math.Clamp(size, 1, 200);
        page = Math.Max(1, page);
        return ((page - 1) * size, size);
    }
    public static PagedResult<T> Of<T>(IEnumerable<T> items, int total, int page, int size)
        => new(items, total, page, size, (int)Math.Ceiling((double)total / size));
}
