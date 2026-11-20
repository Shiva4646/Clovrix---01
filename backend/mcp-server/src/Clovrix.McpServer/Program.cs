using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Serilog;
using Clovrix.McpServer.Tools;
using Clovrix.RbacApi;

// ══════════════════════════════════════════════════════════════════════════════
// Clovrix MCP Server — Standalone Model Context Protocol service
// Transport : SSE  (http://localhost:5100/sse)
// DB        : Direct Dapper + PostgreSQL (same DB as REST API)
// Auth      : JWT Bearer — same Keycloak realm as API
// Port      : 5100  (configurable via ASPNETCORE_URLS)
// ══════════════════════════════════════════════════════════════════════════════

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateBootstrapLogger();

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ──────────────────────────────────────────────────────────────────
builder.Host.UseSerilog((ctx, cfg) => cfg.WriteTo.Console());

// ── PostgreSQL (transient IDbConnection per request) ─────────────────────────
var dbUrl = builder.Configuration["DATABASE_URL"]
         ?? "Host=localhost;Port=5432;Database=clovrix;Username=clovrix;Password=clovrix;Pooling=true;Max Pool Size=20";

builder.Services.AddTransient<IDbConnection>(_ =>
{
    var conn = new NpgsqlConnection(dbUrl);
    return conn;
});

// ── JWT Auth (same Keycloak realm as the REST API) ───────────────────────────
var keycloakUrl   = builder.Configuration["KEYCLOAK_URL"]   ?? "http://localhost:8081";
var keycloakRealm = builder.Configuration["KEYCLOAK_REALM"] ?? "clovrix";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.Authority            = $"{keycloakUrl}/realms/{keycloakRealm}";
        opt.RequireHttpsMetadata = false;
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false,
            ValidateIssuer   = true,
        };
        // Allow token in query string for SSE connections
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["token"].FirstOrDefault()
                         ?? ctx.Request.Headers["Authorization"].FirstOrDefault()?.Replace("Bearer ", "");
                if (!string.IsNullOrEmpty(token)) ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// RBAC and Control Management APIs (adds DbContext, JWT helpers, controllers)
builder.Services.AddRbacServices(builder.Configuration);

// ── MCP Server (SSE transport) ────────────────────────────────────────────────
// Discovers all [McpServerTool] methods via assembly scanning
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly();

// ── CORS (allow Claude Desktop, Claude.ai, and local dev) ────────────────────
builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(p => p
        .SetIsOriginAllowed(_ => true)
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials()));

var app = builder.Build();

app.UseCors();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// ── Health endpoint ───────────────────────────────────────────────────────────
app.MapGet("/health", () => Results.Ok(new
{
    status  = "healthy",
    service = "Clovrix MCP Server",
    version = "1.0.0",
    time    = DateTime.UtcNow
}));

// ── MCP SSE endpoint ─────────────────────────────────────────────────────────
app.MapMcp("/");   // SSE at /sse, messages at /messages

Log.Information("Clovrix MCP Server starting on {Urls}", builder.Configuration["ASPNETCORE_URLS"] ?? "http://+:8080");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    DbSeeder.Seed(db);
}

app.Run();
