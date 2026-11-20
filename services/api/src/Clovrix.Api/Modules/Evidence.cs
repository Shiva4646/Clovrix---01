using System.Data;
using Dapper;
using Minio;
using Minio.DataModel.Args;

namespace Clovrix.Api.Modules;

public static class EvidenceModule
{
    public static WebApplication MapEvidenceModule(this WebApplication app)
    {
        var g = app.MapGroup("/api/evidence").WithTags("Evidence");

        g.MapGet("/", async (HttpContext ctx, IDbConnection db,
            string? controlId = null, string? workflowId = null, int page = 1, int size = 50) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var filters = new List<string>();
            if (controlId  != null) filters.Add("control_id=@ControlId");
            if (workflowId != null) filters.Add("workflow_id=@WorkflowId");
            var where = filters.Any() ? "WHERE " + string.Join(" AND ", filters) : "";
            var (offset, sz) = Pagination.Parse(page, size);
            var items = await db.QueryAsync($"SELECT * FROM {sc}.evidence {where} ORDER BY created_at DESC LIMIT @Sz OFFSET @Off",
                new { ControlId = controlId, WorkflowId = workflowId, Sz = sz, Off = offset });
            var total = await db.QuerySingleAsync<int>($"SELECT COUNT(*) FROM {sc}.evidence {where}",
                new { ControlId = controlId, WorkflowId = workflowId });
            return Results.Ok(Pagination.Of(items, total, page, sz));
        });

        // ── Evidence by step ─────────────────────────────────────────────────
        g.MapGet("/step/{stepId}", async (string stepId, HttpContext ctx, IDbConnection db) =>
        {
            var sc = Helpers.Schema(ctx); db.Open();
            var items = await db.QueryAsync(
                $"SELECT * FROM {sc}.evidence WHERE step_id=@StepId ORDER BY created_at DESC",
                new { StepId = stepId });
            return Results.Ok(items);
        });

        g.MapPost("/upload", async (
            HttpContext ctx, IDbConnection db, IMinioClient minio,
            IFormFile file,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? controlId,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? workflowId,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? stepId,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? description) =>
        {
            var sc       = Helpers.Schema(ctx);
            var tenantId = sc.Replace("tenant_", "");
            var email    = Helpers.UserEmail(ctx);
            var bucket   = $"evidence-{tenantId}";
            var id       = Helpers.NewId();
            var ext      = Path.GetExtension(file.FileName);
            var key      = $"{controlId ?? "general"}/{DateTime.UtcNow:yyyy/MM}/{id}{ext}";

            // Ensure bucket exists (MinIO SDK v6)
            var bucketExists = await minio.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket));
            if (!bucketExists)
                await minio.MakeBucketAsync(new MakeBucketArgs().WithBucket(bucket));

            // Buffer entire file so we know the exact size (IFormFile.Length can be unreliable)
            byte[] fileBytes;
            using (var tmp = new System.IO.MemoryStream())
            {
                await file.CopyToAsync(tmp);
                fileBytes = tmp.ToArray();
            }
            var objectSize = (long)fileBytes.Length;

            // Upload — MinIO SDK v6 requires ObjectSize > 0 for PutObject.
            // For empty files we still record metadata but skip the object store.
            if (objectSize > 0)
            {
                using var uploadStream = new System.IO.MemoryStream(fileBytes);
                await minio.PutObjectAsync(new PutObjectArgs()
                    .WithBucket(bucket).WithObject(key)
                    .WithStreamData(uploadStream)
                    .WithObjectSize(objectSize)
                    .WithContentType(file.ContentType ?? "application/octet-stream"));
            }

            // Store metadata in DB
            db.Open();

string? resolvedControlId = null;

if (!string.IsNullOrWhiteSpace(controlId))
{
    resolvedControlId = await db.QuerySingleOrDefaultAsync<string?>(
        $@"SELECT id FROM {sc}.controls WHERE id=@ControlId
           UNION
           SELECT c.id
           FROM {sc}.audit_controls ac
           JOIN {sc}.controls c ON c.id = ac.source_control_id
           WHERE ac.id=@ControlId OR ac.source_control_id=@ControlId
           LIMIT 1",
        new { ControlId = controlId });
}
            await db.ExecuteAsync($@"
                INSERT INTO {sc}.evidence(id,control_id,workflow_id,step_id,filename,original_name,file_size,mime_type,storage_bucket,storage_key,description,collected_by,source,ocr_status)
                VALUES(@Id,@CtrlId,@WfId,@StepId,@Filename,@OrigName,@Size,@Mime,@Bucket,@Key,@Desc,@Collector,'manual','pending')",
                new { Id = id, CtrlId = resolvedControlId ?? controlId, WfId = workflowId, StepId = stepId,
                      Filename = $"{id}{ext}", OrigName = file.FileName,
                      Size = objectSize, Mime = file.ContentType,
                      Bucket = bucket, Key = key, Desc = description, Collector = email });

            // Update workflow evidence count if linked
            if (!string.IsNullOrEmpty(workflowId))
                await db.ExecuteAsync($"UPDATE {sc}.workflows SET evidence_count=evidence_count+1 WHERE id=@Id", new { Id = workflowId });

            await Helpers.Log(db, sc, email, "evidence.uploaded", "evidence", id, new { filename = file.FileName });

            // Queue OCR if PDF or image
            if (file.ContentType?.StartsWith("image") == true || file.ContentType == "application/pdf")
                BackgroundServices.QueueOcr(id, sc, bucket, key);

            return Results.Ok(new { id, filename = file.FileName, size = objectSize, bucket, key });
        }).DisableAntiforgery();

        g.MapGet("/{id}/download", async (string id, HttpContext ctx, IDbConnection db) =>
{
    var sc = Helpers.Schema(ctx);
    db.Open();

    var ev = await db.QueryFirstOrDefaultAsync(
        $"SELECT * FROM {sc}.evidence WHERE id=@Id",
        new { Id = id });

    if (ev == null) return Results.NotFound();

    var config = ctx.RequestServices.GetRequiredService<IConfiguration>();

    var publicEndpoint = config["MINIO_PUBLIC_ENDPOINT"] ?? "localhost:9000";
    var accessKey = config["MINIO_ACCESS_KEY"] ?? "clovrix-admin";
    var secretKey = config["MINIO_SECRET_KEY"] ?? "Clovrix@MinIO2026!";

    var publicMinio = new MinioClient()
        .WithEndpoint(publicEndpoint)
        .WithCredentials(accessKey, secretKey)
        .WithSSL(false)
        .Build();

    var url = await publicMinio.PresignedGetObjectAsync(
        new PresignedGetObjectArgs()
            .WithBucket((string)ev.storage_bucket)
            .WithObject((string)ev.storage_key)
            .WithExpiry(3600));

    return Results.Ok(new
    {
        url,
        filename = ev.original_name,
        expires_in = 3600
    });
});

        g.MapDelete("/{id}", async (string id, HttpContext ctx, IDbConnection db, IMinioClient minio) =>
        {
            var sc    = Helpers.Schema(ctx);
            var email = Helpers.UserEmail(ctx);
            db.Open();
            var ev = await db.QueryFirstOrDefaultAsync($"SELECT * FROM {sc}.evidence WHERE id=@Id", new { Id = id });
            if (ev == null) return Results.NotFound();

            await minio.RemoveObjectAsync(new RemoveObjectArgs()
                .WithBucket((string)ev.storage_bucket)
                .WithObject((string)ev.storage_key));

            await db.ExecuteAsync($"DELETE FROM {sc}.evidence WHERE id=@Id", new { Id = id });
            await Helpers.Log(db, sc, email, "evidence.deleted", "evidence", id);
            return Results.Ok(new { message = "Evidence deleted" });
        });

        return app;
    }
}

// ── Background service stubs (Hangfire jobs called from evidence upload) ──────
public static class BackgroundServices
{
    public static void QueueOcr(string evidenceId, string schema, string bucket, string key)
    {
        Hangfire.BackgroundJob.Enqueue<OcrJob>(j => j.ProcessOcr(evidenceId, schema, bucket, key));
    }
}

public class OcrJob
{
    public void ProcessOcr(string evidenceId, string schema, string bucket, string key)
    {
        // OCR processing is handled asynchronously via Hangfire
        // Implementation: download from MinIO, run Tesseract/Azure OCR, update DB
    }
}
