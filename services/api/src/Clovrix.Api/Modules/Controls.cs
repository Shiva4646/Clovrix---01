using System.Data;
using Dapper;
using StackExchange.Redis;

namespace Clovrix.Api.Modules;

public static class ControlsModule
{
    public static WebApplication MapControlsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api").WithTags("Controls");

        // ── Control Domains ───────────────────────────────────────────────────
        g.MapGet("/domains", async (HttpContext ctx, IDbConnection db, string? standard = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var where  = standard != null ? "WHERE standard=@Standard" : "";
            var domains = await db.QueryAsync($"SELECT * FROM {sc}.control_domains {where} ORDER BY standard,id", new { Standard = standard });
            return Results.Ok(domains);
        });

        g.MapGet("/domains/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var domain   = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.control_domains WHERE id=@Id", new { Id = id });
            if (domain == null) return Results.NotFound();
            var controls = await db.QueryAsync($"SELECT * FROM {sc}.controls WHERE domain_id=@Id ORDER BY ref", new { Id = id });
            var findings = await db.QueryAsync($"SELECT * FROM {sc}.findings WHERE domain_id=@Id ORDER BY created_at DESC LIMIT 10", new { Id = id });
            var risks    = await db.QueryAsync($"SELECT * FROM {sc}.risks WHERE domain_id=@Id AND status!='closed' ORDER BY inherent_score DESC", new { Id = id });
            return Results.Ok(new { domain, controls, findings, risks });
        });

        g.MapPut("/domains/{id}/score", async (string id, ScoreReq req, HttpContext ctx, IDbConnection db, IConnectionMultiplexer valkey) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.control_domains SET
                    score=@Score, last_tested_at=NOW(), updated_at=NOW(),
                    status=CASE WHEN @Score>=80 THEN 'compliant' WHEN @Score>=50 THEN 'partial' ELSE 'non-compliant' END,
                    risk_level=CASE WHEN @Score>=80 THEN 'low' WHEN @Score>=60 THEN 'medium' WHEN @Score>=40 THEN 'high' ELSE 'critical' END
                WHERE id=@Id", new { Score = req.Score, Id = id });
            await Helpers.Log(db, sc, email, "domain.score.updated", "control_domains", id, new { score = req.Score });
            await valkey.GetDatabase().KeyDeleteAsync($"{sc}:dashboard:v2");
            return Results.Ok(new { message = "Score updated", id, score = req.Score });
        });

        // ── Individual Controls ───────────────────────────────────────────────
        g.MapGet("/controls", async (HttpContext ctx, IDbConnection db,
            string? domainId = null, string? status = null, int page = 1, int size = 50) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var filters = new List<string>();
            if (domainId != null) filters.Add("domain_id=@DomainId");
            if (status   != null) filters.Add("status=@Status");
            var where  = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";
            var (offset, sz) = Pagination.Parse(page, size);
            var items  = await db.QueryAsync($"SELECT * FROM {sc}.controls {where} ORDER BY ref LIMIT @Sz OFFSET @Off",
                new { DomainId = domainId, Status = status, Sz = sz, Off = offset });
            var total  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.controls {where}",
                new { DomainId = domainId, Status = status });
            return Results.Ok(Pagination.Of(items, total, page, sz));
        });

        g.MapGet("/controls/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var ctrl = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.controls WHERE id=@Id", new { Id = id });
            if (ctrl == null) return Results.NotFound();
            var evidence = await db.QueryAsync($"SELECT * FROM {sc}.evidence WHERE control_id=@Id ORDER BY created_at DESC", new { Id = id });
            return Results.Ok(new { control = ctrl, evidence });
        });

        g.MapPost("/controls", async (CreateControlReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var id    = Helpers.NewId();
            db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.controls(id,domain_id,ref,title,description,testing_procedure,evidence_required,frequency,automated,owner_email)
                VALUES(@Id,@DomainId,@Ref,@Title,@Desc,@TestProc,@EvidReq,@Freq,@Auto,@Owner)",
                new { Id = id, req.DomainId, req.Ref, req.Title, Desc = req.Description,
                      TestProc = req.TestingProcedure, EvidReq = req.EvidenceRequired,
                      Freq = req.Frequency ?? "annual", Auto = req.Automated ?? false, Owner = req.OwnerEmail });
            await db.ExecuteAsync($"UPDATE {sc}.control_domains SET controls_count=controls_count+1 WHERE id=@Id", new { Id = req.DomainId });
            await Helpers.Log(db, sc, email, "control.created", "controls", id, new { title = req.Title });
            return Results.Created($"/api/controls/{id}", new { id });
        });

        g.MapPut("/controls/{id}/status", async (string id, ControlStatusReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.controls SET
                    status=@Status, last_tested_at=CASE WHEN @Status!='not-tested' THEN NOW() ELSE last_tested_at END,
                    last_result=@Status, updated_at=NOW()
                WHERE id=@Id", new { Id = id, req.Status });
            await Helpers.Log(db, sc, email, "control.status.updated", "controls", id, new { status = req.Status });
            return Results.Ok(new { message = "Control updated", status = req.Status });
        });

        g.MapPut("/controls/{id}", async (string id, UpdateControlReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.controls SET
                    title=COALESCE(@Title,title),
                    description=COALESCE(@Desc,description),
                    testing_procedure=COALESCE(@TestProc,testing_procedure),
                    evidence_required=COALESCE(@EvidReq,evidence_required),
                    frequency=COALESCE(@Freq,frequency),
                    owner_email=COALESCE(@Owner,owner_email),
                    updated_at=NOW()
                WHERE id=@Id",
                new { Id = id, req.Title, Desc = req.Description, TestProc = req.TestingProcedure,
                      EvidReq = req.EvidenceRequired, Freq = req.Frequency, Owner = req.OwnerEmail });
            return Results.Ok(new { message = "Control updated" });
        });

        // ── Bulk upload controls from XLSX ────────────────────────────────────
        // Expected columns: ref, title, description, domain_ref (ref_code or domain id), frequency
        g.MapPost("/controls/bulk", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();

            if (!ctx.Request.HasFormContentType)
                return Results.BadRequest(new { error = "Multipart form required" });

            var form     = await ctx.Request.ReadFormAsync();
            var file     = form.Files["file"];
            var domainId = form["domainId"].FirstOrDefault();

            if (file == null || file.Length == 0)
                return Results.BadRequest(new { error = "No file uploaded" });

            // Resolve domain — by id or ref_code
            string? resolvedDomainId = domainId;
            if (!string.IsNullOrEmpty(domainId))
            {
                var byId = await db.QueryFirstOrDefaultAsync<string?>(
                    $"SELECT id FROM {sc}.control_domains WHERE id=@D OR ref_code=@D", new { D = domainId });
                if (byId != null) resolvedDomainId = byId;
            }

            var created = new List<string>();
            var errors  = new List<string>();

            using var stream = file.OpenReadStream();
            using var wb     = new ClosedXML.Excel.XLWorkbook(stream);
            var ws = wb.Worksheets.First();
            var lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;

            // Detect header row — find columns by name
            var headerRow = ws.Row(1);
            int colRef=-1, colTitle=-1, colDesc=-1, colDomain=-1, colFreq=-1;
            foreach (var cell in headerRow.CellsUsed())
            {
                var h = cell.GetString().Trim().ToLower();
                if (h == "ref")         colRef    = cell.Address.ColumnNumber;
                if (h == "title")       colTitle  = cell.Address.ColumnNumber;
                if (h is "description" or "desc") colDesc = cell.Address.ColumnNumber;
                if (h is "domain" or "domain_ref" or "domain_id") colDomain = cell.Address.ColumnNumber;
                if (h is "frequency" or "freq") colFreq = cell.Address.ColumnNumber;
            }

            if (colRef < 0 || colTitle < 0)
                return Results.BadRequest(new { error = "Excel must have 'ref' and 'title' columns in row 1" });

            for (int r = 2; r <= lastRow; r++)
            {
                var row  = ws.Row(r);
                var ref_ = colRef   > 0 ? row.Cell(colRef).GetString().Trim()   : "";
                var title= colTitle > 0 ? row.Cell(colTitle).GetString().Trim() : "";
                if (string.IsNullOrEmpty(ref_) || string.IsNullOrEmpty(title)) continue;

                var desc  = colDesc   > 0 ? row.Cell(colDesc).GetString().Trim()   : "";
                var freq  = colFreq   > 0 ? row.Cell(colFreq).GetString().Trim()   : "annual";
                var dRef  = colDomain > 0 ? row.Cell(colDomain).GetString().Trim() : "";

                // Resolve domain per row (if column present) or fall back to form domainId
                string? rowDomainId = resolvedDomainId;
                if (!string.IsNullOrEmpty(dRef))
                {
                    var d = await db.QueryFirstOrDefaultAsync<string?>(
                        $"SELECT id FROM {sc}.control_domains WHERE id=@D OR ref_code=@D", new { D = dRef });
                    if (d != null) rowDomainId = d;
                }

                if (string.IsNullOrEmpty(rowDomainId)) { errors.Add($"Row {r}: no domain resolved"); continue; }

                try
                {
                    var id = Helpers.NewId();
                    await db.ExecuteAsync($@"
                        INSERT INTO {sc}.controls(id,domain_id,ref,title,description,frequency,status)
                        VALUES(@Id,@DomId,@Ref,@Title,@Desc,@Freq,'not-tested')
                        ON CONFLICT DO NOTHING",
                        new { Id = id, DomId = rowDomainId, Ref = ref_, Title = title, Desc = desc,
                              Freq = string.IsNullOrEmpty(freq) ? "annual" : freq });
                    await db.ExecuteAsync($"UPDATE {sc}.control_domains SET controls_count=controls_count+1 WHERE id=@Id", new { Id = rowDomainId });
                    created.Add(id);
                }
                catch (Exception ex) { errors.Add($"Row {r}: {ex.Message}"); }
            }

            await Helpers.Log(db, sc, email, "controls.bulk_imported", "controls", domainId ?? "bulk",
                new { count = created.Count });
            return Results.Ok(new { created = created.Count, errors });
        });

        return app;
    }

    record ScoreReq(int Score);
    record ControlStatusReq(string Status);
    record CreateControlReq(string DomainId, string Ref, string Title, string? Description,
        string? TestingProcedure, string? EvidenceRequired, string? Frequency,
        bool? Automated, string? OwnerEmail);
    record UpdateControlReq(string? Title, string? Description, string? TestingProcedure,
        string? EvidenceRequired, string? Frequency, string? OwnerEmail);
}
