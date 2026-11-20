using System.Data;
using Dapper;
using MassTransit;
using Clovrix.Api.Messages;

namespace Clovrix.Api.Modules;

// ══════════════════════════════════════════════════════════════════════════════
// PERSONNEL & ACCESS REVIEWS
// ══════════════════════════════════════════════════════════════════════════════
public static class PersonnelModule
{
    public static WebApplication MapPersonnelModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/personnel").WithTags("Personnel");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db,
            string? status = null, string? role = null, int page = 1, int size = 50) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var f = new List<string>();
            if (status != null) f.Add("employment_status=@Status");
            if (role   != null) f.Add("role=@Role");
            var where = f.Any() ? "WHERE " + string.Join(" AND ", f) : "";
            var (offset, sz) = Pagination.Parse(page, size);
            var items = await db.QueryAsync($@"
                SELECT p.*,
                    (SELECT COUNT(*) FROM {sc}.training t WHERE t.personnel_id=p.id AND t.status='overdue') overdue_training,
                    (SELECT COUNT(*) FROM {sc}.access_reviews ar WHERE ar.personnel_id=p.id AND ar.status='pending') pending_reviews
                FROM {sc}.personnel p {where} ORDER BY p.full_name LIMIT @Sz OFFSET @Off",
                new { Status = status, Role = role, Sz = sz, Off = offset });
            var total = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.personnel {where}",
                new { Status = status, Role = role });
            return Results.Ok(Pagination.Of(items, total, page, sz));
        });

        g.MapGet("/stats", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            return Results.Ok(new
            {
                total_active       = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.personnel WHERE employment_status='active'"),
                total_contractors  = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.personnel WHERE role='contractor' AND employment_status='active'"),
                mfa_pct            = await db.QuerySingleAsync<int>($"SELECT COALESCE(ROUND(100.0*SUM(CASE WHEN mfa_enabled THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)),0) FROM {sc}.personnel WHERE employment_status='active'"),
                training_pct       = await db.QuerySingleAsync<int>($"SELECT COALESCE(ROUND(100.0*SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)),0) FROM {sc}.training"),
                overdue_training   = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.training WHERE status='overdue'"),
                pending_reviews    = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.access_reviews WHERE status='pending'"),
                bg_check_pending   = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.personnel WHERE background_check_status='pending' AND employment_status='active'")
            });
        });

        g.MapGet("/{id}/training", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var rows = await db.QueryAsync($"SELECT * FROM {sc}.training WHERE personnel_id=@Id ORDER BY due_date", new { Id = id });
            return Results.Ok(rows);
        });

        g.MapGet("/training/overdue", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var rows = await db.QueryAsync($@"
                SELECT p.full_name, p.email, p.department, t.course_name, t.course_type, t.due_date
                FROM {sc}.training t JOIN {sc}.personnel p ON t.personnel_id=p.id
                WHERE t.status='overdue' ORDER BY t.due_date");
            return Results.Ok(rows);
        });

        // Access Reviews
        g.MapGet("/access-reviews", async (HttpContext ctx, IDbConnection db, string? status = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var where = status != null ? "WHERE ar.status=@Status" : "";
            var rows = await db.QueryAsync($@"
                SELECT ar.*, p.full_name, p.email, p.department
                FROM {sc}.access_reviews ar JOIN {sc}.personnel p ON ar.personnel_id=p.id
                {where} ORDER BY ar.due_date NULLS LAST", new { Status = status });
            return Results.Ok(rows);
        });

        g.MapPut("/access-reviews/{id}", async (string id, AccessReviewReq req, HttpContext ctx, IDbConnection db, IBus bus) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.access_reviews SET
                    status=@Status, reviewer_email=@Reviewer, notes=@Notes,
                    completed_at=CASE WHEN @Status NOT IN ('pending') THEN NOW() ELSE NULL END
                WHERE id=@Id",
                new { Id = id, req.Status, Reviewer = email, req.Notes });

            if (req.Status == "revoked")
            {
                var rev = await db.QueryFirstOrDefaultAsync($"SELECT ar.*, p.email as person_email FROM {sc}.access_reviews ar JOIN {sc}.personnel p ON ar.personnel_id=p.id WHERE ar.id=@Id", new { Id = id });
                if (rev != null)
                    await bus.Publish(new SendNotificationEvent((string)rev.person_email,
                        "[Clovrix] Access Revoked — Action Required",
                        $"<p>Your access to <strong>{rev.system_name}</strong> has been revoked as part of an access review. Please contact IT if you believe this is an error.</p>",
                        "access_revoked"));
            }
            return Results.Ok(new { message = "Review updated" });
        });

        g.MapPost("/", async (CreatePersonnelReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx);
            var id = Helpers.NewId(); db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.personnel(id,email,full_name,department,title,role,employment_status,start_date,manager_email)
                VALUES(@Id,@Email,@Name,@Dept,@Title,@Role,'active',@Start,@Manager)",
                new { Id = id, req.Email, Name = req.FullName, Dept = req.Department,
                      req.Title, Role = req.Role ?? "employee", req.StartDate, req.ManagerEmail });
            // Auto-assign security awareness training
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.training(id,personnel_id,course_name,course_type,status,due_date)
                VALUES(gen_random_uuid()::VARCHAR,@PersonId,'Annual Security Awareness','security','assigned',@Due)",
                new { PersonId = id, Due = DateTime.UtcNow.AddDays(30) });
            return Results.Created($"/api/personnel/{id}", new { id });
        });

        return app;
    }

    record AccessReviewReq(string Status, string? Notes);
    record CreatePersonnelReq(string Email, string FullName, string? Department, string? Title,
        string? Role, DateTime? StartDate, string? ManagerEmail);
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR RISK MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
public static class VendorsModule
{
    public static WebApplication MapVendorsModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/vendors").WithTags("Vendor Risk");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db,
            string? status = null, string? criticality = null) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var f = new List<string>();
            if (status      != null) f.Add("status=@Status");
            if (criticality != null) f.Add("criticality=@Criticality");
            var where = f.Any() ? "WHERE " + string.Join(" AND ", f) : "";
            var rows = await db.QueryAsync($"SELECT * FROM {sc}.vendors {where} ORDER BY risk_score DESC",
                new { Status = status, Criticality = criticality });
            return Results.Ok(rows);
        });

        g.MapGet("/stats", async (HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            return Results.Ok(new
            {
                total        = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vendors WHERE status='active'"),
                no_dpa       = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vendors WHERE dpa_signed=false AND status='active'"),
                high_risk    = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vendors WHERE risk_score>=70 AND status='active'"),
                under_review = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vendors WHERE status='under-review'"),
                avg_risk     = await db.QuerySingleAsync<int>($"SELECT COALESCE(ROUND(AVG(risk_score)),0) FROM {sc}.vendors WHERE status='active'"),
                no_soc2      = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.vendors WHERE soc2_type IS NULL AND criticality IN ('critical','high') AND status='active'")
            });
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var vendor      = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.vendors WHERE id=@Id", new { Id = id });
            if (vendor == null) return Results.NotFound();
            var assessments = await db.QueryAsync($"SELECT * FROM {sc}.vendor_assessments WHERE vendor_id=@Id ORDER BY created_at DESC", new { Id = id });
            return Results.Ok(new { vendor, assessments });
        });

        g.MapPost("/", async (CreateVendorReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var id    = Helpers.NewId(); db.Open();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.vendors(id,name,website,category,criticality,risk_score,risk_tier,status,dpa_signed,owner_email,contact_email,notes)
                VALUES(@Id,@Name,@Website,@Category,@Criticality,@Score,@Tier,'active',@Dpa,@Owner,@Contact,@Notes)",
                new { Id = id, req.Name, req.Website, req.Category, req.Criticality,
                      Score = req.RiskScore ?? 50, Tier = req.RiskTier ?? "tier-2",
                      Dpa = req.DpaSigned ?? false, Owner = req.OwnerEmail,
                      Contact = req.ContactEmail, req.Notes });
            await Helpers.Log(db, sc, email, "vendor.created", "vendors", id, new { name = req.Name });
            return Results.Created($"/api/vendors/{id}", new { id });
        });

        g.MapPut("/{id}", async (string id, UpdateVendorReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await db.ExecuteAsync($@"
                UPDATE {sc}.vendors SET
                    risk_score=COALESCE(@Score,risk_score), status=COALESCE(@Status,status),
                    dpa_signed=COALESCE(@Dpa,dpa_signed), dpa_expiry=COALESCE(@DpaExp,dpa_expiry),
                    soc2_type=COALESCE(@Soc2,soc2_type), soc2_expiry=COALESCE(@Soc2Exp,soc2_expiry),
                    last_assessment_date=COALESCE(@LastAssess,last_assessment_date),
                    next_assessment_due=COALESCE(@NextAssess,next_assessment_due),
                    updated_at=NOW() WHERE id=@Id",
                new { Id = id, Score = req.RiskScore, req.Status, Dpa = req.DpaSigned,
                      DpaExp = req.DpaExpiry, Soc2 = req.Soc2Type, Soc2Exp = req.Soc2Expiry,
                      LastAssess = req.LastAssessmentDate, NextAssess = req.NextAssessmentDue });
            return Results.Ok(new { message = "Vendor updated" });
        });

        g.MapPost("/{id}/send-assessment", async (string id, HttpContext ctx, IDbConnection db, IBus bus) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var vendor = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.vendors WHERE id=@Id", new { Id = id });
            if (vendor == null) return Results.NotFound();
            var asmId = Helpers.NewId();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.vendor_assessments(id,vendor_id,type,status,assessor_email,sent_at)
                VALUES(@Id,@VendorId,'annual','sent',@Assessor,NOW())",
                new { Id = asmId, VendorId = id, Assessor = email });
            if (!string.IsNullOrEmpty((string?)vendor.contact_email))
                await bus.Publish(new SendNotificationEvent((string)vendor.contact_email,
                    $"[Clovrix] Security Assessment Request — {vendor.name}",
                    $"<p>You have been sent a security assessment questionnaire from our compliance team. Please complete it by {DateTime.UtcNow.AddDays(14):yyyy-MM-dd}.</p>",
                    "vendor_assessment"));
            return Results.Ok(new { message = "Assessment sent", assessment_id = asmId });
        });

        return app;
    }

    record CreateVendorReq(string Name, string? Website, string Category, string Criticality,
        string? OwnerEmail, string? ContactEmail, int? RiskScore, string? RiskTier,
        bool? DpaSigned, string? Notes);
    record UpdateVendorReq(int? RiskScore, string? Status, bool? DpaSigned, DateTime? DpaExpiry,
        string? Soc2Type, DateTime? Soc2Expiry, DateTime? LastAssessmentDate, DateTime? NextAssessmentDue);
}

// ══════════════════════════════════════════════════════════════════════════════
// POLICY MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
public static class PoliciesModule
{
    public static WebApplication MapPoliciesModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/policies").WithTags("Policies");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db,
            string? status = null, string? category = null, bool includeArchived = false) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await EnsurePoliciesSchema(db, sc);
            var f = new List<string>();
            if (status   != null) f.Add("status=@Status");
            if (category != null) f.Add("category=@Category");
            if (!includeArchived) f.Add("is_archived=false");
            var where = f.Any() ? "WHERE " + string.Join(" AND ", f) : "";
            var rows = await db.QueryAsync($@"
                SELECT p.*,
                    (SELECT COUNT(*) FROM {sc}.policy_signoffs s WHERE s.policy_id=p.id AND s.status='signed') signed_count,
                    (SELECT COUNT(*) FROM {sc}.policy_signoffs s WHERE s.policy_id=p.id AND s.status='pending') pending_count
                FROM {sc}.policies p {where} ORDER BY p.updated_at DESC NULLS LAST",
                new { Status = status, Category = category });
            return Results.Ok(rows);
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await EnsurePoliciesSchema(db, sc);
            var policy   = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.policies WHERE id=@Id", new { Id = id });
            if (policy == null) return Results.NotFound();
            var versions = await db.QueryAsync($"SELECT id,version,changed_by,change_note,created_at FROM {sc}.policy_versions WHERE policy_id=@Id ORDER BY created_at DESC", new { Id = id });
            var signoffs = await db.QueryAsync($@"
                SELECT s.*, p.full_name, p.email, p.department
                FROM {sc}.policy_signoffs s JOIN {sc}.personnel p ON s.personnel_id=p.id
                WHERE s.policy_id=@Id ORDER BY s.created_at", new { Id = id });
            return Results.Ok(new { policy, versions, signoffs });
        });

        g.MapPost("/", async (CreatePolicyReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            var id    = Helpers.NewId();
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            var hash  = !string.IsNullOrEmpty(req.Content)
                ? Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(req.Content))).ToLower()
                : null;
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.policies(id,title,category,version,status,content,content_hash,owner_email,review_date,frameworks,description,minimum_approvals,assigned_approvers,tags,expiry_date)
                VALUES(@Id,@Title,@Category,@Version,'draft',@Content,@Hash,@Owner,@Review,@Frameworks::jsonb,@Description,@MinApprovals,@Approvers::jsonb,@Tags::jsonb,@Expiry)",
                new { Id = id, req.Title, req.Category, Version = req.Version ?? "1.0",
                      req.Content, Hash = hash, Owner = req.OwnerEmail,
                      Review = DateTime.UtcNow.AddYears(1),
                      Frameworks = System.Text.Json.JsonSerializer.Serialize(req.Frameworks ?? new[] { "ISO42001" }),
                      req.Description, MinApprovals = req.MinimumApprovals ?? 1,
                      Approvers = System.Text.Json.JsonSerializer.Serialize(req.AssignedApprovers ?? Array.Empty<string>()),
                      Tags = System.Text.Json.JsonSerializer.Serialize(req.Tags ?? Array.Empty<string>()),
                      Expiry = req.ExpiryDate });
            // Store initial version
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.policy_versions(id,policy_id,version,content,changed_by,change_note)
                VALUES(gen_random_uuid()::VARCHAR,@PolicyId,@Version,@Content,@By,'Initial version')",
                new { PolicyId = id, Version = req.Version ?? "1.0", req.Content, By = email });
            await Helpers.Log(db, sc, email, "policy.created", "policies", id, new { title = req.Title });
            return Results.Created($"/api/policies/{id}", new { id });
        });

        g.MapPut("/{id}", async (string id, UpdatePolicyReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            await db.ExecuteAsync($@"
                UPDATE {sc}.policies SET
                    title=COALESCE(@Title,title), category=COALESCE(@Category,category),
                    version=COALESCE(@Version,version), description=COALESCE(@Description,description),
                    owner_email=COALESCE(@OwnerEmail,owner_email),
                    minimum_approvals=COALESCE(@MinApprovals,minimum_approvals),
                    assigned_approvers=COALESCE(@Approvers::jsonb,assigned_approvers),
                    tags=COALESCE(@Tags::jsonb,tags),
                    effective_date=COALESCE(@EffectiveDate,effective_date),
                    expiry_date=COALESCE(@ExpiryDate,expiry_date),
                    updated_at=NOW()
                WHERE id=@Id",
                new { Id = id, req.Title, req.Category, req.Version, req.Description, req.OwnerEmail,
                      MinApprovals = req.MinimumApprovals,
                      Approvers = req.AssignedApprovers != null ? System.Text.Json.JsonSerializer.Serialize(req.AssignedApprovers) : null,
                      Tags = req.Tags != null ? System.Text.Json.JsonSerializer.Serialize(req.Tags) : null,
                      req.EffectiveDate, req.ExpiryDate });
            await Helpers.Log(db, sc, email, "policy.updated", "policies", id);
            return Results.Ok(new { message = "Policy updated" });
        });

        g.MapDelete("/{id}", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            await db.ExecuteAsync($"UPDATE {sc}.policies SET is_archived=true, updated_at=NOW() WHERE id=@Id", new { Id = id });
            await Helpers.Log(db, sc, email, "policy.archived", "policies", id);
            return Results.Ok(new { message = "Policy archived" });
        });

        g.MapPost("/{id}/restore", async (string id, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            await db.ExecuteAsync($"UPDATE {sc}.policies SET is_archived=false, updated_at=NOW() WHERE id=@Id", new { Id = id });
            await Helpers.Log(db, sc, email, "policy.restored", "policies", id);
            return Results.Ok(new { message = "Policy restored" });
        });

        g.MapPost("/{id}/upload", async (string id, HttpContext ctx, IDbConnection db, Minio.IMinioClient minio, IFormFile file) =>
        {
            var sc       = Helpers.Schema(ctx);
            var tenantId = sc.Replace("tenant_", "");
            var email    = Helpers.UserEmail(ctx);
            var bucket   = $"evidence-{tenantId}";
            var ext      = Path.GetExtension(file.FileName);
            var key      = $"policy-files/{id}/{Helpers.NewId()}{ext}";

            db.Open();
            await EnsurePoliciesSchema(db, sc);

            bool bucketExists = await minio.BucketExistsAsync(new Minio.DataModel.Args.BucketExistsArgs().WithBucket(bucket));
            if (!bucketExists) await minio.MakeBucketAsync(new Minio.DataModel.Args.MakeBucketArgs().WithBucket(bucket));

            byte[] fileBytes;
            using (var tmp = new System.IO.MemoryStream()) { await file.CopyToAsync(tmp); fileBytes = tmp.ToArray(); }
            var objectSize = (long)fileBytes.Length;

            if (objectSize > 0)
            {
                using var uploadStream = new System.IO.MemoryStream(fileBytes);
                await minio.PutObjectAsync(new Minio.DataModel.Args.PutObjectArgs()
                    .WithBucket(bucket).WithObject(key)
                    .WithStreamData(uploadStream).WithObjectSize(objectSize)
                    .WithContentType(file.ContentType ?? "application/octet-stream"));
            }

            await db.ExecuteAsync($@"
                UPDATE {sc}.policies SET
                    file_name=@Filename, file_path=@Key, file_size=@Size, file_type=@Mime, updated_at=NOW()
                WHERE id=@Id",
                new { Id = id, Filename = file.FileName, Key = key, Size = objectSize, Mime = file.ContentType });

            await Helpers.Log(db, sc, email, "policy.file_uploaded", "policies", id, new { filename = file.FileName });
            return Results.Ok(new { message = "File uploaded successfully" });
        }).DisableAntiforgery();

        g.MapGet("/{id}/download", async (string id, HttpContext ctx, IDbConnection db, Minio.IMinioClient minio) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            await EnsurePoliciesSchema(db, sc);
            var policy = await db.QueryFirstOrDefaultAsync($"SELECT file_name, file_path FROM {sc}.policies WHERE id=@Id", new { Id = id });
            if (policy == null || string.IsNullOrEmpty((string)policy.file_path)) return Results.NotFound(new { error = "File not found" });

            var url = await minio.PresignedGetObjectAsync(new Minio.DataModel.Args.PresignedGetObjectArgs()
                .WithBucket($"evidence-{sc.Replace("tenant_", "")}")
                .WithObject((string)policy.file_path)
                .WithExpiry(3600));

            return Results.Ok(new { url, filename = policy.file_name, expires_in = 3600 });
        });

        g.MapPost("/{id}/sign", async (string id, SignReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            var policy = await db.QueryFirstOrDefaultAsync($"SELECT version,content FROM {sc}.policies WHERE id=@Id", new { Id = id });
            if (policy == null) return Results.NotFound();
            var sigData = $"{id}:{req.PersonnelId}:{policy.version}:{DateTime.UtcNow:O}";
            var sigHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(sigData))).ToLower();
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.policy_signoffs(id,policy_id,personnel_id,version,status,signed_at,signature_hash,ip_address)
                VALUES(gen_random_uuid()::VARCHAR,@PolicyId,@PersonId,@Version,'signed',NOW(),@Hash,@Ip)
                ON CONFLICT(policy_id,personnel_id) DO UPDATE SET
                    status='signed',signed_at=NOW(),signature_hash=@Hash,version=@Version",
                new { PolicyId = id, PersonId = req.PersonnelId, Version = (string)policy.version, Hash = sigHash, Ip = ctx.Connection.RemoteIpAddress?.ToString() });
            await Helpers.Log(db, sc, email, "policy.signed", "policies", id, new { personnel_id = req.PersonnelId });
            return Results.Ok(new { message = "Policy signed", signature_hash = sigHash });
        });

        g.MapPut("/{id}/approve", async (string id, ApproveReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            var status = req.Decision == "approve" ? "approved" : "rejected";
            await db.ExecuteAsync($@"
                UPDATE {sc}.policies SET status=@Status,approved_by=@By,approved_at=CASE WHEN @Status='approved' THEN NOW() ELSE approved_at END,
                effective_date=CASE WHEN @Status='approved' THEN NOW() ELSE effective_date END,updated_at=NOW() WHERE id=@Id",
                new { Id = id, Status = status, By = email });
            await Helpers.Log(db, sc, email, $"policy.{status}", "policies", id, new { req.Comments });
            return Results.Ok(new { message = $"Policy {status}" });
        });

        g.MapPost("/{id}/new-version", async (string id, NewVersionReq req, HttpContext ctx, IDbConnection db) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            await EnsurePoliciesSchema(db, sc);
            var hash = !string.IsNullOrEmpty(req.Content)
                ? Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(req.Content))).ToLower()
                : null;
            await db.ExecuteAsync($@"
                UPDATE {sc}.policies SET content=@Content,content_hash=@Hash,version=@Version,status='in-review',updated_at=NOW() WHERE id=@Id",
                new { Id = id, req.Content, Hash = hash, req.Version });
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.policy_versions(id,policy_id,version,content,changed_by,change_note)
                VALUES(gen_random_uuid()::VARCHAR,@PolicyId,@Version,@Content,@By,@Note)",
                new { PolicyId = id, req.Version, req.Content, By = email, Note = req.ChangeNote });
            return Results.Ok(new { message = "New version created", version = req.Version });
        });

        return app;
    }

    public static async Task EnsurePoliciesSchema(IDbConnection db, string sc)
    {
        await db.ExecuteAsync($@"
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS description TEXT;
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS minimum_approvals SMALLINT NOT NULL DEFAULT 1;
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS assigned_approvers JSONB NOT NULL DEFAULT '[]';
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]';
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS expiry_date DATE;
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_size INT;
            ALTER TABLE {sc}.policies ADD COLUMN IF NOT EXISTS file_type VARCHAR(50);
        ");
    }

    record CreatePolicyReq(string Title, string Category, string? Version, string? Content,
        string? OwnerEmail, string[]? Frameworks, string? Description, int? MinimumApprovals, string[]? AssignedApprovers, string[]? Tags, DateTime? ExpiryDate);
    record UpdatePolicyReq(string? Title, string? Category, string? Version, string? Description, string? OwnerEmail, int? MinimumApprovals, string[]? AssignedApprovers, string[]? Tags, DateTime? EffectiveDate, DateTime? ExpiryDate);
    record ApproveReq(string Decision, string? Comments);
    record SignReq(string PersonnelId);
    record NewVersionReq(string Version, string? Content, string? ChangeNote);
}
