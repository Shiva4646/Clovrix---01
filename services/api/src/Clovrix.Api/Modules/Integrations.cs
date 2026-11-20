using System.Data;
using System.Text;
using System.Text.Json;
using Dapper;
using StackExchange.Redis;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS — OAuth 2.0 flow engine (any provider)
// ══════════════════════════════════════════════════════════════════════════════
public static class IntegrationsModule
{
    // Built-in provider definitions — add more here, zero code changes needed
    private static readonly Dictionary<string, OAuthProvider> Providers = new()
    {
        ["github"] = new("GitHub", "https://github.com/login/oauth/authorize",
            "https://github.com/login/oauth/access_token",
            "https://api.github.com/user", "repo,read:org,admin:org"),
        ["google_workspace"] = new("Google Workspace", "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "https://www.googleapis.com/oauth2/v3/userinfo",
            "https://www.googleapis.com/auth/admin.directory.user.readonly openid email"),
        ["azure"] = new("Microsoft Azure", "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize",
            "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            "https://graph.microsoft.com/v1.0/me",
            "https://graph.microsoft.com/User.Read.All openid offline_access"),
        ["okta"] = new("Okta", "https://{domain}/oauth2/v1/authorize",
            "https://{domain}/oauth2/v1/token",
            "https://{domain}/oauth2/v1/userinfo", "openid profile groups"),
        ["slack"] = new("Slack", "https://slack.com/oauth/v2/authorize",
            "https://slack.com/api/oauth.v2.access",
            "https://slack.com/api/auth.test", "channels:read,users:read"),
        ["jira"] = new("Jira", "https://auth.atlassian.com/authorize",
            "https://auth.atlassian.com/oauth/token",
            "https://api.atlassian.com/me", "read:jira-work read:jira-user"),
        ["gcp"] = new("Google Cloud", "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v3/userinfo",
            "https://www.googleapis.com/auth/cloud-platform.read-only openid"),
        ["aws"] = new("AWS", "", "", "", ""),  // Uses access key / secret, not OAuth
        ["snyk"] = new("Snyk", "", "", "", ""), // Uses API token
        ["crowdstrike"] = new("CrowdStrike", "https://falcon.crowdstrike.com/oauth2/authorize",
            "https://api.crowdstrike.com/oauth2/token", "https://api.crowdstrike.com/user-management/entities/users/v1",
            "prevention:read"),
    };

    public static WebApplication MapIntegrationsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/integrations").WithTags("Integrations");

        // List all integrations
        g.MapGet("/", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var rows = await db.QueryAsync($"SELECT * FROM {sc}.integrations ORDER BY display_name");
            return Results.Ok(rows);
        });

        g.MapGet("/{id}/checks", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var rows = await db.QueryAsync($"SELECT * FROM {sc}.integration_checks WHERE integration_id=@Id ORDER BY name", new { Id = id });
            return Results.Ok(rows);
        });

        g.MapGet("/ccm/rules", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var rows = await db.QueryAsync($@"
                SELECT r.*, i.display_name as integration_name
                FROM {sc}.ccm_rules r
                LEFT JOIN {sc}.integrations i ON r.integration_id=i.id
                ORDER BY r.name");
            return Results.Ok(rows);
        });

        // ── OAuth 2.0 flow: Step 1 — Build authorization URL ─────────────────
        g.MapGet("/{provider}/oauth/authorize", (string provider, HttpContext ctx, IConnectionMultiplexer valkey,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? redirectUri = null,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? tenantId = null,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? clientId = null,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? customAuthUrl = null,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? customScopes = null) =>
        {
            var sc = Helpers.Schema(ctx);
            if (!Providers.TryGetValue(provider.ToLower(), out var p))
            {
                // Custom/generic OAuth provider support
                if (customAuthUrl == null) return Results.BadRequest(new { error = "Unknown provider. Provide customAuthUrl for a custom OAuth 2.0 provider." });
                p = new OAuthProvider(provider, customAuthUrl, "", "", customScopes ?? "openid profile email");
            }

            var state = Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            { provider, schema = sc, ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds(), redirectUri })));

            // Cache state for CSRF validation (15 min TTL)
            valkey.GetDatabase().StringSet($"{sc}:oauth:state:{state}", "1", TimeSpan.FromMinutes(15));

            var authUrl = p.AuthorizationUrl
                .Replace("{domain}", tenantId ?? "your-domain.okta.com")
                .Replace("{tenant_id}", tenantId ?? "common");

            var scopes = customScopes ?? p.DefaultScopes;
            var final = clientId != null
                ? $"{authUrl}?client_id={Uri.EscapeDataString(clientId)}&response_type=code&scope={Uri.EscapeDataString(scopes)}&state={Uri.EscapeDataString(state)}&redirect_uri={Uri.EscapeDataString(redirectUri ?? "")}"
                : $"{authUrl}?response_type=code&scope={Uri.EscapeDataString(scopes)}&state={Uri.EscapeDataString(state)}&redirect_uri={Uri.EscapeDataString(redirectUri ?? "")}";

            return Results.Ok(new { authorize_url = final, state, provider, scopes });
        });

        // ── OAuth 2.0 flow: Step 2 — Exchange code for tokens ────────────────
        g.MapPost("/{provider}/oauth/callback", async (string provider, OAuthCallbackReq req, HttpContext ctx,
            IDbConnection db, IConnectionMultiplexer valkey, IHttpClientFactory httpFactory) =>
        {
            var sc = Helpers.Schema(ctx);

            // Validate state (CSRF protection)
            var stateKey = $"{sc}:oauth:state:{req.State}";
            var stateValid = await valkey.GetDatabase().StringGetDeleteAsync(stateKey);
            if (!stateValid.HasValue) return Results.BadRequest(new { error = "Invalid or expired state. Restart OAuth flow." });

            if (!Providers.TryGetValue(provider.ToLower(), out var p))
                p = new OAuthProvider(provider, "", req.CustomTokenUrl ?? "", "", "");

            // Exchange code for token
            var http = httpFactory.CreateClient("integrations");
            var form = new Dictionary<string, string>
            {
                ["grant_type"]    = "authorization_code",
                ["code"]          = req.Code,
                ["redirect_uri"]  = req.RedirectUri ?? "",
                ["client_id"]     = req.ClientId ?? "",
                ["client_secret"] = req.ClientSecret ?? ""
            };

            var tokenUrl = (req.CustomTokenUrl ?? p.TokenUrl)
                .Replace("{domain}", req.TenantId ?? "")
                .Replace("{tenant_id}", req.TenantId ?? "common");

            using var tokenResp = await http.PostAsync(tokenUrl, new FormUrlEncodedContent(form));
            if (!tokenResp.IsSuccessStatusCode)
            {
                var err = await tokenResp.Content.ReadAsStringAsync();
                return Results.BadRequest(new { error = "Token exchange failed", details = err });
            }

            var tokenJson = await tokenResp.Content.ReadAsStringAsync();
            var tokens    = JsonDocument.Parse(tokenJson).RootElement;
            var accessToken  = tokens.TryGetProperty("access_token",  out var at) ? at.GetString() : null;
            var refreshToken = tokens.TryGetProperty("refresh_token",  out var rt) ? rt.GetString() : null;
            var expiresIn    = tokens.TryGetProperty("expires_in",     out var ei) ? ei.GetInt32() : 3600;

            // Persist credentials
            db.Open();
            var integ = await db.QueryFirstOrDefaultAsync($"SELECT id FROM {sc}.integrations WHERE provider=@Provider", new { Provider = provider });
            if (integ == null) return Results.NotFound(new { error = "Integration not found. Add the provider first." });

            await db.ExecuteAsync($@"
                INSERT INTO {sc}.integration_credentials(id,integration_id,access_token,refresh_token,token_type,expires_at,raw_config)
                VALUES(gen_random_uuid()::VARCHAR,@IntId,@At,@Rt,'Bearer',@Exp,@Raw::jsonb)
                ON CONFLICT(integration_id) DO UPDATE SET
                    access_token=@At, refresh_token=@Rt, expires_at=@Exp, raw_config=@Raw::jsonb, updated_at=NOW()",
                new { IntId = (string)integ.id, At = accessToken, Rt = refreshToken,
                      Exp = DateTime.UtcNow.AddSeconds(expiresIn),
                      Raw = JsonSerializer.Serialize(new { client_id = req.ClientId, tenant_id = req.TenantId }) });

            await db.ExecuteAsync($@"
                UPDATE {sc}.integrations SET status='connected',last_sync_at=NOW(),error_msg=NULL,updated_at=NOW() WHERE id=@Id",
                new { Id = (string)integ.id });

            return Results.Ok(new { message = "OAuth connected successfully", provider, expires_in = expiresIn });
        });

        // ── Token auth (API keys, access key/secret) ─────────────────────────
        g.MapPost("/{provider}/connect/token", async (string provider, TokenConnectReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var integ = await db.QueryFirstOrDefaultAsync($"SELECT id FROM {sc}.integrations WHERE provider=@Provider", new { Provider = provider });
            if (integ == null) return Results.NotFound();

            await db.ExecuteAsync($@"
                INSERT INTO {sc}.integration_credentials(id,integration_id,access_token,raw_config)
                VALUES(gen_random_uuid()::VARCHAR,@IntId,@Token,@Config::jsonb)
                ON CONFLICT(integration_id) DO UPDATE SET access_token=@Token,raw_config=@Config::jsonb,updated_at=NOW()",
                new { IntId = (string)integ.id, Token = req.Token, Config = JsonSerializer.Serialize(req.Config ?? new { }) });

            await db.ExecuteAsync($"UPDATE {sc}.integrations SET status='connected',last_sync_at=NOW(),updated_at=NOW() WHERE id=@Id", new { Id = (string)integ.id });
            return Results.Ok(new { message = "Integration connected", provider });
        });

        g.MapDelete("/{provider}/disconnect", async (string provider, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.integrations SET status='not_connected',error_msg=NULL,updated_at=NOW() WHERE provider=@Provider;
                DELETE FROM {sc}.integration_credentials WHERE integration_id=(SELECT id FROM {sc}.integrations WHERE provider=@Provider)",
                new { Provider = provider });
            return Results.Ok(new { message = "Disconnected" });
        });

        g.MapPost("/{id}/sync", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($"UPDATE {sc}.integrations SET last_sync_at=NOW(),updated_at=NOW() WHERE id=@Id", new { Id = id });
            Hangfire.BackgroundJob.Enqueue<CcmSyncJob>(j => j.SyncIntegration(id, sc));
            return Results.Ok(new { message = "Sync queued" });
        });

        // ── Custom OAuth provider registration ────────────────────────────────
        g.MapPost("/custom", async (CustomProviderReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var id = Helpers.NewId();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.integrations(id,provider,display_name,category,status,auth_type,config,scopes)
                VALUES(@Id,@Provider,@Name,@Category,'not_connected','oauth2',@Config::jsonb,@Scopes::jsonb)",
                new { Id = id, Provider = req.Provider, Name = req.DisplayName, req.Category,
                      Config = JsonSerializer.Serialize(new { auth_url = req.AuthUrl, token_url = req.TokenUrl }),
                      Scopes = JsonSerializer.Serialize(req.Scopes?.Split(' ') ?? Array.Empty<string>()) });
            return Results.Created($"/api/integrations/{id}", new { id, provider = req.Provider });
        });

        return app;
    }

    record OAuthProvider(string Name, string AuthorizationUrl, string TokenUrl, string UserInfoUrl, string DefaultScopes);
    record OAuthCallbackReq(string Code, string State, string? RedirectUri, string? ClientId,
        string? ClientSecret, string? TenantId, string? CustomTokenUrl);
    record TokenConnectReq(string Token, object? Config);
    record CustomProviderReq(string Provider, string DisplayName, string Category,
        string AuthUrl, string TokenUrl, string? Scopes);
}

// Hangfire job for integration sync
public class CcmSyncJob
{
    private readonly IDbConnection _db;
    private readonly ILogger<CcmSyncJob> _log;
    public CcmSyncJob(IDbConnection db, ILogger<CcmSyncJob> log) { _db = db; _log = log; }

    public async Task SyncIntegration(string integrationId, string schema)
    {
        _log.LogInformation("[CCM] Syncing integration {Id}", integrationId);
        _db.Open();
        var rules = await _db.QueryAsync($"SELECT * FROM {schema}.ccm_rules WHERE integration_id=@Id AND is_active=true", new { Id = integrationId });
        foreach (var rule in rules)
        {
            // In production: call integration API and evaluate check result
            var result = "passing"; // Placeholder — real check logic per provider
            await _db.ExecuteAsync($"UPDATE {schema}.ccm_rules SET last_run_at=NOW(),last_result=@Result WHERE id=@Id",
                new { Result = result, Id = rule.id });
        }
        await _db.ExecuteAsync($"UPDATE {schema}.integrations SET evidence_count=evidence_count+1,updated_at=NOW() WHERE id=@Id", new { Id = integrationId });
    }
}
