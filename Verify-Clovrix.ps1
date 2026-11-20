# ═════════════════════════════════════════════════════════════════════════════
# Verify-Clovrix.ps1 — end-to-end verification of the Clovrix audit cycle + features.
#
# Runs the whole flow via the API (no browser needed) and reports PASS/FAIL per step:
#   frameworks seeded → admin creates audit → assigns to Control Lead →
#   Control Lead enriches + marks ready → Assessor tests → Reviewer approves →
#   Admin closes → AI System create → Risk create → dashboard metrics.
#
# Prereq: the stack is up (docker compose up -d) and the DB is seeded/migrated.
# Usage:  .\Verify-Clovrix.ps1
# ═════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'
$API = 'http://localhost:5000'
$KC  = 'http://localhost:8180'
$REALM = 'clovrix'

$script:pass = 0; $script:fail = 0
function Step($name, [scriptblock]$body) {
  try {
    $r = & $body
    Write-Host ("  [PASS] {0}" -f $name) -ForegroundColor Green
    $script:pass++
    return $r
  } catch {
    Write-Host ("  [FAIL] {0} -> {1}" -f $name, $_.Exception.Message) -ForegroundColor Red
    $script:fail++
    return $null
  }
}

function Get-Token($user, $pass) {
  $b = @{ grant_type='password'; client_id='clovrix-frontend'; username=$user; password=$pass; scope='openid profile email' }
  (Invoke-RestMethod -Method Post -Uri "$KC/realms/$REALM/protocol/openid-connect/token" `
     -ContentType 'application/x-www-form-urlencoded' -Body $b).access_token
}
function Hdr($t) { @{ Authorization = "Bearer $t"; 'X-Tenant-ID' = 'demo' } }
function GET($t, $path)          { Invoke-RestMethod -Uri "$API$path" -Headers (Hdr $t) }
function POST($t, $path, $obj)   { Invoke-RestMethod -Method Post -Uri "$API$path" -Headers (Hdr $t) -ContentType 'application/json' -Body ($obj | ConvertTo-Json) }
function PUT($t, $path, $obj)    { Invoke-RestMethod -Method Put  -Uri "$API$path" -Headers (Hdr $t) -ContentType 'application/json' -Body ($obj | ConvertTo-Json) }

Write-Host "`n=== Clovrix end-to-end verification ===`n" -ForegroundColor Cyan

# ── Tokens ────────────────────────────────────────────────────────────────────
Write-Host "Authenticating roles..." -ForegroundColor Cyan
$admin    = Step "Admin login"        { Get-Token 'ComplianceAdmin@clovrix.local' 'ComplianceAdmin@Clovrix2026!' }
$lead     = Step "Control Lead login" { Get-Token 'controlLead@clovrix.com'       'ControlLead@Clovrix2026!' }
$assessor = Step "Assessor login"     { Get-Token 'assessor@clovrix.com'          'Assessor@Clovrix2026!' }
$reviewer = Step "Reviewer login"     { Get-Token 'reviewer@clovrix.local'        'Reviewer@Clovrix2026!' }
if (-not ($admin -and $lead -and $assessor -and $reviewer)) { Write-Host "`nCannot continue without all tokens." -ForegroundColor Red; return }

# ── Frameworks + control libraries ────────────────────────────────────────────
Write-Host "`nFramework libraries..." -ForegroundColor Cyan
Step "Frameworks list is non-empty" {
  $fw = GET $admin '/api/frameworks/'
  if ($fw.Count -lt 3) { throw "only $($fw.Count) frameworks" }
}
foreach ($code in 'ISO42001','ISO27001','NIST_CSF','SOC2','GDPR','EU_AI_ACT','NIST_AI_RMF','PIMS') {
  Step "Controls seeded: $code" {
    $c = GET $admin "/api/frameworks/$code/controls"
    if ($c.Count -lt 1) { throw "0 controls" }
  } | Out-Null
}

# ── Audit cycle ───────────────────────────────────────────────────────────────
Write-Host "`nAudit cycle..." -ForegroundColor Cyan
$controls = GET $admin '/api/frameworks/ISO42001/controls'
$pick = $controls | Select-Object -First 3

$audit = Step "Admin creates audit" {
  POST $admin '/api/audits' @{ name = "E2E Verify $(Get-Date -Format yyyyMMdd-HHmmss)"; frameworkCode = 'ISO42001'; controlLead = 'controlLead@clovrix.com' }
}
$assigned = Step "Admin assigns 3 controls to Control Lead" {
  POST $admin "/api/audits/$($audit.id)/assign-controls" @{ controlIds = @($pick.id); controlLead = 'controlLead@clovrix.com' }
}
Step "Control Lead sees the assigned controls" {
  $mine = GET $lead '/api/assigned-controls'
  if (@(@($mine) | Where-Object { $_.auditId -eq $audit.id }).Count -lt 3) { throw "Control Lead does not see the 3 assigned controls" }
}

$target = $assigned[0]
Step "Control Lead enriches (summary/status)" {
  PUT $lead "/api/control/$($target.id)/summary" @{ summary = 'Verified by E2E script.' } | Out-Null
  PUT $lead "/api/control/$($target.id)/status"  @{ status  = 'In Progress' } | Out-Null
}
Step "Control Lead marks ready for assessment" {
  POST $lead "/api/control/$($target.id)/ready-for-assessment" $null | Out-Null
}
Step "Assessor sees the ready control" {
  $ready = GET $assessor '/api/controls/ready'
  if (@($ready).id -notcontains $target.id) { throw "control not in Assessor ready queue" }
}
$asmt = Step "Assessor records a PASS" {
  POST $assessor "/api/control/$($target.id)/assessments" @{ method = 'manual'; result = 'pass'; comments = 'E2E pass' }
}
Step "Reviewer sees + approves the assessment" {
  $queue = GET $reviewer '/api/assessments'
  if (@($queue).id -notcontains $asmt.id) { throw "assessment not in reviewer queue" }
  POST $reviewer "/api/assessments/$($asmt.id)/review" @{ decision = 'approved'; comments = 'E2E approved' } | Out-Null
}
Step "Admin closes the audit" {
  POST $admin "/api/audits/$($audit.id)/close" $null | Out-Null
}

# ── New features ──────────────────────────────────────────────────────────────
Write-Host "`nAI System Registry + Risk Register..." -ForegroundColor Cyan
Step "Create + list AI system" {
  $sys = POST $admin '/api/ai-systems' @{ name = "E2E Model $(Get-Random)"; businessOwner = 'E2E Owner'; lifecycleStage = 'development'; riskClass = 'medium'; frameworks = @('ISO 42001') }
  $all = GET $admin '/api/ai-systems'
  if (@($all).id -notcontains $sys.id) { throw "created AI system not listed" }
}
Step "Create + list risk" {
  $risk = POST $admin '/api/risks/' @{ title = "E2E Risk $(Get-Random)"; category = 'operational'; likelihood = 4; impact = 4 }
  $all = GET $admin '/api/risks/'
  if (@($all).id -notcontains $risk.id) { throw "created risk not listed" }
}

# ── Dashboards ────────────────────────────────────────────────────────────────
Write-Host "`nDashboard metrics..." -ForegroundColor Cyan
Step "Audit metrics endpoint returns numbers" {
  $m = GET $admin '/api/audits/metrics'
  if ($null -eq $m.totalAudits) { throw "no metrics payload" }
  Write-Host ("        audits={0} closed={1} controls={2} openFindings={3}" -f $m.totalAudits,$m.closedAudits,$m.totalControls,$m.openFindings) -ForegroundColor DarkGray
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ("`n=== {0} passed, {1} failed ===" -f $script:pass, $script:fail) -ForegroundColor Cyan
if ($script:fail -eq 0) { Write-Host "All checks green — the cycle works end to end across all roles.`n" -ForegroundColor Green }
else { Write-Host "Some checks failed — see the [FAIL] lines above. Grab 'docker compose logs --tail=20 api' for the 500s.`n" -ForegroundColor Yellow }
