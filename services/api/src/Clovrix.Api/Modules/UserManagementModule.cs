using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

public static class UserManagementModule
{
    public static WebApplication MapUserManagementModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/users").WithTags("User Management");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var users = (await db.QueryAsync($"SELECT * FROM {sc}.platform_users ORDER BY role, full_name")).ToList();
            int total=users.Count, active=users.Count(u=>(string)u.status=="active"),
                invited=users.Count(u=>(string)u.status=="invited"), mfaOn=users.Count(u=>(bool)u.mfa_enabled);
            return Results.Ok(new { users, stats=new { total, active, invited,
                mfa_pct=total>0?(int)Math.Round(mfaOn*100.0/total):0 }});
        });

        g.MapPost("/invite", async (InviteReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); var email = Helpers.UserEmail(ctx); db.Open();
            var exists = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.platform_users WHERE email=@Email", new { req.Email });
            if (exists>0) return Results.Conflict(new { error="User with this email already exists" });
            var id = Helpers.NewId();
            var token = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.platform_users(id,email,full_name,role,department,title,status,invited_by,invitation_token,invitation_sent_at)
                VALUES(@Id,@Email,@Name,@Role,@Dept,@Title,'invited',@InvitedBy,@Token,NOW())",
                new { Id=id, req.Email, Name=req.FullName, Role=req.Role??"viewer",
                      Dept=req.Department, req.Title, InvitedBy=email, Token=token });
            await Helpers.Log(db, sc, email, "user.invited", "platform_users", id, new { email=req.Email });
            return Results.Created($"/api/users/{id}", new { id, invitation_token=token, message=$"Invitation created for {req.Email}" });
        });

        g.MapPut("/{id}/role", async (string id, RoleReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); var email = Helpers.UserEmail(ctx); db.Open();
            await db.ExecuteAsync($"UPDATE {sc}.platform_users SET role=@Role,updated_at=NOW() WHERE id=@Id", new { Id=id, req.Role });
            await Helpers.Log(db, sc, email, "user.role.updated", "platform_users", id, new { new_role=req.Role });
            return Results.Ok(new { message="Role updated" });
        });

        g.MapPut("/{id}/status", async (string id, StatusReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); var email = Helpers.UserEmail(ctx); db.Open();
            await db.ExecuteAsync($"UPDATE {sc}.platform_users SET status=@Status,updated_at=NOW() WHERE id=@Id", new { Id=id, req.Status });
            await Helpers.Log(db, sc, email, $"user.{req.Status}", "platform_users", id);
            return Results.Ok(new { message=$"User {req.Status}" });
        });

        // Tenant config - tenant admin can update tenant name & logo (NOT product name/logo — those are hardcoded)
        g.MapGet("/tenant/config", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var slug = sc.Replace("tenant_","");
            var cfg = await db.QueryFirstOrDefaultAsync("SELECT tc.*,t.name as tenant_db_name,t.slug FROM public.tenant_config tc JOIN public.tenants t ON tc.tenant_id=t.id WHERE t.slug=@Slug", new { Slug=slug });
            return cfg==null ? Results.NotFound() : Results.Ok(cfg);
        });

        g.MapPut("/tenant/config", async (TenantConfigReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); var email = Helpers.UserEmail(ctx); db.Open();
            var slug = sc.Replace("tenant_","");
            // ONLY tenant_name and tenant_logo_url are editable — product name/logo are hardcoded in frontend
            await db.ExecuteAsync($@"
                UPDATE public.tenant_config SET
                    tenant_name=COALESCE(@Name,tenant_name),
                    tenant_logo_url=COALESCE(@Logo,tenant_logo_url),
                    primary_color=COALESCE(@Color,primary_color), updated_at=NOW()
                WHERE tenant_id=(SELECT id FROM public.tenants WHERE slug=@Slug)",
                new { Name=req.TenantName, Logo=req.TenantLogoUrl, Color=req.PrimaryColor, Slug=slug });
            await Helpers.Log(db, sc, email, "tenant.config.updated", "tenant_config", null);
            return Results.Ok(new { message="Tenant config updated" });
        });

        g.MapPost("/tenant/provision", async (ProvisionReq req, HttpContext ctx, IDbConnection db) =>
        {
            var email = Helpers.UserEmail(ctx); db.Open();
            var tenantId = Helpers.NewId();
            var slug = req.Slug.ToLower().Replace(" ","_").Replace("-","_");
            await db.ExecuteAsync("INSERT INTO public.tenants(id,name,slug,plan,region) VALUES(@Id,@Name,@Slug,@Plan,@Region)",
                new { Id=tenantId, req.Name, Slug=slug, Plan=req.Plan??"standard", Region=req.Region??"us-east-1" });
            await db.ExecuteAsync("INSERT INTO public.tenant_config(tenant_id,auth_method,tenant_name,primary_color) VALUES(@TId,@Auth,@Name,@Color)",
                new { TId=tenantId, Auth=req.AuthMethod??"password", req.Name, Color=req.PrimaryColor??"#7c6af7" });
            await Helpers.Log(db, "public", email, "tenant.provisioned", "tenants", tenantId, new { name=req.Name, slug });
            return Results.Created($"/api/tenants/{tenantId}", new { tenant_id=tenantId, slug, name=req.Name,
                message=$"Tenant '{req.Name}' provisioned. Apply schema migration for tenant_{slug} to complete." });
        });

        return app;
    }

    record InviteReq(string Email, string FullName, string? Role, string? Department, string? Title);
    record RoleReq(string Role);
    record StatusReq(string Status);
    record TenantConfigReq(string? TenantName, string? TenantLogoUrl, string? PrimaryColor);
    record ProvisionReq(string Name, string Slug, string? Plan, string? Region, string? AuthMethod, string? PrimaryColor);
}
