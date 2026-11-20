using System.Data;
using System.Text.Json;
using System.Text.Json.Serialization;
using Dapper;
using Hangfire;
using Hangfire.PostgreSql;
using MassTransit;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using Minio;
using Npgsql;
using QuestPDF.Infrastructure;
using Serilog;
using StackExchange.Redis;
using Clovrix.Api.Modules;
using Clovrix.Api.Messages;
using System.Threading.RateLimiting;

// ── Bootstrap Serilog ─────────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.File("logs/clovrix-.txt", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30)
    .Enrich.FromLogContext()
    .CreateLogger();

try
{
    QuestPDF.Settings.License = LicenseType.Community;

    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog();

    // ── Config ────────────────────────────────────────────────────────────────
    var dbUrl      = Env("DATABASE_URL",   "Host=pgbouncer;Port=5432;Database=clovrix;Username=clovrix;Password=clovrix;Pooling=false");
    // Hangfire needs a direct PostgreSQL connection (not PgBouncer) because it requires
    // session-mode persistent connections to manage job queues and schema creation.
    var hangfireUrl = Env("HANGFIRE_DB_URL", dbUrl.Replace("Host=pgbouncer", "Host=postgres", StringComparison.OrdinalIgnoreCase));
    var valkeyUrl  = Env("VALKEY_URL",     "localhost:6379");
    var rabbitUrl  = Env("RABBITMQ_URL",   "amqp://clovrix:clovrix@rabbitmq:5672");
    var keycloakUrl= Env("KEYCLOAK_URL",   "http://keycloak:8080");
    var realm      = Env("KEYCLOAK_REALM", "clovrix");
    var minioEp    = Env("MINIO_ENDPOINT", "minio:9000");
    var minioKey   = Env("MINIO_ACCESS_KEY","clovrix-admin");
    var minioSec   = Env("MINIO_SECRET_KEY","clovrix-minio-secret");
    var frontendUrl= Env("FRONTEND_URL",   "http://localhost:3000");
    var smtpHost   = Env("SMTP_HOST",      "mailhog");
    var smtpPort   = int.Parse(Env("SMTP_PORT","1025"));
    var smtpFrom   = Env("SMTP_FROM",      "noreply@clovrix.local");
    var ollamaUrl  = Env("OLLAMA_URL",     "http://ollama:11434");
    var ollamaModel= Env("OLLAMA_MODEL",   "llama3.2:1b");
    var meiliUrl   = Env("MEILI_URL",      "http://meilisearch:7700");
    var meiliKey   = Env("MEILI_MASTER_KEY","clovrix-meili");
    var qdrantUrl  = Env("QDRANT_URL",     "http://qdrant:6333");
    var isWorker   = Env("RUN_MODE","api") == "worker";

    // ── CORS ──────────────────────────────────────────────────────────────────
    builder.Services.AddCors(o => o.AddPolicy("Clovrix", p =>
        p.WithOrigins(frontendUrl, "http://localhost:3000", "http://frontend:3000")
         .AllowAnyMethod().AllowAnyHeader().AllowCredentials()));

    // ── Auth ──────────────────────────────────────────────────────────────────
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(o =>
        {
            o.Authority            = $"{keycloakUrl}/realms/{realm}";
            o.RequireHttpsMetadata = false;
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer   = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ClockSkew        = TimeSpan.FromSeconds(60)
            };
            // Keycloak carries roles nested under the `realm_access` claim as JSON
            // ({"roles":[...]}). Flatten them into standard Role claims so that
            // RequireRole / RequireAuthorization("<policy>") work.
            o.Events = new JwtBearerEvents
            {
                OnTokenValidated = ctx =>
                {
                    if (ctx.Principal?.Identity is System.Security.Claims.ClaimsIdentity identity)
                    {
                        var realmAccess = identity.FindFirst("realm_access")?.Value;
                        if (!string.IsNullOrEmpty(realmAccess))
                        {
                            try
                            {
                                using var doc = System.Text.Json.JsonDocument.Parse(realmAccess);
                                if (doc.RootElement.TryGetProperty("roles", out var roles)
                                    && roles.ValueKind == System.Text.Json.JsonValueKind.Array)
                                {
                                    foreach (var r in roles.EnumerateArray())
                                    {
                                        var role = r.GetString();
                                        if (!string.IsNullOrEmpty(role))
                                            identity.AddClaim(new System.Security.Claims.Claim(
                                                System.Security.Claims.ClaimTypes.Role, role));
                                    }
                                }
                            }
                            catch { /* ignore malformed realm_access */ }
                        }
                    }
                    return Task.CompletedTask;
                }
            };
        });
    // ── RBAC policies ──────────────────────────────────────────────────────────
    // Compliance Admin is granted every policy; other roles are scoped per the
    // role-page-feature matrix. RequireRole uses OR semantics across the listed roles.
    builder.Services.AddAuthorization(o =>
    {
        // `super_admin` is the realm's full-access role (Keycloak); `compliance_admin`
        // is kept for forward-compat. Both satisfy every policy.
        o.AddPolicy("admin",        p => p.RequireRole("super_admin", "compliance_admin"));
        o.AddPolicy("control_lead", p => p.RequireRole("control_lead", "super_admin", "compliance_admin"));
        o.AddPolicy("assessor",     p => p.RequireRole("assessor", "super_admin", "compliance_admin"));
        o.AddPolicy("reviewer",     p => p.RequireRole("reviewer", "super_admin", "compliance_admin"));
        o.AddPolicy("auditor",      p => p.RequireRole("lead_auditor", "super_admin", "compliance_admin"));
    });

    // ── Rate Limiting ─────────────────────────────────────────────────────────
    builder.Services.AddRateLimiter(o =>
    {
        o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
            RateLimitPartition.GetFixedWindowLimiter(
                ctx.Request.Headers["X-Tenant-ID"].FirstOrDefault() ?? "global",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1) }));
        o.OnRejected = async (ctx, _) =>
        {
            ctx.HttpContext.Response.StatusCode = 429;
            await ctx.HttpContext.Response.WriteAsync("Rate limit exceeded. Retry after 1 minute.");
        };
    });

    // ── Database (Dapper + PgBouncer) ─────────────────────────────────────────
    builder.Services.AddTransient<IDbConnection>(_ => new NpgsqlConnection(dbUrl));

    // ── Valkey (Redis-compatible) ──────────────────────────────────────────────
    var valkeyConfig = ConfigurationOptions.Parse(valkeyUrl, true);
    valkeyConfig.AbortOnConnectFail = false;
    var valkey = ConnectionMultiplexer.Connect(valkeyConfig);
    builder.Services.AddSingleton<IConnectionMultiplexer>(valkey);
    builder.Services.AddStackExchangeRedisCache(o => o.Configuration = valkeyUrl);

    // ── MinIO ─────────────────────────────────────────────────────────────────
    builder.Services.AddMinio(o => o
        .WithEndpoint(minioEp)
        .WithCredentials(minioKey, minioSec)
        .WithSSL(false));

    // ── MassTransit + RabbitMQ ────────────────────────────────────────────────
    builder.Services.AddMassTransit(x =>
    {
        x.AddConsumer<WorkflowConsumer>();
        x.AddConsumer<NotificationConsumer>();
        x.UsingRabbitMq((ctx, cfg) =>
        {
            cfg.Host(SafeAmqpUri(rabbitUrl));
            cfg.ReceiveEndpoint("clovrix-workflow", e =>
            {
                e.UseMessageRetry(r => r.Intervals(2000, 8000, 30000));
                e.ConfigureConsumer<WorkflowConsumer>(ctx);
            });
            cfg.ReceiveEndpoint("clovrix-notifications", e =>
            {
                e.ConfigureConsumer<NotificationConsumer>(ctx);
            });
        });
    });

    // ── Hangfire (Job Scheduling) ─────────────────────────────────────────────
    builder.Services.AddHangfire(cfg => cfg
        .UseSimpleAssemblyNameTypeSerializer()
        .UseRecommendedSerializerSettings()
        .UsePostgreSqlStorage(o => o.UseNpgsqlConnection(hangfireUrl)));
    builder.Services.AddHangfireServer(o => { o.WorkerCount = 4; o.Queues = new[] { "ccm", "evidence", "notifications", "default" }; });

    // ── HttpClient (for OAuth + Ollama + integrations) ────────────────────────
    // Ollama needs long timeouts — LLM inference can take 2-3 min on first load
    // Do NOT use AddStandardResilienceHandler here — its 30s default total-request timeout
    // kills LLM inference. Timeout is controlled per-call via CancellationTokenSource instead.
    builder.Services.AddHttpClient("ollama", c =>
    {
        c.BaseAddress = new Uri(ollamaUrl);
        c.Timeout     = Timeout.InfiniteTimeSpan;
    });
    builder.Services.AddHttpClient("integrations", c => c.Timeout = TimeSpan.FromSeconds(30))
        .AddStandardResilienceHandler();

    // ── Singletons for shared config ───────────────────────────────────────────
    builder.Services.AddSingleton(new AppConfig(smtpHost, smtpPort, smtpFrom, ollamaUrl, ollamaModel, meiliUrl, meiliKey, qdrantUrl));

    // ── Swagger ───────────────────────────────────────────────────────────────
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title = "Clovrix — Compliance Platform API",
        Version = "v1",
        Description = "ISO 42001 · SOC 2 Type II · GDPR | Multi-tenant Compliance Automation"
    });

    // JWT Bearer Authentication for Swagger
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Enter your JWT token. Example: Bearer {token}"
    });

    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    c.CustomSchemaIds(t => (t.FullName ?? t.Name).Replace("+", "."));
});

    // ── Health Checks ─────────────────────────────────────────────────────────
    builder.Services.AddHealthChecks()
        .AddNpgSql(dbUrl,         name: "postgresql", tags: ["db"])
        .AddRedis(valkeyUrl,      name: "valkey",     tags: ["cache"])
        .AddRabbitMQ(SafeAmqpUri(rabbitUrl), name: "rabbitmq", tags: ["queue"])
        .AddUrlGroup(new Uri($"http://{minioEp}/minio/health/live"), name: "minio", tags: ["storage"]);

    var app = builder.Build();

// Extended timeout for AI chat endpoints (Ollama inference can be slow)
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api/ai"))
    {
        var feature = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>();
        context.RequestAborted = CancellationToken.None; // don't abort on slow AI responses
    }
    await next(context);
});

    // ── Middleware ────────────────────────────────────────────────────────────
    // CORS must run FIRST so browser preflight (OPTIONS) requests — triggered by
    // the SPA's Authorization + X-Tenant-ID headers — are answered before the
    // rate limiter or auth can drop them. (Raw tab / curl never preflight, which
    // is why they worked while the SPA's fetch failed.)
    app.UseCors("Clovrix");
    app.UseSerilogRequestLogging();
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseSwagger();
    app.UseSwaggerUI(c => { c.SwaggerEndpoint("/swagger/v1/swagger.json", "Clovrix API v1"); c.RoutePrefix = "swagger"; });

    // ── Health ────────────────────────────────────────────────────────────────
    app.MapGet("/health", () => Results.Ok(new { status = "healthy", version = "1.0.0", timestamp = DateTime.UtcNow }));
    app.MapHealthChecks("/health/detailed", new HealthCheckOptions
    {
        ResponseWriter = async (ctx, report) =>
        {
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                status = report.Status.ToString(),
                checks = report.Entries.Select(e => new { name = e.Key, status = e.Value.Status.ToString(), duration_ms = e.Value.Duration.TotalMilliseconds })
            }));
        }
    });

    // ── Register all modules ──────────────────────────────────────────────────
    if (!isWorker)
    {
        app.MapUserManagementModule();
        app.MapFrameworksModule();
        app.MapDashboardModule();
        app.MapControlsModule();
        app.MapControlLibraryModule();
        app.MapEvidenceModule();
        app.MapWorkflowsModule();
        app.MapFindingsModule();
        app.MapPersonnelModule();
        app.MapVendorsModule();
        app.MapPoliciesModule();
        app.MapIntegrationsModule();
        app.MapSecurityModule();
        app.MapQuestionnairesModule();
        app.MapTrustCenterModule();
        app.MapReportsModule();
        app.MapTenantsModule();
        app.MapAuditsModule();
        app.MapControlLeadModule();
        app.MapAssessmentsModule();
        app.MapAuditorModule();
        app.MapAccessorsModule();
        app.MapControlMappingsModule();
        app.MapAISystemsModule();
        app.MapRisksModule();
        app.MapClovrixAIAssistant();
        app.MapSearchModule();
        app.UseHangfireDashboard("/hangfire");
        RecurringJob.AddOrUpdate<CcmService>("ccm-hourly",  s => s.RunHourlyChecks(),  Cron.Hourly);
        RecurringJob.AddOrUpdate<CcmService>("ccm-daily",   s => s.RunDailyChecks(),   Cron.Daily);
        RecurringJob.AddOrUpdate<CcmService>("ccm-weekly",  s => s.RunWeeklyChecks(),  Cron.Weekly);
    }

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "Clovrix failed to start"); throw; }
finally { Log.CloseAndFlush(); }

// ── Shared Helpers (accessible from all modules via static import) ─────────────
static string Env(string key, string fallback) => Environment.GetEnvironmentVariable(key) ?? fallback;

// Safely build an amqp:// URI even when the password contains @ characters.
// Uses greedy matching: everything between :// user : and the LAST @ is the password.
static Uri SafeAmqpUri(string raw)
{
    var m = System.Text.RegularExpressions.Regex.Match(
        raw, @"^(amqps?)://([^:]+):(.+)@([^@:]+):(\d+)(.*)$");
    if (m.Success)
    {
        var scheme = m.Groups[1].Value;
        var user   = Uri.EscapeDataString(m.Groups[2].Value);
        var pass   = Uri.EscapeDataString(m.Groups[3].Value);
        var host   = m.Groups[4].Value;
        var port   = m.Groups[5].Value;
        var path   = m.Groups[6].Value;
        return new Uri($"{scheme}://{user}:{pass}@{host}:{port}{path}");
    }
    return new Uri(raw);
}

// ── Shared record types ────────────────────────────────────────────────────────
public record AppConfig(string SmtpHost, int SmtpPort, string SmtpFrom,
    string OllamaUrl, string OllamaModel, string MeiliUrl, string MeiliKey, string QdrantUrl);

// ── Shared message types (MassTransit) ────────────────────────────────────────
// MassTransit requires message types to have a namespace — global namespace is rejected
namespace Clovrix.Api.Messages
{
    public record WorkflowStartedEvent(string WorkflowId, string TenantSchema, string Standard);
    public record WorkflowStepCompletedEvent(string WorkflowId, int StepOrder, string StepName, string Output);
    public record SendNotificationEvent(string Recipient, string Subject, string Body, string Type);
}

// ── MassTransit Consumers ─────────────────────────────────────────────────────
// WorkflowConsumer: receives WorkflowStartedEvent but intentionally does NOT
// auto-complete steps. Steps are completed manually by auditors via the UI.
// The consumer only logs the event for audit trail purposes.
public class WorkflowConsumer : IConsumer<WorkflowStartedEvent>
{
    private readonly ILogger<WorkflowConsumer> _log;

    public WorkflowConsumer(ILogger<WorkflowConsumer> log)
    { _log = log; }

    public Task Consume(ConsumeContext<WorkflowStartedEvent> ctx)
    {
        var msg = ctx.Message;
        _log.LogInformation("[WORKFLOW] Started: {Id} schema={Schema} standard={Std} — awaiting manual step completion",
            msg.WorkflowId, msg.TenantSchema, msg.Standard);
        return Task.CompletedTask;
    }
}

public class NotificationConsumer : IConsumer<SendNotificationEvent>
{
    private readonly ILogger<NotificationConsumer> _log;
    private readonly AppConfig _config;
    private readonly IServiceScopeFactory _scope;

    public NotificationConsumer(ILogger<NotificationConsumer> log, AppConfig config, IServiceScopeFactory scope)
    { _log = log; _config = config; _scope = scope; }

    public async Task Consume(ConsumeContext<SendNotificationEvent> ctx)
    {
        var msg = ctx.Message;
        try
        {
            var message = new MimeKit.MimeMessage();
            message.From.Add(MimeKit.InternetAddress.Parse(_config.SmtpFrom));
            message.To.Add(MimeKit.InternetAddress.Parse(msg.Recipient));
            message.Subject = msg.Subject;
            message.Body = new MimeKit.TextPart("html") { Text = msg.Body };

            using var client = new MailKit.Net.Smtp.SmtpClient();
            await client.ConnectAsync(_config.SmtpHost, _config.SmtpPort, MailKit.Security.SecureSocketOptions.None);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _log.LogInformation("[NOTIFY] Sent {Type} to {Recipient}", msg.Type, msg.Recipient);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "[NOTIFY] Failed to send {Type} to {Recipient}", msg.Type, msg.Recipient);
        }
    }
}

// ── CCM Service (Hangfire recurring jobs) ────────────────────────────────────
public class CcmService
{
    private readonly ILogger<CcmService> _log;
    private readonly IDbConnection _db;

    public CcmService(ILogger<CcmService> log, IDbConnection db) { _log = log; _db = db; }

    public async Task RunHourlyChecks()  { _log.LogInformation("[CCM] Running hourly checks"); await RunChecks("hourly"); }
    public async Task RunDailyChecks()   { _log.LogInformation("[CCM] Running daily checks");  await RunChecks("daily"); }
    public async Task RunWeeklyChecks()  { _log.LogInformation("[CCM] Running weekly checks"); await RunChecks("weekly"); }

    private async Task RunChecks(string frequency)
    {
        _db.Open();
        var rules = await _db.QueryAsync($@"
            SELECT r.*, i.status as integration_status
            FROM tenant_demo.ccm_rules r
            LEFT JOIN tenant_demo.integrations i ON r.integration_id=i.id
            WHERE r.frequency=@Freq AND r.is_active=true", new { Freq = frequency });

        foreach (var rule in rules)
        {
            var passed = (string)rule.integration_status == "connected";
            await _db.ExecuteAsync($@"
                UPDATE tenant_demo.ccm_rules
                SET last_run_at=NOW(), last_result=@Result,
                    failure_streak=CASE WHEN @Result='failing' THEN failure_streak+1 ELSE 0 END
                WHERE id=@Id",
                new { Id = rule.id, Result = passed ? "passing" : "failing" });
        }
    }
}
