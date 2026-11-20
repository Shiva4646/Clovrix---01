using System.Data;
using Dapper;
using Minio;
using Minio.DataModel.Args;

namespace Clovrix.Api.Modules;

public static class AuditorModule
{
    public static WebApplication MapAuditorModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/auditor").WithTags("Auditor");

        g.MapGet("/summary", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);

            return Results.Ok(new
            {
                soa_pending = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.statement_of_applicability WHERE status IN ('draft','pending_review','rejected')"),
                evidence_pending = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.evidence WHERE COALESCE(verification_status,'pending') IN ('pending','rejected')"),
                findings_pending = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.findings WHERE COALESCE(validation_status,'pending') IN ('pending','rejected') AND status NOT IN ('accepted','closed')"),
                remediations_pending = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.remediations WHERE status IN ('resolved','completed','closure_requested') OR COALESCE(closure_status,'pending') IN ('pending','more_evidence_requested','rejected')"),
                signed_off = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.statement_of_applicability WHERE status='approved'")
            });
        });

        g.MapGet("/soa", async (HttpContext ctx, IDbConnection db, string? standard = null) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);

            await SeedSoa(db, sc, standard);
            var where = standard != null ? "WHERE s.framework_code=@Standard" : "";
            var statements = (await db.QueryAsync($@"
                SELECT s.*, f.name AS framework_name, f.short_name
                FROM {sc}.statement_of_applicability s
                LEFT JOIN {sc}.frameworks f ON f.code=s.framework_code
                {where}
                ORDER BY s.framework_code", new { Standard = standard })).ToList();

            var controls = await db.QueryAsync($@"
                SELECT c.id, c.ref, c.title, c.description, c.status,
                       c.soa_applicability AS applicability,
                       c.soa_justification AS justification,
                       c.soa_locked AS locked,
                       d.standard, d.area AS domain_name, d.ref_code AS domain_ref
                FROM {sc}.controls c
                JOIN {sc}.control_domains d ON d.id=c.domain_id
                WHERE (@Standard IS NULL OR d.standard=@Standard)
                ORDER BY d.standard, d.id, c.ref", new { Standard = standard });

            var history = await db.QueryAsync($@"
                SELECT * FROM {sc}.auditor_history
                WHERE entity_type='soa' AND (@Standard IS NULL OR entity_id=@Standard)
                ORDER BY created_at DESC LIMIT 50", new { Standard = standard });

            return Results.Ok(new { statements, controls, history });
        });

        g.MapPost("/soa/{standard}/decision", async (string standard, AuditorDecisionReq req, HttpContext ctx, IDbConnection db) =>
        {
            if (req.Decision is not ("approve" or "reject")) return Results.BadRequest(new { error = "Decision must be approve or reject" });
            var sc = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            await SeedSoa(db, sc, standard);

            var status = req.Decision == "approve" ? "approved" : "rejected";
            await db.ExecuteAsync($@"
                UPDATE {sc}.statement_of_applicability
                SET status=@Status, approver=@Email, approved_at=CASE WHEN @Status='approved' THEN NOW() ELSE approved_at END,
                    rejected_at=CASE WHEN @Status='rejected' THEN NOW() ELSE rejected_at END,
                    comments=COALESCE(@Comments, comments), updated_at=NOW()
                WHERE framework_code=@Standard", new { Standard = standard, Status = status, Email = email, req.Comments });

            if (status == "approved")
                await db.ExecuteAsync($@"
                    UPDATE {sc}.controls c
                    SET soa_locked=true, updated_at=NOW()
                    FROM {sc}.control_domains d
                    WHERE c.domain_id=d.id AND d.standard=@Standard", new { Standard = standard });

            await AddHistory(db, sc, "soa", standard, $"soa.{status}", email, req.Comments, new { standard });
            await Helpers.Log(db, sc, email, $"soa.{status}", "statement_of_applicability", standard, new { req.Comments });
            return Results.Ok(new { standard, status, approver = email, approved_at = status == "approved" ? DateTime.UtcNow : (DateTime?)null });
        });

        g.MapGet("/evidence", async (HttpContext ctx, IDbConnection db, string? status = null) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var filter = status != null ? "WHERE COALESCE(e.verification_status,'pending')=@Status" : "";
            var rows = await db.QueryAsync($@"
                SELECT e.*, c.ref AS control_ref, c.title AS control_title, d.standard, d.area AS domain_name,
                       (SELECT COUNT(*) FROM {sc}.auditor_history h WHERE h.entity_type='evidence' AND h.entity_id=e.id) AS history_count
                FROM {sc}.evidence e
                LEFT JOIN {sc}.controls c ON c.id=e.control_id
                LEFT JOIN {sc}.control_domains d ON d.id=COALESCE(e.domain_id, c.domain_id)
                {filter}
                ORDER BY e.created_at DESC", new { Status = status });
            return Results.Ok(rows);
        });

        g.MapGet("/evidence/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var evidence = await db.QueryFirstOrDefaultAsync($@"
                SELECT e.*, c.ref AS control_ref, c.title AS control_title, d.standard, d.area AS domain_name
                FROM {sc}.evidence e
                LEFT JOIN {sc}.controls c ON c.id=e.control_id
                LEFT JOIN {sc}.control_domains d ON d.id=COALESCE(e.domain_id, c.domain_id)
                WHERE e.id=@Id", new { Id = id });
            if (evidence == null) return Results.NotFound();
            var history = await History(db, sc, "evidence", id);
            return Results.Ok(new { evidence, history });
        });

        g.MapPost("/evidence/{id}/decision", async (string id, AuditorDecisionReq req, HttpContext ctx, IDbConnection db) =>
        {
            if (req.Decision is not ("verify" or "reject")) return Results.BadRequest(new { error = "Decision must be verify or reject" });
            var sc = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var ev = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.evidence WHERE id=@Id", new { Id = id });
            if (ev == null) return Results.NotFound();
            var status = req.Decision == "verify" ? "verified" : "rejected";
            await db.ExecuteAsync($@"
                UPDATE {sc}.evidence
                SET verification_status=@Status, verification_comments=COALESCE(@Comments, verification_comments),
                    verified_by=@Email, verified_at=NOW()
                WHERE id=@Id", new { Id = id, Status = status, Email = email, req.Comments });
            if (status == "verified" && ev.control_id != null)
                await db.ExecuteAsync($"UPDATE {sc}.controls SET status='compliant', last_tested_at=NOW(), last_result='passed', updated_at=NOW() WHERE id=@Id", new { Id = (string)ev.control_id });
            await AddHistory(db, sc, "evidence", id, $"evidence.{status}", email, req.Comments);
            await Helpers.Log(db, sc, email, $"evidence.{status}", "evidence", id, new { req.Comments });
            return Results.Ok(new { id, status });
        });

        g.MapGet("/evidence/{id}/download", async (string id, HttpContext ctx, IDbConnection db, IMinioClient minio) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            var ev = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.evidence WHERE id=@Id", new { Id = id });
            if (ev == null) return Results.NotFound();
            var url = await minio.PresignedGetObjectAsync(new PresignedGetObjectArgs()
                .WithBucket((string)ev.storage_bucket)
                .WithObject((string)ev.storage_key)
                .WithExpiry(3600));
            return Results.Ok(new { url, filename = ev.original_name, expires_in = 3600 });
        });

        g.MapGet("/findings", async (HttpContext ctx, IDbConnection db, string? status = null) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var filter = status != null ? "WHERE COALESCE(f.validation_status,'pending')=@Status" : "";
            var rows = await db.QueryAsync($@"
                SELECT f.*, d.area AS domain_name, c.ref AS control_ref_resolved, c.title AS control_title,
                       (SELECT COUNT(*) FROM {sc}.finding_files ff WHERE ff.finding_id=f.id) AS evidence_count
                FROM {sc}.findings f
                LEFT JOIN {sc}.control_domains d ON d.id=f.domain_id
                LEFT JOIN {sc}.controls c ON c.id=f.control_id
                {filter}
                ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, f.created_at DESC", new { Status = status });
            return Results.Ok(rows);
        });

        g.MapGet("/findings/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var finding = await db.QueryFirstOrDefaultAsync($@"
                SELECT f.*, d.area AS domain_name, c.ref AS control_ref_resolved, c.title AS control_title
                FROM {sc}.findings f
                LEFT JOIN {sc}.control_domains d ON d.id=f.domain_id
                LEFT JOIN {sc}.controls c ON c.id=f.control_id
                WHERE f.id=@Id", new { Id = id });
            if (finding == null) return Results.NotFound();
            var files = await db.QueryAsync($"SELECT * FROM {sc}.finding_files WHERE finding_id=@Id ORDER BY created_at DESC", new { Id = id });
            var history = await History(db, sc, "finding", id);
            return Results.Ok(new { finding, files, history });
        });

        g.MapPost("/findings/{id}/decision", async (string id, FindingDecisionReq req, HttpContext ctx, IDbConnection db) =>
        {
            if (req.Decision is not ("validate" or "reject")) return Results.BadRequest(new { error = "Decision must be validate or reject" });
            var sc = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var finding = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.findings WHERE id=@Id", new { Id = id });
            if (finding == null) return Results.NotFound();
            var validation = req.Decision == "validate" ? "validated" : "rejected";
            var status = req.Decision == "validate" ? "in-remediation" : "open";
            await db.ExecuteAsync($@"
                UPDATE {sc}.findings
                SET validation_status=@Validation, status=@Status, severity=COALESCE(@Severity, severity),
                    validation_comments=COALESCE(@Comments, validation_comments),
                    validated_by=@Email, validated_at=NOW(), updated_at=NOW()
                WHERE id=@Id", new { Id = id, Validation = validation, Status = status, req.Severity, req.Comments, Email = email });
            if (req.Decision == "validate" && finding.control_id != null)
                await db.ExecuteAsync($"UPDATE {sc}.controls SET status='non-compliant', last_result='failed', last_tested_at=NOW(), updated_at=NOW() WHERE id=@Id", new { Id = (string)finding.control_id });
            await AddHistory(db, sc, "finding", id, $"finding.{validation}", email, req.Comments, new { req.Severity });
            await Helpers.Log(db, sc, email, $"finding.{validation}", "findings", id, new { req.Severity, req.Comments });
            return Results.Ok(new { id, validation_status = validation, status });
        });

        g.MapGet("/remediations", async (HttpContext ctx, IDbConnection db, string? status = null) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var filter = status != null ? "WHERE COALESCE(r.closure_status,'pending')=@Status" : "";
            var rows = await db.QueryAsync($@"
                SELECT r.*, f.title AS finding_title, f.severity, f.standard, f.control_ref,
                       (SELECT COUNT(*) FROM {sc}.evidence e WHERE e.workflow_id=f.workflow_id OR e.control_id=f.control_id) AS evidence_count
                FROM {sc}.remediations r
                LEFT JOIN {sc}.findings f ON f.id=r.finding_id
                {filter}
                ORDER BY r.due_date NULLS LAST, r.created_at DESC", new { Status = status });
            return Results.Ok(rows);
        });

        g.MapGet("/remediations/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var remediation = await db.QueryFirstOrDefaultAsync($@"
                SELECT r.*, f.title AS finding_title, f.description AS finding_description, f.severity, f.standard, f.control_id, f.workflow_id
                FROM {sc}.remediations r
                LEFT JOIN {sc}.findings f ON f.id=r.finding_id
                WHERE r.id=@Id", new { Id = id });
            if (remediation == null) return Results.NotFound();
            var evidence = await db.QueryAsync($@"
                SELECT e.*, c.ref AS control_ref
                FROM {sc}.evidence e
                LEFT JOIN {sc}.controls c ON c.id=e.control_id
                WHERE e.workflow_id=@WorkflowId OR e.control_id=@ControlId
                ORDER BY e.created_at DESC", new { WorkflowId = (string?)remediation.workflow_id, ControlId = (string?)remediation.control_id });
            var history = await History(db, sc, "remediation", id);
            return Results.Ok(new { remediation, evidence, history });
        });

        g.MapPost("/remediations/{id}/decision", async (string id, RemediationDecisionReq req, HttpContext ctx, IDbConnection db) =>
        {
            if (req.Decision is not ("approve" or "reject" or "more_evidence")) return Results.BadRequest(new { error = "Decision must be approve, reject, or more_evidence" });
            var sc = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsureSchema(db, sc);
            var remediation = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.remediations WHERE id=@Id", new { Id = id });
            if (remediation == null) return Results.NotFound();
            var closure = req.Decision == "approve" ? "approved" : req.Decision == "reject" ? "rejected" : "more_evidence_requested";
            var status = req.Decision == "approve" ? "verified" : req.Decision == "reject" ? "in_progress" : "evidence_requested";
            await db.ExecuteAsync($@"
                UPDATE {sc}.remediations
                SET status=@Status, closure_status=@Closure, closure_notes=COALESCE(@Comments, closure_notes),
                    verified_by=@Email, verified_at=CASE WHEN @Closure='approved' THEN NOW() ELSE verified_at END,
                    updated_at=NOW()
                WHERE id=@Id", new { Id = id, Status = status, Closure = closure, Email = email, req.Comments });
            if (req.Decision == "approve" && remediation.finding_id != null)
                await db.ExecuteAsync($"UPDATE {sc}.findings SET status='resolved', closed_at=COALESCE(closed_at,NOW()), updated_at=NOW() WHERE id=@Id", new { Id = (string)remediation.finding_id });
            await AddHistory(db, sc, "remediation", id, $"remediation.closure.{closure}", email, req.Comments);
            await Helpers.Log(db, sc, email, $"remediation.closure.{closure}", "remediations", id, new { req.Comments });
            return Results.Ok(new { id, status, closure_status = closure });
        });

        return app;
    }

    public static async Task EnsureSchema(IDbConnection db, string sc)
    {
        await db.ExecuteAsync($@"
            CREATE TABLE IF NOT EXISTS {sc}.statement_of_applicability (
                id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
                framework_code VARCHAR(30) NOT NULL UNIQUE,
                status VARCHAR(30) NOT NULL DEFAULT 'draft',
                approver VARCHAR(200),
                approved_at TIMESTAMPTZ,
                rejected_at TIMESTAMPTZ,
                comments TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            );
            CREATE TABLE IF NOT EXISTS {sc}.auditor_history (
                id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
                entity_type VARCHAR(40) NOT NULL,
                entity_id VARCHAR(60) NOT NULL,
                action VARCHAR(80) NOT NULL,
                actor_email VARCHAR(200),
                comments TEXT,
                metadata JSONB NOT NULL DEFAULT '{{}}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE {sc}.controls ADD COLUMN IF NOT EXISTS soa_applicability VARCHAR(30) NOT NULL DEFAULT 'applicable';
            ALTER TABLE {sc}.controls ADD COLUMN IF NOT EXISTS soa_justification TEXT;
            ALTER TABLE {sc}.controls ADD COLUMN IF NOT EXISTS soa_locked BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'pending';
            ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verification_comments TEXT;
            ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verified_by VARCHAR(200);
            ALTER TABLE {sc}.evidence ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
            ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validation_status VARCHAR(30) NOT NULL DEFAULT 'pending';
            ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validation_comments TEXT;
            ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validated_by VARCHAR(200);
            ALTER TABLE {sc}.findings ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
            ALTER TABLE {sc}.remediations ADD COLUMN IF NOT EXISTS closure_status VARCHAR(30) NOT NULL DEFAULT 'pending';
            ALTER TABLE {sc}.remediations ADD COLUMN IF NOT EXISTS closure_notes TEXT;
            CREATE INDEX IF NOT EXISTS idx_auditor_history_entity ON {sc}.auditor_history(entity_type, entity_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_soa_status ON {sc}.statement_of_applicability(status);");
    }

    static async Task SeedSoa(IDbConnection db, string sc, string? standard)
    {
        var filter = standard != null ? "AND f.code=@Standard" : "";
        await db.ExecuteAsync($@"
            INSERT INTO {sc}.statement_of_applicability(framework_code, status)
            SELECT f.code, 'pending_review'
            FROM {sc}.frameworks f
            WHERE f.is_active=true {filter}
            ON CONFLICT (framework_code) DO NOTHING", new { Standard = standard });
        await db.ExecuteAsync($@"
            UPDATE {sc}.controls c
            SET soa_justification=COALESCE(soa_justification, COALESCE(c.testing_procedure, c.evidence_required, 'Required by mapped framework control.'))
            FROM {sc}.control_domains d
            WHERE c.domain_id=d.id AND (@Standard IS NULL OR d.standard=@Standard)", new { Standard = standard });
    }

    static Task<IEnumerable<dynamic>> History(IDbConnection db, string sc, string type, string id) =>
        db.QueryAsync($"SELECT * FROM {sc}.auditor_history WHERE entity_type=@Type AND entity_id=@Id ORDER BY created_at DESC", new { Type = type, Id = id });

    static Task AddHistory(IDbConnection db, string sc, string type, string id, string action, string actor, string? comments, object? metadata = null) =>
        db.ExecuteAsync($@"
            INSERT INTO {sc}.auditor_history(id,entity_type,entity_id,action,actor_email,comments,metadata,created_at)
            VALUES(gen_random_uuid()::VARCHAR,@Type,@Id,@Action,@Actor,@Comments,@Metadata::jsonb,NOW())",
            new { Type = type, Id = id, Action = action, Actor = actor, Comments = comments, Metadata = System.Text.Json.JsonSerializer.Serialize(metadata ?? new { }) });

    record AuditorDecisionReq(string Decision, string? Comments);
    record FindingDecisionReq(string Decision, string? Severity, string? Comments);
    record RemediationDecisionReq(string Decision, string? Comments);
}
