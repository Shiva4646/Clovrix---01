using System.Data;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace Clovrix.Api.Modules;

// ─────────────────────────────────────────────────────────────────────────────
// Accessors module — assignment of 5 roles to audit controls and tasks.
//
// Five Accessor Roles:
//   1. control_lead      - Enriches controls, marks ready
//   2. assessor          - Tests controls, records results
//   3. reviewer          - Approves/returns assessments
//   4. auditor           - Audits workflows, generates reports
//   5. remediation_owner - Manages findings remediation
//
// Each control can have multiple accessors in different roles.
// Enforced server-side per tenant and control ownership.
// ─────────────────────────────────────────────────────────────────────────────
public static class AccessorsModule
{
    private static readonly string[] ValidRoles = { "control_lead", "assessor", "reviewer", "auditor", "remediation_owner" };

    public static WebApplication MapAccessorsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api").WithTags("Accessors").RequireAuthorization();

        // ── GET /api/accessors — list users by accessor role ───────────────────
        // Returns all users who can fulfill a specific accessor role
        g.MapGet("/accessors", async (HttpContext ctx, IDbConnection db, string? role) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            if (!string.IsNullOrWhiteSpace(role) && !ValidRoles.Contains(role))
                return Results.BadRequest(new { error = "Invalid role" });

            db.Open();

            // Get users from tenant (from audit_controls assigned_control_lead or from assessments.assessor)
            var query = $@"
                SELECT DISTINCT accessor_email AS ""Email""
                FROM {schema}.control_accessors
                WHERE 1=1";

            if (!string.IsNullOrWhiteSpace(role))
                query += " AND accessor_role = @Role";

            query += " ORDER BY accessor_email";

            var rows = await db.QueryAsync<UserDto>(query, new { Role = role });
            return Results.Ok(rows);
        });

        // ── POST /api/control/{id}/assign-accessor — assign user to control ────
        g.MapPost("/control/{id}/assign-accessor", async (HttpContext ctx, IDbConnection db, string id, AssignAccessorRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            if (string.IsNullOrWhiteSpace(req.AccessorEmail))
                return Results.BadRequest(new { error = "accessorEmail is required" });
            if (string.IsNullOrWhiteSpace(req.Role) || !ValidRoles.Contains(req.Role))
                return Results.BadRequest(new { error = $"role must be one of: {string.Join(", ", ValidRoles)}" });

            db.Open();

            // Verify control exists and get its department
            var control = await db.QuerySingleOrDefaultAsync<ControlInfoDto>($@"
                SELECT id, business_department FROM {schema}.audit_controls WHERE id = @Id",
                new { Id = id });
            if (control is null)
                return Results.NotFound(new { error = "audit control not found" });

            var assignedBy = Helpers.UserEmail(ctx);
            var department = req.Department ?? control.BusinessDepartment ?? "General";

            try
            {
                await db.ExecuteAsync($@"
                    INSERT INTO {schema}.control_accessors
                        (id, audit_control_id, accessor_email, accessor_role, business_department, assigned_by, assigned_at)
                    VALUES
                        (@Id, @ControlId, @Email, @Role, @Dept, @By, NOW())
                    ON CONFLICT (audit_control_id, accessor_email, accessor_role, business_department)
                    DO UPDATE SET assigned_by = @By, assigned_at = NOW()",
                    new { Id = Helpers.NewId(), ControlId = id, Email = req.AccessorEmail, Role = req.Role, Dept = department, By = assignedBy });

                await Helpers.Log(db, schema, assignedBy, "assign-accessor", "audit_control", id,
                    new { email = req.AccessorEmail, role = req.Role, department = department });

                return Results.Ok(new { controlId = id, email = req.AccessorEmail, role = req.Role, department = department });
            }
            catch (Exception ex)
            {
                return Results.Problem(statusCode: 409, title: "Conflict", detail: ex.Message);
            }
        });

        // ── DELETE /api/control/{id}/remove-accessor — remove accessor ────────
        g.MapDelete("/control/{id}/remove-accessor", async (HttpContext ctx, IDbConnection db, string id, [FromBody] RemoveAccessorRequest req) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            if (string.IsNullOrWhiteSpace(req.AccessorEmail))
                return Results.BadRequest(new { error = "accessorEmail is required" });
            if (string.IsNullOrWhiteSpace(req.Role) || !ValidRoles.Contains(req.Role))
                return Results.BadRequest(new { error = $"role must be one of: {string.Join(", ", ValidRoles)}" });

            db.Open();

            var department = req.Department ?? "General";
            var deleted = await db.ExecuteAsync($@"
                DELETE FROM {schema}.control_accessors
                WHERE audit_control_id = @ControlId AND accessor_email = @Email AND accessor_role = @Role AND business_department = @Dept",
                new { ControlId = id, Email = req.AccessorEmail, Role = req.Role, Dept = department });

            if (deleted == 0)
                return Results.NotFound(new { error = "accessor assignment not found" });

            var removedBy = Helpers.UserEmail(ctx);
            await Helpers.Log(db, schema, removedBy, "remove-accessor", "audit_control", id,
                new { email = req.AccessorEmail, role = req.Role, department = department });

            return Results.Ok(new { deleted, controlId = id });
        });

        // ── GET /api/control/{id}/accessors — list accessors for a control ────
        g.MapGet("/control/{id}/accessors", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var accessors = await db.QueryAsync<ControlAccessorDeptDto>($@"
                SELECT
                    id AS ""Id"", audit_control_id AS ""ControlId"", accessor_email AS ""Email"",
                    accessor_role AS ""Role"", business_department AS ""Department"",
                    assigned_by AS ""AssignedBy"", assigned_at AS ""AssignedAt""
                FROM {schema}.control_accessors
                WHERE audit_control_id = @ControlId
                ORDER BY business_department, accessor_role, accessor_email",
                new { ControlId = id });

            return Results.Ok(accessors);
        });

        // ── GET /api/control/{id}/accessor-summary — summary of all accessors ──
        g.MapGet("/control/{id}/accessor-summary", async (HttpContext ctx, IDbConnection db, string id) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var summary = await db.QueryAsync<AccessorSummaryDto>($@"
                SELECT
                    accessor_role AS ""Role"",
                    COUNT(*) AS ""Count"",
                    STRING_AGG(accessor_email, ', ') AS ""Accessors""
                FROM {schema}.control_accessors
                WHERE audit_control_id = @ControlId
                GROUP BY accessor_role
                ORDER BY accessor_role",
                new { ControlId = id });

            return Results.Ok(summary);
        });

        // ── GET /api/accessor-assignments — all assignments for a user ────────
        g.MapGet("/accessor-assignments", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            var email = Helpers.UserEmail(ctx);
            db.Open();

            var assignments = await db.QueryAsync<UserAssignmentDeptDto>($@"
                SELECT
                    ca.id AS ""Id"", ca.audit_control_id AS ""ControlId"",
                    ca.accessor_role AS ""Role"", ca.business_department AS ""Department"",
                    ac.control_ref AS ""ControlRef"", ac.control_title AS ""ControlTitle"",
                    ac.implementation_status AS ""Status"",
                    a.id AS ""AuditId"", a.name AS ""AuditName"", a.status AS ""AuditStatus""
                FROM {schema}.control_accessors ca
                JOIN {schema}.audit_controls ac ON ca.audit_control_id = ac.id
                JOIN {schema}.audits a ON ac.audit_id = a.id
                WHERE LOWER(ca.accessor_email) = LOWER(@Email)
                ORDER BY a.created_at DESC, ca.business_department, ca.accessor_role",
                new { Email = email });

            return Results.Ok(assignments);
        });

        // ── GET /api/departments — list all business departments ──────────────
        g.MapGet("/departments", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var departments = await db.QueryAsync<BusinessDepartmentDto>($@"
                SELECT
                    id AS ""Id"", department_name AS ""Name"", description AS ""Description"",
                    icon_name AS ""IconName"", color_hex AS ""ColorHex"", created_at AS ""CreatedAt""
                FROM {schema}.business_departments
                ORDER BY department_name",
                new { });

            return Results.Ok(departments);
        });

        // ── GET /api/user/accessible-controls — user's department-filtered controls ──
        g.MapGet("/user/accessible-controls", async (HttpContext ctx, IDbConnection db) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            var email = Helpers.UserEmail(ctx);
            db.Open();

            var controls = await db.QueryAsync<UserAccessibleControlDto>($@"
                SELECT DISTINCT
                    ac.id AS ""Id"", ac.audit_id AS ""AuditId"", ac.control_ref AS ""ControlRef"",
                    ac.control_title AS ""ControlTitle"", ac.control_statement AS ""ControlStatement"",
                    ac.implementation_status AS ""Status"", ac.business_department AS ""Department"",
                    ca.accessor_role AS ""AccessorRole"",
                    a.name AS ""AuditName"", a.status AS ""AuditStatus""
                FROM {schema}.control_accessors ca
                JOIN {schema}.audit_controls ac ON ca.audit_control_id = ac.id
                    AND (ac.business_department = ca.business_department OR ca.business_department = 'General' OR ac.business_department = 'General')
                JOIN {schema}.audits a ON ac.audit_id = a.id
                WHERE LOWER(ca.accessor_email) = LOWER(@Email)
                ORDER BY a.created_at DESC, ac.business_department, ac.control_ref",
                new { Email = email });

            return Results.Ok(controls);
        });

        // ── GET /api/department-access-matrix — summary by email and role ──────
        g.MapGet("/department-access-matrix", async (HttpContext ctx, IDbConnection db, string? email = null) =>
        {
            var schema = Helpers.TenantSchema(ctx);
            if (schema is null) return Results.Unauthorized();

            db.Open();

            var query = $@"
                SELECT
                    accessor_email AS ""Email"", accessor_role AS ""Role"",
                    business_department AS ""Department"", COUNT(*) AS ""ControlCount""
                FROM {schema}.control_accessors
                WHERE 1=1";

            if (!string.IsNullOrWhiteSpace(email))
                query += " AND LOWER(accessor_email) = LOWER(@Email)";

            query += " GROUP BY accessor_email, accessor_role, business_department ORDER BY accessor_email, business_department";

            var rows = await db.QueryAsync<DepartmentAccessMatrixDto>(query, new { Email = email });
            return Results.Ok(rows);
        });

        return app;
    }
}

// ── DTOs ───────────────────────────────────────────────────────────────────────
public record AssignAccessorRequest(string AccessorEmail, string Role, string? Department = null);
public record RemoveAccessorRequest(string AccessorEmail, string Role, string? Department = null);

public record UserDto(string Email);

public record ControlAccessorDto(
    string Id, string ControlId, string Email, string Role,
    string? AssignedBy, DateTime AssignedAt);

public record ControlAccessorDeptDto(
    string Id, string ControlId, string Email, string Role, string Department,
    string? AssignedBy, DateTime AssignedAt);

public record ControlInfoDto(string Id, string? BusinessDepartment);

public record AccessorSummaryDto(
    string Role, int Count, string Accessors);

public record UserAssignmentDto(
    string Id, string ControlId, string Role, string ControlRef,
    string ControlTitle, string Status, string AuditId,
    string AuditName, string AuditStatus);

public record UserAssignmentDeptDto(
    string Id, string ControlId, string Role, string Department, string ControlRef,
    string ControlTitle, string Status, string AuditId,
    string AuditName, string AuditStatus);

public record BusinessDepartmentDto(
    string Id, string Name, string? Description, string? IconName,
    string? ColorHex, DateTime CreatedAt);

public record UserAccessibleControlDto(
    string Id, string AuditId, string ControlRef, string ControlTitle,
    string? ControlStatement, string Status, string Department,
    string AccessorRole, string AuditName, string AuditStatus);

public record DepartmentAccessMatrixDto(
    string Email, string Role, string Department, int ControlCount);
