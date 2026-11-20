using System.Data;
using Dapper;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Clovrix.Api.Modules;

public static class ClovrixAIAssistant
{
    // ── Action labels shown in the confirmation card ─────────────────────────
    private static readonly Dictionary<string, string> ActionLabels = new()
    {
        ["create_finding"]          = "Create Audit Finding",
        ["log_finding"]             = "Create Audit Finding",
        ["add_finding"]             = "Create Audit Finding",
        ["create_risk"]             = "Add to Risk Register",
        ["add_risk"]                = "Add to Risk Register",
        ["log_risk"]                = "Add to Risk Register",
        ["update_finding_status"]   = "Update Finding Status",
        ["update_risk_status"]      = "Update Risk Status",
        ["create_workflow"]         = "Start Audit Workflow",
        ["create_audit_workflow"]   = "Start Audit Workflow",
        ["start_audit_workflow"]    = "Start Audit Workflow",
        ["initiate_workflow"]       = "Start Audit Workflow",
        ["run_gap_analysis"]        = "Run Gap Analysis",
        ["create_framework"]        = "Register Compliance Framework",
        ["register_framework"]      = "Register Compliance Framework",
        ["add_framework"]           = "Register Compliance Framework",
        ["create_incident"]         = "Create ITSM Incident",
        ["raise_incident"]          = "Create ITSM Incident",
        ["log_incident"]            = "Create ITSM Incident",
    };

    public static WebApplication MapClovrixAIAssistant(this WebApplication app)
    {
        var g = app.MapGroup("/api/ai").WithTags("AI Assistant");

        // ── Status ────────────────────────────────────────────────────────────
        g.MapGet("/status", async (AppConfig cfg, IHttpClientFactory http) =>
        {
            try
            {
                var client = http.CreateClient("ollama");
                var res    = await client.GetAsync("/api/tags");
                if (!res.IsSuccessStatusCode)
                    return Results.Ok(new { online = false, model = cfg.OllamaModel, reason = "Ollama not reachable" });
                var body   = await res.Content.ReadAsStringAsync();
                var doc    = JsonDocument.Parse(body);
                var models = doc.RootElement.GetProperty("models");
                bool modelReady = false;
                foreach (var m in models.EnumerateArray())
                {
                    var name = m.GetProperty("name").GetString() ?? "";
                    if (name.StartsWith(cfg.OllamaModel.Split(':')[0])) { modelReady = true; break; }
                }
                return Results.Ok(new { online = modelReady, model = cfg.OllamaModel,
                    reason = modelReady ? "ready" : "model not yet pulled — ollama-init is downloading it" });
            }
            catch
            {
                return Results.Ok(new { online = false, model = cfg.OllamaModel, reason = "Ollama service offline" });
            }
        });

        // ── User AI Preferences GET ───────────────────────────────────────────
        g.MapGet("/settings", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            try
            {
                var prefs = await db.QueryFirstOrDefaultAsync(
                    $"SELECT ai_auto_execute FROM {sc}.user_ai_prefs WHERE user_email=@Email",
                    new { Email = email });
                return Results.Ok(new
                {
                    ai_auto_execute = (bool)(prefs?.ai_auto_execute ?? false)
                });
            }
            catch { return Results.Ok(new { ai_auto_execute = false }); }
        });

        // ── User AI Preferences PUT ───────────────────────────────────────────
        g.MapPut("/settings", async (AiSettingsReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            try
            {
                await db.ExecuteAsync(
                    $@"INSERT INTO {sc}.user_ai_prefs(user_email, ai_auto_execute, updated_at)
                       VALUES(@Email, @Auto, NOW())
                       ON CONFLICT(user_email) DO UPDATE
                       SET ai_auto_execute=EXCLUDED.ai_auto_execute, updated_at=NOW()",
                    new { Email = email, Auto = req.AiAutoExecute });
                return Results.Ok(new { updated = true, ai_auto_execute = req.AiAutoExecute });
            }
            catch (Exception ex) { return Results.BadRequest(ex.Message); }
        });

        // ── Execute a confirmed pending action ────────────────────────────────
        g.MapPost("/execute", async (ExecuteReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var (result, error) = await ExecuteAction(req.Action, req.Params, sc, email, db);
            var logId = await WriteLog(db, sc, req.SessionId, email, req.Action, req.Params, result, error, "confirmed");
            if (error != null)
                return Results.BadRequest(new { error, log_id = logId });
            return Results.Ok(new { success = true, action = req.Action, result, log_id = logId });
        });

        // ── Action logs ───────────────────────────────────────────────────────
        g.MapGet("/action-logs", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            try
            {
                var logs = await db.QueryAsync(
                    $@"SELECT id, user_email, action_type, parameters, result,
                              exec_mode, status, error_msg, created_at
                       FROM {sc}.ai_action_logs
                       ORDER BY created_at DESC
                       LIMIT 100");
                return Results.Ok(logs);
            }
            catch { return Results.Ok(Array.Empty<object>()); }
        });

        // ── Chat ──────────────────────────────────────────────────────────────
        g.MapPost("/chat", async (ChatReq req, HttpContext ctx, IDbConnection db,
            AppConfig cfg, IHttpClientFactory http) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            // Load user auto-execute preference
            bool autoExec = false;
            try
            {
                var prefs = await db.QueryFirstOrDefaultAsync(
                    $"SELECT ai_auto_execute FROM {sc}.user_ai_prefs WHERE user_email=@Email",
                    new { Email = email });
                autoExec = (bool)(prefs?.ai_auto_execute ?? false);
            }
            catch { /* prefs table may not exist yet */ }

            // Build context string
            var contextText = "";
            if (!string.IsNullOrEmpty(req.ContextModule) && !string.IsNullOrEmpty(req.ContextId))
            {
                if (req.ContextModule == "inventory")
                    contextText = await GetCtx(db,
                        $"SELECT name,system_id,risk_class,lifecycle_stage,compliance_score FROM {sc}.ai_systems WHERE id=@Id OR system_id=@Id",
                        req.ContextId);
                else if (req.ContextModule == "risk")
                    contextText = await GetCtx(db,
                        $"SELECT title,category,inherent_score,treatment,status FROM {sc}.risks WHERE id=@Id",
                        req.ContextId);
                else if (req.ContextModule == "workflow")
                    contextText = await GetCtx(db,
                        $"SELECT name,standard,status,progress FROM {sc}.workflows WHERE id=@Id",
                        req.ContextId);
                else if (req.ContextModule == "itsm")
                    contextText = await GetCtx(db,
                        $"SELECT incident_id,title,priority,status FROM {sc}.itsm_incidents WHERE id=@Id OR incident_id=@Id",
                        req.ContextId);
            }

            var ctxSection = contextText.Length > 0 ? $"\nContext:\n{contextText}" : "";

            var systemPrompt =
                $"You are Clovrix AI Assistant — an expert in AI governance, risk management, and compliance (ISO 42001, SOC 2, GDPR, NIST AI RMF, EU AI Act).\n" +
                $"Platform: Clovrix | Tenant: {sc} | User: {email} | Module: {req.ContextModule ?? "dashboard"}{ctxSection}\n\n" +
                "When asked to perform a platform action, respond with a brief explanation, then output EXACTLY one line:\n" +
                "ACTION_JSON: {\"action\":\"<action_name>\",\"params\":{\"key\":\"value\"}}\n\n" +
                "IMPORTANT: Use ONLY these exact action names — do not invent variations:\n" +
                "  create_finding        — params: title(req), standard(req: ISO_42001/SOC2/GDPR/NIST_AI_RMF/ISO_27001), severity(req: critical/high/medium/low), description, controlRef, aiSystemId\n" +
                "  create_risk           — params: title(req), category(req: operational/compliance/security/strategic/data_privacy/model_bias), likelihood(1-5,req), impact(1-5,req), treatment(mitigate/accept/transfer/avoid), description\n" +
                "  update_finding_status — params: findingId(req), status(req: in_progress/resolved/closed/risk_accepted)\n" +
                "  update_risk_status    — params: riskId(req), status(req: mitigated/closed/accepted)\n" +
                "  create_workflow       — params: name(req), standard(req: ISO_42001/SOC2/GDPR/EU_AI_ACT/NIST_AI_RMF/ISO_27001), description, type(full-audit/gap-analysis/control-testing)\n" +
                "  create_framework      — params: code(req), name(req), shortName(req), version, category(security/ai_governance/privacy/regulatory), color(hex)\n" +
                "  create_incident       — params: title(req), priority(req: p1/p2/p3/p4), description, aiSystemId\n" +
                "  run_gap_analysis      — params: standard(req: ISO_42001/SOC2/GDPR/NIST_AI_RMF/ISO_27001), aiSystemId\n\n" +
                "Rules: Only emit ACTION_JSON for explicit instructions (create, add, log, register, start, run). " +
                "Never emit it for questions or analysis requests. " +
                "The action value must be one of the 8 names above — never use create_audit_workflow, register_framework, or any other variant.\n" +
                "Be concise and reference specific control clauses.";

            var messages = new List<object> { new { role = "system", content = systemPrompt } };
            if (req.History != null)
            {
                foreach (var h in req.History.TakeLast(8))
                    messages.Add(new { role = h.Role, content = h.Content });
            }
            messages.Add(new { role = "user", content = req.Message });

            string reply;
            try
            {
                var payload = JsonSerializer.Serialize(new
                {
                    model    = cfg.OllamaModel,
                    messages = messages,
                    stream   = false,
                    options  = new { temperature = 0.4, num_predict = 500 }
                });
                using var cts    = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                var ollamaClient = http.CreateClient("ollama");
                var res  = await ollamaClient.PostAsync("/api/chat",
                    new StringContent(payload, Encoding.UTF8, "application/json"), cts.Token);
                var body = await res.Content.ReadAsStringAsync();
                var doc  = JsonDocument.Parse(body);
                reply    = doc.RootElement.GetProperty("message").GetProperty("content").GetString() ?? "No response";
            }
            catch (Exception ex)
            {
                reply = $"AI service unavailable: {ex.Message.Split('.')[0]}";
            }

            // Parse ACTION_JSON from reply
            var parsedAction = ParseActionJson(reply);
            // Strip ACTION_JSON line from the displayed reply
            var cleanReply = string.Join('\n',
                reply.Split('\n').Where(l => !l.TrimStart().StartsWith("ACTION_JSON:"))).Trim();

            var sessionId = req.SessionId ?? Helpers.NewId();
            try
            {
                await db.ExecuteAsync(
                    $"INSERT INTO {sc}.ai_chat_sessions(id,user_email,context_module,context_id,messages,actions_taken) " +
                    $"VALUES(@Id,@Email,@Module,@CtxId,'[]'::jsonb,'[]'::jsonb) ON CONFLICT(id) DO NOTHING",
                    new { Id = sessionId, Email = email, Module = req.ContextModule, CtxId = req.ContextId });
            }
            catch { /* table may not exist */ }

            // If no action found — plain reply
            if (parsedAction == null)
                return Results.Ok(new { session_id = sessionId, reply = cleanReply, model = cfg.OllamaModel });

            // Auto-execute mode: run immediately and log
            if (autoExec)
            {
                var (result, error) = await ExecuteAction(
                    parsedAction.Action, parsedAction.Params, sc, email, db);
                var logId = await WriteLog(db, sc, sessionId, email,
                    parsedAction.Action, parsedAction.Params, result, error, "auto");
                return Results.Ok(new
                {
                    session_id    = sessionId,
                    reply         = cleanReply,
                    auto_executed = new
                    {
                        action  = parsedAction.Action,
                        label   = ActionLabels.GetValueOrDefault(parsedAction.Action, parsedAction.Action),
                        @params = parsedAction.Params,
                        result,
                        error,
                        log_id  = logId,
                        success = error == null,
                    },
                    model = cfg.OllamaModel
                });
            }

            // Manual confirm mode: return pending action card
            return Results.Ok(new
            {
                session_id     = sessionId,
                reply          = cleanReply,
                pending_action = new
                {
                    action  = parsedAction.Action,
                    label   = ActionLabels.GetValueOrDefault(parsedAction.Action, parsedAction.Action),
                    @params = parsedAction.Params,
                    preview = BuildPreview(parsedAction.Action, parsedAction.Params),
                },
                model = cfg.OllamaModel
            });
        });

        // ── Gap Analysis (unchanged) ──────────────────────────────────────────
        g.MapPost("/gap-analysis", async (GapReq req, HttpContext ctx, IDbConnection db,
            AppConfig cfg, IHttpClientFactory http) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var domain = await db.QueryFirstOrDefaultAsync(
                $"SELECT * FROM {sc}.control_domains WHERE id=@Id", new { Id = req.DomainId });
            if (domain == null) return Results.NotFound();
            var controls = await db.QueryAsync(
                $"SELECT id,title,status,description,ref as ctrl_ref FROM {sc}.controls WHERE domain_id=@Id",
                new { Id = req.DomainId });
            var sysCtx = "";
            if (!string.IsNullOrEmpty(req.AiSystemId))
            {
                var sys = await db.QueryFirstOrDefaultAsync(
                    $"SELECT name,risk_class FROM {sc}.ai_systems WHERE id=@Id", new { Id = req.AiSystemId });
                if (sys != null) sysCtx = $"\nAI System: {(string)sys.name} (risk: {(string)sys.risk_class})";
            }
            var ctrlList = string.Join(", ", controls.Select(c =>
                $"[{(string)c.status}] {(string)c.ctrl_ref}: {(string)c.title}"));
            var prompt =
                $"You are an expert AI governance auditor. Identify gaps in this compliance domain.\n" +
                $"Domain: {(string)domain.area} ({(string)domain.standard}) - Score: {(int)domain.score}%{sysCtx}\n" +
                $"Controls: {ctrlList}\n" +
                "Return: Top 3 gaps with control references, remediation steps, effort estimate (days), and evidence sufficiency score 0-100.";
            try
            {
                var body = JsonSerializer.Serialize(new { model = cfg.OllamaModel, prompt, stream = false });
                using var cts2    = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                var ollamaClient2 = http.CreateClient("ollama");
                var res  = await ollamaClient2.PostAsync("/api/generate",
                    new StringContent(body, Encoding.UTF8, "application/json"), cts2.Token);
                var raw  = await res.Content.ReadAsStringAsync();
                var doc  = JsonDocument.Parse(raw);
                return Results.Ok(new
                {
                    domain_id = req.DomainId,
                    analysis  = doc.RootElement.GetProperty("response").GetString(),
                    model     = cfg.OllamaModel
                });
            }
            catch (Exception ex)
            {
                return Results.Ok(new
                {
                    domain_id = req.DomainId,
                    analysis  = $"AI unavailable: {ex.Message}",
                    model     = cfg.OllamaModel
                });
            }
        });

        return app;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static ParsedAction? ParseActionJson(string reply)
    {
        foreach (var line in reply.Split('\n'))
        {
            var trimmed = line.TrimStart();
            if (!trimmed.StartsWith("ACTION_JSON:")) continue;
            var json = trimmed["ACTION_JSON:".Length..].Trim();
            try
            {
                var node   = JsonNode.Parse(json);
                var action = node?["action"]?.GetValue<string>();
                var pNode  = node?["params"];
                if (string.IsNullOrEmpty(action)) continue;
                var paramsDict = new Dictionary<string, string>();
                if (pNode is JsonObject obj)
                {
                    foreach (var kv in obj)
                        if (kv.Value != null)
                            paramsDict[kv.Key] = kv.Value.ToString();
                }
                return new ParsedAction(action, paramsDict);
            }
            catch { /* malformed JSON — skip */ }
        }
        return null;
    }

    private static string BuildPreview(string action, Dictionary<string, string> p)
    {
        return action switch
        {
            "create_finding"          => $"{p.GetValueOrDefault("severity","?").ToUpper()} finding · {p.GetValueOrDefault("standard","?")} · {p.GetValueOrDefault("title","(untitled)")}",
            "create_risk"             => $"Risk: {p.GetValueOrDefault("title","?")} · L{p.GetValueOrDefault("likelihood","?")} × I{p.GetValueOrDefault("impact","?")} · {p.GetValueOrDefault("treatment","mitigate")}",
            "update_finding_status"   => $"Finding {p.GetValueOrDefault("findingId","?")} → {p.GetValueOrDefault("status","?")}",
            "create_workflow"         => $"Workflow: {p.GetValueOrDefault("name","?")} · {p.GetValueOrDefault("standard","?")}",
            "run_gap_analysis"        => $"Gap analysis for {p.GetValueOrDefault("standard","?")}",
            _                         => action,
        };
    }

    private static async Task<(object? result, string? error)> ExecuteAction(
        string action, Dictionary<string, string> p, string sc, string email, IDbConnection db)
    {
        try
        {
            switch (action)
            {
                case "create_finding":
                case "log_finding":
                case "add_finding":
                {
                    var id = Helpers.NewId();
                    await db.ExecuteAsync(
                        $@"INSERT INTO {sc}.findings
                           (id, title, standard, severity, description, control_ref,
                            ai_system_id, status, ai_generated, created_at)
                           VALUES (@Id,@Title,@Standard,@Severity,@Desc,@CtrlRef,
                                   @SysId,'open',true,NOW())",
                        new
                        {
                            Id       = id,
                            Title    = p.GetValueOrDefault("title", "AI-generated finding"),
                            Standard = p.GetValueOrDefault("standard", "ISO42001"),
                            Severity = p.GetValueOrDefault("severity", "medium"),
                            Desc     = p.GetValueOrDefault("description", ""),
                            CtrlRef  = p.GetValueOrDefault("controlRef", ""),
                            SysId    = p.ContainsKey("aiSystemId") && !string.IsNullOrEmpty(p["aiSystemId"])
                                           ? p["aiSystemId"] : (object?)null,
                        });
                    return (new { id, title = p.GetValueOrDefault("title"), status = "open" }, null);
                }

                case "create_risk":
                case "add_risk":
                case "log_risk":
                {
                    var id         = Helpers.NewId();
                    var likelihood = int.TryParse(p.GetValueOrDefault("likelihood", "3"), out var l) ? l : 3;
                    var impact     = int.TryParse(p.GetValueOrDefault("impact", "3"), out var i) ? i : 3;
                    await db.ExecuteAsync(
                        $@"INSERT INTO {sc}.risks
                           (id, title, description, category, likelihood, impact,
                            residual_likelihood, residual_impact, treatment,
                            owner_email, status, created_at)
                           VALUES (@Id,@Title,@Desc,@Cat,@L,@I,@L,@I,@Treat,@Owner,'open',NOW())",
                        new
                        {
                            Id    = id,
                            Title = p.GetValueOrDefault("title", "AI-generated risk"),
                            Desc  = p.GetValueOrDefault("description", ""),
                            Cat   = p.GetValueOrDefault("category", "compliance"),
                            L     = likelihood, I = impact,
                            Treat = p.GetValueOrDefault("treatment", "mitigate"),
                            Owner = email,
                        });
                    return (new { id, inherent_score = likelihood * impact, status = "open" }, null);
                }

                case "update_finding_status":
                {
                    var findingId = p.GetValueOrDefault("findingId", "");
                    var status    = p.GetValueOrDefault("status", "in-remediation");
                    if (string.IsNullOrEmpty(findingId))
                        return (null, "findingId is required");
                    var rows = await db.ExecuteAsync(
                        $"UPDATE {sc}.findings SET status=@Status WHERE id=@Id",
                        new { Status = status, Id = findingId });
                    return rows > 0
                        ? ((object)new { findingId, status }, null)
                        : (null, $"Finding {findingId} not found");
                }

                case "create_workflow":
                case "create_audit_workflow":
                case "start_audit_workflow":
                case "initiate_workflow":
                {
                    var id = Helpers.NewId();
                    var wId = $"WF-{DateTime.UtcNow:yyMMdd}-AI";
                    await db.ExecuteAsync(
                        $@"INSERT INTO {sc}.workflows
                           (id, workflow_id, name, standard, status, progress,
                            created_by, created_at, updated_at)
                           VALUES (@Id,@Wid,@Name,@Std,'draft',0,@Email,NOW(),NOW())",
                        new
                        {
                            Id    = id,
                            Wid   = wId,
                            Name  = p.GetValueOrDefault("name", "AI-created workflow"),
                            Std   = p.GetValueOrDefault("standard", "ISO42001"),
                            Email = email,
                        });
                    return (new { id, workflow_id = wId, status = "draft" }, null);
                }

                case "run_gap_analysis":
                {
                    return (new
                    {
                        message  = $"Gap analysis queued for {p.GetValueOrDefault("standard", "?")}. Open the Audit Tracking page and run gap analysis on your workflow.",
                        standard = p.GetValueOrDefault("standard"),
                    }, null);
                }

                case "create_framework":
                case "register_framework":
                case "add_framework":
                {
                    var id   = Helpers.NewId();
                    var code = (p.GetValueOrDefault("code", "") ?? "").ToUpper().Replace(" ", "_");
                    if (string.IsNullOrEmpty(code)) return (null, "code is required for create_framework");
                    await db.ExecuteAsync(
                        $@"INSERT INTO {sc}.frameworks
                           (id, code, name, short_name, version, description, category, color, icon, is_active, sort_order)
                           VALUES (@Id,@Code,@Name,@Short,@Ver,@Desc,@Cat,@Color,@Icon,true,99)
                           ON CONFLICT(code) DO NOTHING",
                        new
                        {
                            Id    = id,
                            Code  = code,
                            Name  = p.GetValueOrDefault("name", code),
                            Short = p.GetValueOrDefault("shortName", code),
                            Ver   = p.GetValueOrDefault("version", "2024"),
                            Desc  = p.GetValueOrDefault("description", ""),
                            Cat   = p.GetValueOrDefault("category", "security"),
                            Color = p.GetValueOrDefault("color", "#6366f1"),
                            Icon  = code[..1],
                        });
                    return (new { id, code, name = p.GetValueOrDefault("name", code) }, null);
                }

                case "update_risk_status":
                {
                    var riskId = p.GetValueOrDefault("riskId", "");
                    var status = p.GetValueOrDefault("status", "mitigating");
                    if (string.IsNullOrEmpty(riskId)) return (null, "riskId is required");
                    var rows = await db.ExecuteAsync(
                        $"UPDATE {sc}.risks SET status=@Status WHERE id=@Id",
                        new { Status = status, Id = riskId });
                    return rows > 0
                        ? ((object)new { riskId, status }, null)
                        : (null, $"Risk {riskId} not found");
                }

                case "create_incident":
                case "raise_incident":
                case "log_incident":
                {
                    var id  = Helpers.NewId();
                    var iid = $"INC-{DateTime.UtcNow:yyMMddHHmm}";
                    await db.ExecuteAsync(
                        $@"INSERT INTO {sc}.itsm_incidents
                           (id, incident_id, title, description, priority, status,
                            reported_by, ai_system_id, created_at, updated_at)
                           VALUES (@Id,@Iid,@Title,@Desc,@Pri,'open',@Email,@SysId,NOW(),NOW())",
                        new
                        {
                            Id    = id,
                            Iid   = iid,
                            Title = p.GetValueOrDefault("title", "AI-generated incident"),
                            Desc  = p.GetValueOrDefault("description", ""),
                            Pri   = p.GetValueOrDefault("priority", "p3"),
                            Email = email,
                            SysId = p.ContainsKey("aiSystemId") && !string.IsNullOrEmpty(p["aiSystemId"])
                                        ? p["aiSystemId"] : (object?)null,
                        });
                    return (new { id, incident_id = iid, status = "open" }, null);
                }

                default:
                    return (null, $"Unknown action: {action}");
            }
        }
        catch (Exception ex)
        {
            return (null, ex.Message);
        }
    }

    private static async Task<string> WriteLog(
        IDbConnection db, string sc, string? sessionId, string email,
        string action, Dictionary<string, string> parms,
        object? result, string? error, string execMode)
    {
        var logId = Helpers.NewId();
        try
        {
            await db.ExecuteAsync(
                $@"INSERT INTO {sc}.ai_action_logs
                   (id, session_id, user_email, action_type, parameters, result,
                    exec_mode, status, error_msg, created_at)
                   VALUES (@Id,@Sid,@Email,@Act,@Params::jsonb,@Result::jsonb,
                           @Mode,@Status,@Err,NOW())",
                new
                {
                    Id     = logId,
                    Sid    = sessionId,
                    Email  = email,
                    Act    = action,
                    Params = JsonSerializer.Serialize(parms),
                    Result = result != null ? JsonSerializer.Serialize(result) : (object?)"null",
                    Mode   = execMode,
                    Status = error == null ? "success" : "failed",
                    Err    = error,
                });
        }
        catch { /* log failure should not fail the main request */ }
        return logId;
    }

    private static async Task<string> GetCtx(IDbConnection db, string sql, string id)
    {
        try
        {
            var row = await db.QueryFirstOrDefaultAsync(sql, new { Id = id });
            if (row == null) return "";
            var dict = (IDictionary<string, object>)row;
            return string.Join(" | ", dict.Select(kv => $"{kv.Key}:{kv.Value}"));
        }
        catch { return ""; }
    }

    // ── Records ───────────────────────────────────────────────────────────────
    record ParsedAction(string Action, Dictionary<string, string> Params);
    record ChatReq(string Message, string? SessionId, string? ContextModule, string? ContextId, ChatMsg[]? History);
    record ChatMsg(string Role, string Content);
    record GapReq(string DomainId, string? AiSystemId);
    record AiSettingsReq(bool AiAutoExecute);
    record ExecuteReq(string Action, Dictionary<string, string> Params, string? SessionId);
}
