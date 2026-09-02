param(
  [Parameter(Mandatory=$true)][string]$RunDir,
  [Parameter(Mandatory=$true)][string]$Deadline,
  [Parameter(Mandatory=$true)][string]$WatcherTaskName
)

$ErrorActionPreference = 'Stop'
$deadlineAt = [DateTimeOffset]::Parse($Deadline)
$statusFile = Join-Path $RunDir 'deadline_pause_shutdown_status.json'
$progressFile = Join-Path $RunDir 'phase2_progress.json'
$checkpointFile = Join-Path $RunDir 'phase2_autosave_state.json'
$runnerFile = Join-Path $RunDir 'scheduled_phase2_runner_status.json'

function Write-Utf8Json($payload) {
  $payload.updated_at = [DateTimeOffset]::Now.ToString('o')
  [System.IO.File]::WriteAllText($statusFile, ($payload | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
}

function Read-JsonSafe([string]$file) {
  try {
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    return Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
  } catch { return $null }
}

Write-Utf8Json ([ordered]@{
  status = 'waiting_for_deadline'
  watcher_pid = $PID
  deadline = $deadlineAt.ToString('o')
  run_dir = $RunDir
})

while ([DateTimeOffset]::Now -lt $deadlineAt) {
  Start-Sleep -Milliseconds 500
}

$initialProgress = Read-JsonSafe $progressFile
$initialCursor = if ($initialProgress -and $initialProgress.progress) { [int]$initialProgress.progress.total_processed_candidates } else { -1 }
Write-Utf8Json ([ordered]@{
  status = 'deadline_reached_waiting_for_candidate_checkpoint'
  deadline = $deadlineAt.ToString('o')
  initial_cursor = $initialCursor
})

$durable = $false
$targetCursor = $initialCursor
$waitUntil = [DateTimeOffset]::Now.AddMinutes(5)
while ([DateTimeOffset]::Now -lt $waitUntil) {
  $progress = Read-JsonSafe $progressFile
  $checkpoint = Read-JsonSafe $checkpointFile
  if ($progress -and $progress.finalized -eq $true) {
    $durable = $true
    $targetCursor = [int]$progress.progress.total_processed_candidates
    break
  }
  if ($progress -and $checkpoint -and $progress.progress -and $checkpoint.progress) {
    $progressCursor = [int]$progress.progress.total_processed_candidates
    $checkpointCursor = [int]$checkpoint.progress.total_processed_candidates
    $checkpointAt = [DateTimeOffset]::Parse([string]$checkpoint.updated_at)
    if ($checkpointAt -ge $deadlineAt -and $checkpointCursor -ge $progressCursor -and $checkpointCursor -ge $initialCursor) {
      $durable = $true
      $targetCursor = $checkpointCursor
      break
    }
  }
  Start-Sleep -Milliseconds 250
}

$runner = Read-JsonSafe $runnerFile
$pids = @()
if ($runner -and [string]$runner.status -eq 'phase2_running') {
  if ($runner.phase2_child_pid) { $pids += [int]$runner.phase2_child_pid }
  if ($runner.power_guard_pid) { $pids += [int]$runner.power_guard_pid }
  if ($runner.runner_pid) { $pids += [int]$runner.runner_pid }
}
foreach ($processId in ($pids | Select-Object -Unique)) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
& shutdown.exe /a 2>$null

$closeResult = [ordered]@{ ok=$false; reason='not_attempted' }
try {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $closeScript = Join-Path $PSScriptRoot 'close_chrome_cdp.js'
  $closeOutput = & $node $closeScript 'http://127.0.0.1:9222' 2>&1 | Out-String
  $closeResult = [ordered]@{ ok=($LASTEXITCODE -eq 0); reason='close_chrome_cdp'; output=$closeOutput.Trim() }
} catch {
  $closeResult = [ordered]@{ ok=$false; reason='close_failed'; error=$_.Exception.Message }
}

$finalProgress = Read-JsonSafe $progressFile
$finalCheckpoint = Read-JsonSafe $checkpointFile
$finalCursor = if ($finalCheckpoint -and $finalCheckpoint.progress) { [int]$finalCheckpoint.progress.total_processed_candidates } else { -1 }
$checkpointReadable = $null -ne $finalCheckpoint
$progressReadable = $null -ne $finalProgress
$allStopped = $true
foreach ($processId in ($pids | Select-Object -Unique)) {
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) { $allStopped = $false }
}

Write-Utf8Json ([ordered]@{
  status = 'paused_checkpoint_saved_browser_close_attempted_shutdown_issuing'
  deadline = $deadlineAt.ToString('o')
  initial_cursor = $initialCursor
  durable_boundary_observed = $durable
  target_cursor = $targetCursor
  final_checkpoint_cursor = $finalCursor
  checkpoint_readable = $checkpointReadable
  progress_readable = $progressReadable
  processes_stopped = $allStopped
  chrome_close = $closeResult
  shutdown_requested = $true
})

try { Unregister-ScheduledTask -TaskName $WatcherTaskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
& shutdown.exe /s /f /t 0 /c 'Facebook Group Phase 2 paused at a durable candidate boundary; progress saved.'
