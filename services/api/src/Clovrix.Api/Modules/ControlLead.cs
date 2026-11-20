using System.Data;
using Dapper;

namespace Clovrix.Api.Modules;

// ─────────────────────────────────────────────────────────────────────────────
// Control Lead module — the Control Lead's view of their assigned audit controls.
//
//   GET  /api/assigned-controls
//   GET  /api/control/{id}
//   PUT  /api/control/{id}/summary | policy | evidence | notes | status
//   POST /api/control/{id}/ready-for-assessment
//   GET  /api/control/{id}/version-history
//
// Rules (enforced server-side):
//   • Tenant is derived strictly from the JWT (Helpers.TenantSchema).
//   • A Control Lead can only read/edit controls assigned to their own email.
//   • Controls that are already ready-for-assessment are locked (409).
//   • Controls belonging to a closed audit cannot be edited (409).
//   • Every write is transactional and records an audit_control_versions row.
//
// Status vocabulary matches the applied migration + the frontend:
//   implementation_status ∈ (Not Started, In Progress, Completed)
//   plus a ready_for_assessment boolean (the hand-off gate to the Assessor).
// The spec's "Assigned → InProgress → ReadyForAssessment" maps onto these:
//   Assigned ≡ 'Not Started', InProgress ≡ 'In Progress', ReadyForAssessment ≡ ready=true.
// ─────────────────────────────────────────────────────────────────────────────
public static class ControlLeadModule
{
    private const string ControlCols = @"
        id AS ""Id"", audit_id AS ""AuditId"", control_ref AS ""ControlRef"",
        control_objective AS ""ControlObjective"", control_title AS ""ControlTitle"",
        requirement_summary AS ""RequirementSummary"", priority AS ""Priority"", theme AS ""Theme"",
        implementation_status AS ""ImplementationStatus"", assigned_control_lead AS ""AssignedControlLead"",
        policy_name AS ""PolicyName"", policy_description AS ""PolicyDescription"",
        evidence_required AS ""EvidenceRequired"", implementation_notes AS ""ImplementationNotes"",
        ready_for_assessment AS ""ReadyForAssessment"", version AS ""Version"",
        created_at AS ""CreatedAt"", last_saved_at AS ""LastSavedAt""";

    public static WebApplication MapControlLeadModule(this WebApplication app)
    {
        // The whole group requires the control_lead policy (Compliance Admin / super_admin
        // also satisfy it). Tenant + ownership are enforced per request.
        var g = app.MapGroup("/api").WithTags("Control Lead").RequireAuthorization("control_lead");

        // ── GET /api/assigned-controls — controls assigned to the caller ───────
        g.MapGet("/assigned-controls", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var rows = await db.QueryAsync<AssignedControlDto>(
                $@"SELECT {ControlCols} FROM {schema}.audit_controls
                   WHERE LOWER(assigned_control_lead) = LOWER(@Me) ORDER BY created_at DESC",
                new { Me = Helpers.UserEmail(ctx) });
            return Results.Ok(rows);
        });

        // ── GET /api/control/{id} ──────────────────────────────────────────────
        g.MapGet("/control/{id}", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();
            var control = await LoadControl(db, schema, id);
            if (control is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit control not found.");
            if (!Owns(control.AssignedControlLead, Helpers.UserEmail(ctx)))
                return Results.Problem(statusCode: 403, title: "Forbidden", detail: "This control is assigned to another user.");
            return Results.Ok(control);
        });

        // ── PUT single-field updates ───────────────────────────────────────────
        g.MapPut("/control/{id}/summary", async (HttpContext ctx, IDbConnection db, string id, UpdateSummaryRequest req) =>
        {
            if (req is null || string.IsNullOrWhiteSpace(req.Summary))
                return Results.Problem(statusCode: 400, title: "Invalid request", detail: "summary is required.");
            return await UpdateField(ctx, db, id, "requirement_summary", "Requirement Summary", req.Summary, r => r.RequirementSummary);
        });

        g.MapPut("/control/{id}/evidence", async (HttpContext ctx, IDbConnection db, string id, UpdateEvidenceRequest req) =>
        {
            if (req is null || req.Evidence is null)
                return Results.Problem(statusCode: 400, title: "Invalid request", detail: "evidence is required.");
            return await UpdateField(ctx, db, id, "evidence_required", "Evidence Required", req.Evidence, r => r.EvidenceRequired);
        });

        g.MapPut("/control/{id}/notes", async (HttpContext ctx, IDbConnection db, string id, UpdateNotesRequest req) =>
        {
            if (req is null || req.Notes is null)
                return Results.Problem(statusCode: 400, title: "Invalid request", detail: "notes is required.");
            return await UpdateField(ctx, db, id, "implementation_notes", "Implementation Notes", req.Notes, r => r.ImplementationNotes);
        });

        // ── PUT status (state machine) ─────────────────────────────────────────
        g.MapPut("/control/{id}/status", async (HttpContext ctx, IDbConnection db, string id, UpdateStatusRequest req) =>
        {
            var status = req?.Status?.Trim();
            var allowed = new[] { "Not Started", "In Progress", "Completed" };
            if (string.IsNullOrWhiteSpace(status) || !allowed.Contains(status))
                return Results.Problem(statusCode: 400, title: "Invalid status",
                    detail: "status must be one of: Not Started, In Progress, Completed.");

            return await UpdateField(ctx, db, id, "implementation_status", "Status", status,
                r => r.ImplementationStatus,
                extraGuard: r => IsLegalStatusTransition(r.ImplementationStatus, status!)
                    ? null
                    : Results.Problem(statusCode: 409, title: "Illegal transition",
                        detail: $"Cannot move status from '{r.ImplementationStatus}' to '{status}'."));
        });

        // ── PUT policy (name + description; a version row per changed field) ────
        g.MapPut("/control/{id}/policy", async (HttpContext ctx, IDbConnection db, string id, UpdatePolicyRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            var me = Helpers.UserEmail(ctx);
            db.Open();

            var row = await LoadGuard(db, schema, id);
            var guard = GuardEditable(row, me);
            if (guard is not null) return guard;

            var name = req?.PolicyName ?? "";
            var desc = req?.PolicyDescription ?? "";
            var v = row!.Version;

            using (var tx = db.BeginTransaction())
            {
                try
                {
                    if (!string.Equals(row.PolicyName ?? "", name, StringComparison.Ordinal))
                    {
                        v++;
                        await db.ExecuteAsync(
                            $"UPDATE {schema}.audit_controls SET policy_name=@Val, version=@V, last_saved_at=NOW(), updated_at=NOW() WHERE id=@Id",
                            new { Val = name, V = v, Id = id }, tx);
                        await InsertVersion(db, schema, tx, id, v, "Policy Name", row.PolicyName, name, me);
                    }
                    if (!string.Equals(row.PolicyDescription ?? "", desc, StringComparison.Ordinal))
                    {
                        v++;
                        await db.ExecuteAsync(
                            $"UPDATE {schema}.audit_controls SET policy_description=@Val, version=@V, last_saved_at=NOW(), updated_at=NOW() WHERE id=@Id",
                            new { Val = desc, V = v, Id = id }, tx);
                        await InsertVersion(db, schema, tx, id, v, "Policy Description", row.PolicyDescription, desc, me);
                    }
                    tx.Commit();
                }
                catch { tx.Rollback(); throw; }
            }

            await Helpers.Log(db, schema, me, "update", "audit_control", id, new { field = "Policy" });
            return Results.Ok(await LoadControl(db, schema, id));
        });

        // ── POST ready-for-assessment (InProgress → ReadyForAssessment) ────────
        g.MapPost("/control/{id}/ready-for-assessment", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            var me = Helpers.UserEmail(ctx);
            db.Open();

            var row = await LoadGuard(db, schema, id);
            if (row is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit control not found.");
            if (!Owns(row.Lead, me))
                return Results.Problem(statusCode: 403, title: "Forbidden", detail: "This control is assigned to another user.");
            if (string.Equals(row.AuditStatus, "closed", StringComparison.OrdinalIgnoreCase))
                return Results.Problem(statusCode: 409, title: "Audit closed", detail: "The audit is closed.");
            if (row.Ready)
                return Results.Problem(statusCode: 409, title: "Already ready", detail: "The control is already ready for assessment.");
            if (string.Equals(row.ImplementationStatus, "Not Started", StringComparison.OrdinalIgnoreCase))
                return Results.Problem(statusCode: 409, title: "Illegal transition",
                    detail: "The control must be In Progress or Completed before it can be marked ready for assessment.");

            var v = row.Version + 1;
            using (var tx = db.BeginTransaction())
            {
                try
                {
                    await db.ExecuteAsync(
                        $"UPDATE {schema}.audit_controls SET ready_for_assessment=TRUE, version=@V, last_saved_at=NOW(), updated_at=NOW() WHERE id=@Id",
                        new { V = v, Id = id }, tx);
                    await InsertVersion(db, schema, tx, id, v, "Ready for Assessment", "No", "Yes", me);
                    tx.Commit();
                }
                catch { tx.Rollback(); throw; }
            }

            await Helpers.Log(db, schema, me, "ready-for-assessment", "audit_control", id, new { });
            return Results.Ok(await LoadControl(db, schema, id));
        });

        // ── GET version-history ────────────────────────────────────────────────
        g.MapGet("/control/{id}/version-history", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();
            db.Open();

            var row = await LoadGuard(db, schema, id);
            if (row is null)
                return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit control not found.");
            if (!Owns(row.Lead, Helpers.UserEmail(ctx)))
                return Results.Problem(statusCode: 403, title: "Forbidden", detail: "This control is assigned to another user.");

            var versions = await db.QueryAsync<ControlVersionDto>(
                $@"SELECT version AS ""Version"", field AS ""ChangedField"", modified_by AS ""ModifiedBy"",
                          modified_at AS ""ModifiedDate"", previous_value AS ""OldValue"", updated_value AS ""NewValue""
                   FROM {schema}.audit_control_versions
                   WHERE audit_control_id = @Id ORDER BY version DESC",
                new { Id = id });
            return Results.Ok(versions);
        });

        return app;
    }

    // ── Shared transactional field-update path ─────────────────────────────────
    private static async Task<IResult> UpdateField(
        HttpContext ctx, IDbConnection db, string id,
        string column, string field, string? newValue,
        Func<ControlGuardRow, string?> getOld,
        Func<ControlGuardRow, IResult?>? extraGuard = null)
    {
        var schema = Helpers.TenantSchema(ctx);
        if (schema is null) return Results.Unauthorized();
        var me = Helpers.UserEmail(ctx);

        db.Open();
        var row = await LoadGuard(db, schema, id);
        var guard = GuardEditable(row, me);
        if (guard is not null) return guard;
        if (extraGuard is not null)
        {
            var extra = extraGuard(row!);
            if (extra is not null) return extra;
        }

        var oldValue = getOld(row!);
        var newVersion = row!.Version + 1;

        using (var tx = db.BeginTransaction())
        {
            try
            {
                await db.ExecuteAsync(
                    $"UPDATE {schema}.audit_controls SET {column} = @Val, version = @V, last_saved_at = NOW(), updated_at = NOW() WHERE id = @Id",
                    new { Val = newValue, V = newVersion, Id = id }, tx);
                await InsertVersion(db, schema, tx, id, newVersion, field, oldValue, newValue, me);
                tx.Commit();
            }
            catch { tx.Rollback(); throw; }
        }

        await Helpers.Log(db, schema, me, "update", "audit_control", id, new { field });
        return Results.Ok(await LoadControl(db, schema, id));
    }

    // ── Guards & helpers ───────────────────────────────────────────────────────
    private static IResult? GuardEditable(ControlGuardRow? row, string me)
    {
        if (row is null)
            return Results.Problem(statusCode: 404, title: "Not found", detail: "Audit control not found.");
        if (!Owns(row.Lead, me))
            return Results.Problem(statusCode: 403, title: "Forbidden", detail: "This control is assigned to another user.");
        if (string.Equals(row.AuditStatus, "closed", StringComparison.OrdinalIgnoreCase))
            return Results.Problem(statusCode: 409, title: "Audit closed", detail: "The audit is closed and its controls cannot be edited.");
        if (row.Ready)
            return Results.Problem(statusCode: 409, title: "Locked", detail: "The control is ready for assessment and can no longer be edited.");
        return null;
    }

    private static bool Owns(string? assignedLead, string me) =>
        !string.IsNullOrEmpty(assignedLead) && string.Equals(assignedLead, me, StringComparison.OrdinalIgnoreCase);

    private static bool IsLegalStatusTransition(string from, string to)
    {
        if (string.Equals(from, to, StringComparison.OrdinalIgnoreCase)) return true; // no-op
        return (from, to) switch
        {
            ("Not Started", "In Progress") => true,
            ("In Progress", "Completed")   => true,
            ("In Progress", "Not Started") => true, // allow returning to revise
            ("Completed", "In Progress")   => true, // allow reopening
            _ => false
        };
    }

    private static Task<ControlGuardRow?> LoadGuard(IDbConnection db, string schema, string id) =>
        db.QuerySingleOrDefaultAsync<ControlGuardRow>($@"
            SELECT ac.id AS ""Id"", ac.assigned_control_lead AS ""Lead"", ac.ready_for_assessment AS ""Ready"",
                   ac.version AS ""Version"", ac.implementation_status AS ""ImplementationStatus"",
                   a.status AS ""AuditStatus"", ac.requirement_summary AS ""RequirementSummary"",
                   ac.policy_name AS ""PolicyName"", ac.policy_description AS ""PolicyDescription"",
                   ac.evidence_required AS ""EvidenceRequired"", ac.implementation_notes AS ""ImplementationNotes""
            FROM {schema}.audit_controls ac
            JOIN {schema}.audits a ON ac.audit_id = a.id
            WHERE ac.id = @Id", new { Id = id });

    private static Task<AssignedControlDto?> LoadControl(IDbConnection db, string schema, string id) =>
        db.QuerySingleOrDefaultAsync<AssignedControlDto>(
            $"SELECT {ControlCols} FROM {schema}.audit_controls WHERE id = @Id", new { Id = id });

    private static Task InsertVersion(IDbConnection db, string schema, IDbTransaction tx,
        string acId, int version, string field, string? oldVal, string? newVal, string by) =>
        db.ExecuteAsync($@"
            INSERT INTO {schema}.audit_control_versions
                (id, audit_control_id, version, field, modified_by, modified_at, previous_value, updated_value)
            VALUES (@Id, @AcId, @V, @Field, @By, NOW(), @Old, @New)",
            new { Id = Helpers.NewId(), AcId = acId, V = version, Field = field, By = by, Old = oldVal ?? "—", New = newVal ?? "—" }, tx);
}

// ── DTOs (shapes match the frontend controlLeadApi) ───────────────────────────
public record AssignedControlDto(
    string Id, string AuditId, string ControlRef, string? ControlObjective, string ControlTitle,
    string? RequirementSummary, string? Priority, string? Theme, string ImplementationStatus,
    string? AssignedControlLead, string? PolicyName, string? PolicyDescription, string? EvidenceRequired,
    string? ImplementationNotes, bool ReadyForAssessment, int Version, DateTime CreatedAt, DateTime? LastSavedAt);

public record ControlGuardRow(
    string Id, string? Lead, bool Ready, int Version, string ImplementationStatus, string AuditStatus,
    string? RequirementSummary, string? PolicyName, string? PolicyDescription,
    string? EvidenceRequired, string? ImplementationNotes);

public record ControlVersionDto(
    int Version, string ChangedField, string? ModifiedBy, DateTime ModifiedDate, string? OldValue, string? NewValue);

public record UpdateSummaryRequest(string Summary);
public record UpdatePolicyRequest(string? PolicyName, string? PolicyDescription);
public record UpdateEvidenceRequest(string Evidence);
public record UpdateNotesRequest(string Notes);
public record UpdateStatusRequest(string Status);
