using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ─────────────────────────────────────────────────────────────────────────────
// Assessments module — the BE2 half of the audit cycle, in the same Dapper +
// minimal-API style as Audits.cs / ControlLead.cs (no EF Core).
//
//   POST /api/control/{id}/assessments   (assessor)  record a test result; fail → finding
//   GET  /api/control/{id}/assessments   (assessor)  assessment history for a control
//   GET  /api/assessments                (reviewer)  review queue
//   POST /api/assessments/{id}/review    (reviewer)  approve / return
//   POST /api/audits/{id}/close          (admin)     close, guarded by outstanding work
//
// Tenant from JWT (Helpers.TenantSchema); all writes transactional where they
// touch more than one row. Findings/assessments are the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
public static class AssessmentsModule
{
    private const string AsmtCols = @"
        id AS ""Id"", audit_id AS ""AuditId"", audit_control_id AS ""AuditControlId"", method AS ""Method"",
        result AS ""Result"", assessor AS ""Assessor"", comments AS ""Comments"", finding_id AS ""FindingId"",
        tested_at AS ""TestedAt"", review_status AS ""ReviewStatus"", reviewer AS ""Reviewer"",
        review_comments AS ""ReviewComments"", reviewed_at AS ""ReviewedAt""";

    private static readonly string[] OpenFinding = { "open", "in_progress", "in-remediation" };

    public static WebApplication MapAssessmentsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api").WithTags("Assessments");

        // ── Assessor: record an assessment (manual or automated) ───────────────
        g.MapPost("/control/{id}/assessments", async (HttpContext ctx, IDbConnection db, string id, RecordAssessmentRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            var method = (req?.Method ?? "manual").ToLowerInvariant();
            if (method != "manual" && method != "automated")
                return Results.Problem(statusCode: 400, title: "Invalid method", detail: "method must be 'manual' or 'automated'.");
            var result = req?.Result?.ToLowerInvariant();

            db.Open();
            var ac = await db.QuerySingleOrDefaultAsync<AssessControlRow>($@"
                SELECT ac.id AS ""Id"", ac.audit_id AS ""AuditId"", ac.control_ref AS ""ControlRef"",
                       ac.control_title AS ""ControlTitle"", ac.assigned_control_lead AS ""AssignedControlLead"",
                       ac.ready_for_assessment AS ""Ready"",
                       COALESCE(ac.framework_code, a.framework_code) AS ""FrameworkCode"", a.status AS ""AuditStatus""
                FROM {schema}.audit_controls ac
                JOIN {schema}.audits a ON ac.audit_id = a.id
                WHERE ac.id = @Id", new { Id = id });
            if (ac is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit control not found.");
            if (string.Equals(ac.AuditStatus, "closed", StringComparison.OrdinalIgnoreCase))
                return Results.Problem(statusCode: 409, title: "Audit closed", detail: "The audit is closed.");
            if (!ac.Ready)
                return Results.Problem(statusCode: 409, title: "Not ready", detail: "The control is not marked ready for assessment.");

            // Automated with no explicit result → deterministic stub (no integration available).
            if (method == "automated" && string.IsNullOrWhiteSpace(result))
                result = (ac.ControlRef.Sum(c => (int)c) % 4 == 0) ? "fail" : "pass";
            if (result != "pass" && result != "fail" && result != "partial")
                return Results.Problem(statusCode: 400, title: "Invalid result", detail: "result must be 'pass', 'fail' or 'partial'.");

            var assessor = Helpers.UserEmail(ctx);
            var asmtId = Helpers.NewId();
            string? findingId = null;

            using (var tx = db.BeginTransaction())
            {
                try
                {
                    if (result == "fail")
                    {
                        findingId = Helpers.NewId();
                        await db.ExecuteAsync($@"
                            INSERT INTO {schema}.findings
                                (id, control_id, standard, control_ref, title, description, severity, status, source, created_by, audit_id, audit_control_id, created_at)
                            VALUES
                                (@Id, NULL, @Std, @Ref, @Title, @Desc, 'high', 'open', 'assessment', @By, @AuditId, @AcId, NOW())",
                            new
                            {
                                Id = findingId, Std = ac.FrameworkCode, Ref = ac.ControlRef,
                                Title = $"Control {ac.ControlRef} failed assessment — {ac.ControlTitle}",
                                Desc = req?.Comments, By = assessor, AuditId = ac.AuditId, AcId = id
                            }, tx);

                        await db.ExecuteAsync($@"
                            INSERT INTO {schema}.remediations
                                (id, finding_id, title, description, priority, status, assigned_to, assigned_by, due_date, sla_days)
                            VALUES
                                (@Id, @FindingId, @Title, @Description, 'high', 'open', @AssignedTo, @AssignedBy,
                                 CURRENT_DATE + 14, 14)",
                            new
                            {
                                Id = Helpers.NewId(), FindingId = findingId,
                                Title = $"Remediate: Control {ac.ControlRef} failed assessment",
                                Description = req?.Comments,
                                AssignedTo = ac.AssignedControlLead,
                                AssignedBy = assessor
                            }, tx);
                    }

                    await db.ExecuteAsync($@"
                        INSERT INTO {schema}.assessments
                            (id, audit_id, audit_control_id, method, result, assessor, comments, finding_id, tested_at, review_status)
                        VALUES
                            (@Id, @AuditId, @AcId, @Method, @Result, @Assessor, @Comments, @FindingId, NOW(), 'pending')",
                        new
                        {
                            Id = asmtId, AuditId = ac.AuditId, AcId = id, Method = method, Result = result,
                            Assessor = assessor, Comments = req?.Comments, FindingId = findingId
                        }, tx);

                    tx.Commit();
                }
                catch { tx.Rollback(); throw; }
            }

            await Helpers.Log(db, schema, assessor, "assessment", "audit_control", id, new { method, result, findingId });
            var dto = await db.QuerySingleOrDefaultAsync<AssessmentDto>(
                $"SELECT {AsmtCols} FROM {schema}.assessments WHERE id = @Id", new { Id = asmtId });
            return Results.Ok(dto);
        }).RequireAuthorization("assessor");

        // ── Assessor: assessment history for a control ─────────────────────────
        g.MapGet("/control/{id}/assessments", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var rows = await db.QueryAsync<AssessmentDto>(
                $"SELECT {AsmtCols} FROM {schema}.assessments WHERE audit_control_id = @Id ORDER BY tested_at DESC", new { Id = id });
            return Results.Ok(rows);
        }).RequireAuthorization("assessor");

        // ── Reviewer: review queue ─────────────────────────────────────────────
        g.MapGet("/assessments", async (HttpContext ctx, IDbConnection db, string? status) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var where = string.IsNullOrWhiteSpace(status) ? "" : "WHERE s.review_status = @Status";
            var rows = await db.QueryAsync<ReviewItemDto>($@"
                SELECT s.id AS ""Id"", s.audit_id AS ""AuditId"", s.audit_control_id AS ""AuditControlId"",
                       s.method AS ""Method"", s.result AS ""Result"", s.assessor AS ""Assessor"", s.comments AS ""Comments"",
                       s.finding_id AS ""FindingId"", s.tested_at AS ""TestedAt"", s.review_status AS ""ReviewStatus"",
                       s.reviewer AS ""Reviewer"", s.review_comments AS ""ReviewComments"", s.reviewed_at AS ""ReviewedAt"",
                       ac.control_ref AS ""ControlRef"", ac.control_title AS ""ControlTitle"", au.name AS ""AuditName""
                FROM {schema}.assessments s
                JOIN {schema}.audit_controls ac ON s.audit_control_id = ac.id
                JOIN {schema}.audits au ON s.audit_id = au.id
                {where}
                ORDER BY s.tested_at DESC", new { Status = status });
            return Results.Ok(rows);
        }).RequireAuthorization("reviewer");

        // ── Reviewer: approve / return ─────────────────────────────────────────
        g.MapPost("/assessments/{id}/review", async (HttpContext ctx, IDbConnection db, string id, ReviewRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            var decision = req?.Decision?.ToLowerInvariant();
            if (decision != "approved" && decision != "returned")
                return Results.Problem(statusCode: 400, title: "Invalid decision", detail: "decision must be 'approved' or 'returned'.");
            if (decision == "returned" && string.IsNullOrWhiteSpace(req?.Comments))
                return Results.Problem(statusCode: 400, title: "Comment required", detail: "A comment is required when returning an assessment.");

            db.Open();
            var exists = await db.QuerySingleOrDefaultAsync<string>(
                $"SELECT id FROM {schema}.assessments WHERE id = @Id", new { Id = id });
            if (exists is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Assessment not found.");

            var reviewer = Helpers.UserEmail(ctx);
            await db.ExecuteAsync($@"
                UPDATE {schema}.assessments
                SET review_status = @D, reviewer = @R, review_comments = @C, reviewed_at = NOW()
                WHERE id = @Id",
                new { D = decision, R = reviewer, C = req?.Comments, Id = id });

            await Helpers.Log(db, schema, reviewer, "review", "assessment", id, new { decision });
            var dto = await db.QuerySingleOrDefaultAsync<AssessmentDto>(
                $"SELECT {AsmtCols} FROM {schema}.assessments WHERE id = @Id", new { Id = id });
            return Results.Ok(dto);
        }).RequireAuthorization("reviewer");

        // ── Assessor: list Ready-for-Assessment controls (across audits) ───────
        // Powers the Assessor's testing queue. Each row carries its audit name and
        // the latest recorded result so the UI can show re-test state.
        g.MapGet("/controls/ready", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var rows = await db.QueryAsync<ReadyControlDto>($@"
                SELECT ac.id AS ""Id"", ac.audit_id AS ""AuditId"",
                       COALESCE(ac.framework_code, a.framework_code) AS ""FrameworkCode"",
                       ac.source_control_id AS ""SourceControlId"",
                       ac.control_ref AS ""ControlRef"", ac.control_objective AS ""ControlObjective"",
                       ac.control_title AS ""ControlTitle"", ac.requirement_summary AS ""RequirementSummary"",
                       ac.priority AS ""Priority"", ac.theme AS ""Theme"",
                       ac.implementation_status AS ""ImplementationStatus"", ac.assigned_control_lead AS ""AssignedControlLead"",
                       ac.version AS ""Version"", ac.created_at AS ""CreatedAt"", a.name AS ""AuditName"",
                       la.result AS ""LatestResult"", la.method AS ""LatestMethod"", la.tested_at AS ""AssessedAt""
                FROM {schema}.audit_controls ac
                JOIN {schema}.audits a ON ac.audit_id = a.id
                LEFT JOIN LATERAL (
                    SELECT result, method, tested_at FROM {schema}.assessments s
                    WHERE s.audit_control_id = ac.id ORDER BY s.tested_at DESC LIMIT 1
                ) la ON TRUE
                WHERE ac.ready_for_assessment = TRUE
                ORDER BY ac.created_at DESC");
            return Results.Ok(rows);
        }).RequireAuthorization("assessor");

        // ── Admin: audit summaries (dashboard rollup) ──────────────────────────
        g.MapGet("/audits/summary", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var rows = await db.QueryAsync<AuditSummaryDto>($@"
                SELECT a.id AS ""Id"", a.name AS ""Name"", a.framework_code AS ""FrameworkCode"",
                       a.control_lead AS ""ControlLead"", a.status AS ""Status"", a.created_at AS ""CreatedAt"",
                       (SELECT COUNT(*) FROM {schema}.audit_controls ac WHERE ac.audit_id=a.id) AS ""Total"",
                       (SELECT COUNT(*) FROM {schema}.audit_controls ac WHERE ac.audit_id=a.id AND ac.ready_for_assessment) AS ""Ready"",
                       (SELECT COUNT(DISTINCT s.audit_control_id) FROM {schema}.assessments s WHERE s.audit_id=a.id) AS ""Assessed"",
                       (SELECT COUNT(*) FROM (SELECT DISTINCT ON (s.audit_control_id) s.result
                            FROM {schema}.assessments s WHERE s.audit_id=a.id
                            ORDER BY s.audit_control_id, s.tested_at DESC) t WHERE t.result='pass') AS ""Passed"",
                       (SELECT COUNT(*) FROM (SELECT DISTINCT ON (s.audit_control_id) s.result
                            FROM {schema}.assessments s WHERE s.audit_id=a.id
                            ORDER BY s.audit_control_id, s.tested_at DESC) t WHERE t.result='fail') AS ""Failed"",
                       (SELECT COUNT(*) FROM {schema}.assessments s WHERE s.audit_id=a.id AND s.review_status='pending') AS ""PendingReview"",
                       (SELECT COUNT(*) FROM {schema}.findings f WHERE f.audit_id=a.id AND LOWER(f.status)=ANY(@Open)) AS ""OpenFindings""
                FROM {schema}.audits a
                ORDER BY a.created_at DESC", new { Open = OpenFinding });
            return Results.Ok(rows);
        }).RequireAuthorization("admin");

        // ── Admin: single audit detail (controls + findings + blockers) ────────
        g.MapGet("/audits/{id}/detail", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();

            var audit = await db.QuerySingleOrDefaultAsync<AuditDto>($@"
                SELECT id AS ""Id"", name AS ""Name"", description AS ""Description"", department AS ""Department"",
                       business_unit AS ""BusinessUnit"", framework_code AS ""FrameworkCode"",
                       start_date AS ""StartDate"", end_date AS ""EndDate"", control_lead AS ""ControlLead"",
                       status AS ""Status"", created_by AS ""CreatedBy"", created_at AS ""CreatedAt""
                FROM {schema}.audits WHERE id = @Id", new { Id = id });
            if (audit is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit not found.");

            var controls = await db.QueryAsync<AuditControlRowDto>($@"
                SELECT ac.id AS ""Id"", ac.control_ref AS ""ControlRef"", ac.control_title AS ""ControlTitle"",
                       ac.priority AS ""Priority"", ac.implementation_status AS ""ImplementationStatus"",
                       ac.ready_for_assessment AS ""ReadyForAssessment"",
                       la.result AS ""LatestResult"", la.review_status AS ""ReviewStatus""
                FROM {schema}.audit_controls ac
                LEFT JOIN LATERAL (
                    SELECT result, review_status FROM {schema}.assessments s
                    WHERE s.audit_control_id = ac.id ORDER BY s.tested_at DESC LIMIT 1
                ) la ON TRUE
                WHERE ac.audit_id = @Id ORDER BY ac.control_ref", new { Id = id });

            var findings = await db.QueryAsync<FindingDto>($@"
                SELECT id AS ""Id"", audit_control_id AS ""AuditControlId"", audit_id AS ""AuditId"",
                       control_ref AS ""ControlRef"", title AS ""Title"", severity AS ""Severity"",
                       status AS ""Status"", created_by AS ""CreatedBy"", created_at AS ""CreatedAt""
                FROM {schema}.findings WHERE audit_id = @Id ORDER BY created_at DESC", new { Id = id });

            var readyUnassessed = await db.QuerySingleAsync<int>($@"
                SELECT COUNT(*) FROM {schema}.audit_controls ac
                WHERE ac.audit_id = @Id AND ac.ready_for_assessment = TRUE
                  AND NOT EXISTS (SELECT 1 FROM {schema}.assessments s WHERE s.audit_control_id = ac.id)", new { Id = id });
            var pendingReview = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {schema}.assessments WHERE audit_id = @Id AND review_status = 'pending'", new { Id = id });
            var openFindings = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {schema}.findings WHERE audit_id = @Id AND LOWER(status) = ANY(@Open)",
                new { Id = id, Open = OpenFinding });

            var canClose = !string.Equals(audit.Status, "closed", StringComparison.OrdinalIgnoreCase)
                && readyUnassessed == 0 && pendingReview == 0 && openFindings == 0;

            return Results.Ok(new
            {
                audit,
                controls,
                findings,
                blockers = new { readyUnassessed, pendingReview, openFindings },
                canClose
            });
        }).RequireAuthorization("admin");

        // ── Admin: resolve a finding ───────────────────────────────────────────
        g.MapPost("/findings/{id}/resolve", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var exists = await db.QuerySingleOrDefaultAsync<string>(
                $"SELECT id FROM {schema}.findings WHERE id = @Id", new { Id = id });
            if (exists is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Finding not found.");
            await db.ExecuteAsync(
                $"UPDATE {schema}.findings SET status='resolved' WHERE id = @Id", new { Id = id });
            await Helpers.Log(db, schema, Helpers.UserEmail(ctx), "resolve", "finding", id, new { });
            var dto = await db.QuerySingleOrDefaultAsync<FindingDto>($@"
                SELECT id AS ""Id"", audit_control_id AS ""AuditControlId"", audit_id AS ""AuditId"",
                       control_ref AS ""ControlRef"", title AS ""Title"", severity AS ""Severity"",
                       status AS ""Status"", created_by AS ""CreatedBy"", created_at AS ""CreatedAt""
                FROM {schema}.findings WHERE id = @Id", new { Id = id });
            return Results.Ok(dto);
        }).RequireAuthorization("admin");

        // ── Admin: close audit (guarded) ───────────────────────────────────────
        g.MapPost("/audits/{id}/close", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var st = await db.QuerySingleOrDefaultAsync<string>(
                $"SELECT status FROM {schema}.audits WHERE id = @Id", new { Id = id });
            if (st is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit not found.");
            if (string.Equals(st, "closed", StringComparison.OrdinalIgnoreCase))
                return Results.Problem(statusCode: 409, title: "Already closed", detail: "The audit is already closed.");

            var readyUnassessed = await db.QuerySingleAsync<int>($@"
                SELECT COUNT(*) FROM {schema}.audit_controls ac
                WHERE ac.audit_id = @Id AND ac.ready_for_assessment = TRUE
                  AND NOT EXISTS (SELECT 1 FROM {schema}.assessments s WHERE s.audit_control_id = ac.id)", new { Id = id });
            var pendingReview = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {schema}.assessments WHERE audit_id = @Id AND review_status = 'pending'", new { Id = id });
            var openFindings = await db.QuerySingleAsync<int>(
                $"SELECT COUNT(*) FROM {schema}.findings WHERE audit_id = @Id AND LOWER(status) = ANY(@Open)",
                new { Id = id, Open = OpenFinding });

            if (readyUnassessed > 0 || pendingReview > 0 || openFindings > 0)
                return Results.Problem(statusCode: 409, title: "Cannot close audit",
                    detail: $"Outstanding: {readyUnassessed} unassessed control(s), {pendingReview} pending review, {openFindings} open finding(s).");

            await db.ExecuteAsync(
                $"UPDATE {schema}.audits SET status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE id = @Id", new { Id = id });
            await Helpers.Log(db, schema, Helpers.UserEmail(ctx), "close", "audit", id, new { });
            return Results.Ok(new { id, status = "closed" });
        }).RequireAuthorization("admin");

        return app;
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
public record RecordAssessmentRequest(string? Method, string? Result, string? Comments);
public record ReviewRequest(string? Decision, string? Comments);

public record AssessmentDto(
    string Id, string AuditId, string AuditControlId, string Method, string? Result, string? Assessor,
    string? Comments, string? FindingId, DateTime TestedAt, string ReviewStatus, string? Reviewer,
    string? ReviewComments, DateTime? ReviewedAt);

public record ReviewItemDto(
    string Id, string AuditId, string AuditControlId, string Method, string? Result, string? Assessor,
    string? Comments, string? FindingId, DateTime TestedAt, string ReviewStatus, string? Reviewer,
    string? ReviewComments, DateTime? ReviewedAt, string ControlRef, string ControlTitle, string AuditName);

public record AssessControlRow(
    string Id, string AuditId, string ControlRef, string ControlTitle, string? AssignedControlLead,
    bool Ready, string FrameworkCode, string AuditStatus);

public record ReadyControlDto(
    string Id,
    string AuditId,
    string? FrameworkCode,
    string? SourceControlId,
    string ControlRef,
    string? ControlObjective,
    string ControlTitle,
    string? RequirementSummary,
    string? Priority,
    string? Theme,
    string ImplementationStatus,
    string? AssignedControlLead,
    int Version,
    DateTime CreatedAt,
    string AuditName,
    string? LatestResult,
    string? LatestMethod,
    DateTime? AssessedAt);

public record FindingDto(
    string Id, string? AuditControlId, string? AuditId, string ControlRef, string Title,
    string? Severity, string Status, string? CreatedBy, DateTime CreatedAt);

public record AuditSummaryDto(
    string Id, string Name, string? FrameworkCode, string? ControlLead, string Status, DateTime CreatedAt,
    long Total, long Ready, long Assessed, long Passed, long Failed, long PendingReview, long OpenFindings);

public record AuditControlRowDto(
    string Id, string ControlRef, string ControlTitle, string? Priority, string ImplementationStatus,
    bool ReadyForAssessment, string? LatestResult, string? ReviewStatus);
