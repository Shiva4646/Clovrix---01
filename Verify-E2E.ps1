$ErrorActionPreference = "Stop"

function Get-Token($Username, $Password) {
    $body = @{ client_id = "clovrix-frontend"; username = $Username; password = $Password; grant_type = "password" }
    $res = Invoke-RestMethod -Uri "http://localhost:8180/realms/clovrix/protocol/openid-connect/token" -Method POST -Body $body
    return $res.access_token
}

function Invoke-ApiReq($Path, $Method, $Body, $Token) {
    $headers = @{ "X-Tenant-ID" = "demo"; "Authorization" = "Bearer $Token"; "Content-Type" = "application/json" }
    $uri = "http://localhost:5000$Path"
    try {
        if ($Body) {
            $json = $Body | ConvertTo-Json -Depth 10 -Compress
            $res = Invoke-RestMethod -Uri $uri -Method $Method -Body $json -Headers $headers
        } else {
            $res = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
        }
        return @{ Status = 200; Data = $res }
    } catch {
        $ex = $_.Exception
        if ($ex.Response) {
            $statusCode = $ex.Response.StatusCode
            $respStream = $ex.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($respStream)
            $respBody = $reader.ReadToEnd()
            Write-Host "API Error: $statusCode - $respBody"
            return @{ Status = [int]$statusCode; Data = $null }
        }
        Write-Host "API Error: $($ex.Message)"
        return @{ Status = 500; Data = $null }
    }
}

Write-Host "--- E2E AUDIT CYCLE VALIDATION ---"

# 1. Login
$adminToken = Get-Token "ComplianceAdmin@clovrix.local" "ComplianceAdmin@Clovrix2026!"
$leadToken = Get-Token "controlLead@clovrix.com" "ControlLead@Clovrix2026!"
$assessorToken = Get-Token "assessor@clovrix.com" "Assessor@Clovrix2026!"
$reviewerToken = Get-Token "reviewer@clovrix.local" "Reviewer@Clovrix2026!"

Write-Host "Tokens acquired successfully."

# 2. Admin: Create Audit
Write-Host "`n[Admin] Creating Audit..."
$auditBody = @{
    name = "E2E Verification Audit"
    description = "Automated test audit"
    startDate = (Get-Date).ToString("yyyy-MM-dd")
    endDate = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    frameworkCode = "ISO42001"
}
$createAuditRes = Invoke-ApiReq "/api/audits" "POST" $auditBody $adminToken
if ($createAuditRes.Status -ne 200 -and $createAuditRes.Status -ne 201) {
    Write-Host "Failed to create audit: $($createAuditRes.Status)"
    exit 1
}
$auditId = $createAuditRes.Data.id
Write-Host "Audit created: $auditId"

# 3. Admin: Assign Controls
Write-Host "`n[Admin] Assigning Controls..."
# Get framework controls first
$fwControls = Invoke-ApiReq "/api/frameworks/ISO42001/controls" "GET" $null $adminToken
$cIds = @($fwControls.Data[0].id, $fwControls.Data[1].id)
$assignBody = @{
    controlIds = $cIds
    controlLead = "controlLead@clovrix.com"
}
$assignRes = Invoke-ApiReq "/api/audits/$auditId/assign-controls" "POST" $assignBody $adminToken
Write-Host "Assign controls status: $($assignRes.Status)"

# 4. Lead: Update Evidence and Mark Ready
Write-Host "`n[Lead] Processing assigned controls..."
$assignedControlsRes = Invoke-ApiReq "/api/assigned-controls" "GET" $null $leadToken
$leadControlId = $assignedControlsRes.Data[0].id
Write-Host "Found assigned control: $leadControlId"

# Wait, the endpoint for updating evidence is /api/control/$id/evidence
$evBody = @{ evidence = "E2E Test Evidence Document" }
$evRes = Invoke-ApiReq "/api/control/$leadControlId/evidence" "PUT" $evBody $leadToken
Write-Host "Update evidence status: $($evRes.Status)"

$statusBody = @{ status = "In Progress" }
$statusRes = Invoke-ApiReq "/api/control/$leadControlId/status" "PUT" $statusBody $leadToken
Write-Host "Transition status to In Progress: $($statusRes.Status)"

$readyRes = Invoke-ApiReq "/api/control/$leadControlId/ready-for-assessment" "POST" $null $leadToken
Write-Host "Mark ready status: $($readyRes.Status)"

# 5. Assessor: Assessment
Write-Host "`n[Assessor] Assessing control..."
$readyList = Invoke-ApiReq "/api/controls/ready" "GET" $null $assessorToken
# In the actual backend it might just list controls assigned to the assessor, or all ready controls
$assessorControlId = $leadControlId
$assessBody = @{
    result = "pass"
    comments = "Looks good in E2E"
}
$assessRes = Invoke-ApiReq "/api/control/$assessorControlId/assessments" "POST" $assessBody $assessorToken
Write-Host "Assessment record status: $($assessRes.Status)"
# Assuming response returns the assessment ID, or we need to fetch it
$assessmentId = $assessRes.Data.id
if (-not $assessmentId) {
    # Let's fetch history to get the assessment ID
    $history = Invoke-ApiReq "/api/control/$assessorControlId/assessments" "GET" $null $assessorToken
    $assessmentId = $history.Data[0].id
}
Write-Host "Assessment ID: $assessmentId"

# 6. Reviewer: Review Assessment
Write-Host "`n[Reviewer] Reviewing assessment..."
$reviewBody = @{
    decision = "approved"
    comments = "Approved via E2E"
}
$reviewRes = Invoke-ApiReq "/api/assessments/$assessmentId/review" "POST" $reviewBody $reviewerToken
Write-Host "Review status: $($reviewRes.Status)"

# 7. Admin: Close Audit
Write-Host "`n[Admin] Closing audit..."
$closeRes = Invoke-ApiReq "/api/audits/$auditId/close" "POST" $null $adminToken
Write-Host "Close audit status: $($closeRes.Status)"

Write-Host "`n--- E2E AUDIT CYCLE VALIDATION COMPLETE ---"
