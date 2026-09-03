param(
  [Parameter(Mandatory = $true)]
  [string]$Games,
  [int]$Threshold = 10,
  [string]$RunDir = "",
  [string]$Cdp = "http://127.0.0.1:9222",
  [string]$Config = "",
  [switch]$ShutdownAfterComplete,
  [int]$ShutdownDelaySeconds = 60
)

$ErrorActionPreference = "Stop"

function Assert-NodeSucceeded {
  param(
    [string]$Stage,
    [int]$ExitCode
  )
  if ($ExitCode -ne 0) {
    throw "$Stage failed with exit code $ExitCode. The workflow has been stopped to prevent stale/partial outputs from being treated as success."
  }
}

if ([string]::IsNullOrWhiteSpace($RunDir)) {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $RunDir = Join-Path $PSScriptRoot "..\runs\$ts"
}

$RunDir = (Resolve-Path (New-Item -ItemType Directory -Force -Path $RunDir)).Path
$reliableRunner = Join-Path $PSScriptRoot "run_collector_reliable.js"
if (-not (Test-Path $reliableRunner)) {
  throw "Missing reliability runner: $reliableRunner"
}

Write-Host "[1/4] 第一轮候选采集开始..."
$phase1Args = @(
  $reliableRunner,
  "phase1",
  "--games", $Games,
  "--out-dir", $RunDir,
  "--cdp", $Cdp
)
if (-not [string]::IsNullOrWhiteSpace($Config)) {
  $phase1Args += @("--config", $Config)
}
node @phase1Args
Assert-NodeSucceeded -Stage "Phase 1" -ExitCode $LASTEXITCODE

$indexPath = Join-Path $RunDir "phase1_index.json"
if (-not (Test-Path $indexPath)) {
  throw "Phase 1 exited successfully but did not generate phase1_index.json. Workflow stopped."
}

Write-Host ""
Write-Host "已到达深翻停止条件，请人工确认后继续。"
$confirm = Read-Host "输入 '可以停止，继续' 以进入第二轮"
if ($confirm -ne "可以停止，继续") {
  Write-Host "已取消第二轮。你可以稍后执行 npm run phase2 -- --index `"$indexPath`"。"
  exit 0
}

Write-Host "[2/4] Phase 1.5 群名预筛开始..."
$phase15Args = @(
  (Join-Path $PSScriptRoot "phase15_prefilter_candidates.js"),
  "--index", $indexPath,
  "--out-dir", $RunDir
)
if (-not [string]::IsNullOrWhiteSpace($Config)) {
  $phase15Args += @("--config", $Config)
}
node @phase15Args
Assert-NodeSucceeded -Stage "Phase 1.5" -ExitCode $LASTEXITCODE

Write-Host "[3/4] 第二轮详情采集开始..."
$outXlsx = Join-Path $RunDir "fb_monitoring_filtered.xlsx"
$phase2Args = @(
  $reliableRunner,
  "phase2",
  "--index", $indexPath,
  "--threshold", $Threshold,
  "--out-xlsx", $outXlsx,
  "--out-summary", (Join-Path $RunDir "fb_monitoring_filtered_summary.json"),
  "--out-collision", (Join-Path $RunDir "collision_report.json"),
  "--out-audit", (Join-Path $RunDir "audit_stats.json"),
  "--cdp", $Cdp
)
if (-not [string]::IsNullOrWhiteSpace($Config)) {
  $phase2Args += @("--config", $Config)
}
if ($ShutdownAfterComplete) {
  $phase2Args += @("--shutdown-after-complete", "true", "--shutdown-delay-seconds", ([string]$ShutdownDelaySeconds))
}
node @phase2Args
Assert-NodeSucceeded -Stage "Phase 2" -ExitCode $LASTEXITCODE

if (-not (Test-Path $outXlsx)) {
  throw "Phase 2 exited successfully but the expected final workbook is missing: $outXlsx"
}

Write-Host "[4/4] 完成。输出目录：$RunDir"
