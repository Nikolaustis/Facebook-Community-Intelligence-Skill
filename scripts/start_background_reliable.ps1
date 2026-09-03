$ErrorActionPreference = 'Stop'

$sourcePath = Join-Path $PSScriptRoot 'start_background_task.ps1'
if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Missing background launcher source: $sourcePath"
}

$source = (Get-Content -Raw -LiteralPath $sourcePath) -replace "`r`n", "`n"

function Replace-ExactlyOnce {
  param([string]$Text, [string]$Search, [string]$Replacement, [string]$Label)
  $first = $Text.IndexOf($Search, [System.StringComparison]::Ordinal)
  if ($first -lt 0) { throw "[background-reliability] $Label marker not found; refusing unsafe patch." }
  $second = $Text.IndexOf($Search, $first + $Search.Length, [System.StringComparison]::Ordinal)
  if ($second -ge 0) { throw "[background-reliability] $Label marker is not unique; refusing unsafe patch." }
  return $Text.Substring(0, $first) + $Replacement + $Text.Substring($first + $Search.Length)
}

$phase1Old = @'
  Add-QuotedArg $cmd (Join-Path $RootDir "scripts\phase1_collect_candidates.js")
  $cmd.Add('--games') | Out-Null
'@
$phase1New = @'
  Add-QuotedArg $cmd (Join-Path $RootDir "scripts\run_collector_reliable.js")
  $cmd.Add('phase1') | Out-Null
  $cmd.Add('--games') | Out-Null
'@
$phase1Old = $phase1Old -replace "`r`n", "`n"
$phase1New = $phase1New -replace "`r`n", "`n"
$source = Replace-ExactlyOnce $source $phase1Old $phase1New 'phase1 background collector'

$phase2Old = @'
  Add-QuotedArg $cmd (Join-Path $RootDir "scripts\phase2_collect_details.js")
  $cmd.Add('--index') | Out-Null
'@
$phase2New = @'
  Add-QuotedArg $cmd (Join-Path $RootDir "scripts\run_collector_reliable.js")
  $cmd.Add('phase2') | Out-Null
  $cmd.Add('--index') | Out-Null
'@
$phase2Old = $phase2Old -replace "`r`n", "`n"
$phase2New = $phase2New -replace "`r`n", "`n"
$source = Replace-ExactlyOnce $source $phase2Old $phase2New 'phase2 direct-background collector'

$runnerOld = '$Runner = Join-Path $RootDir "scripts\scheduled_phase2_runner.ps1"'
$runnerNew = '$Runner = Join-Path $RootDir "scripts\scheduled_phase2_runner_reliable.ps1"'
$source = Replace-ExactlyOnce $source $runnerOld $runnerNew 'scheduled phase2 runner'

$runtimePath = Join-Path $PSScriptRoot (".__runtime_start_background_{0}_{1}.ps1" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
[System.IO.File]::WriteAllText($runtimePath, $source, (New-Object System.Text.UTF8Encoding($false)))
try {
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $runtimePath @args
  exit $LASTEXITCODE
} finally {
  Remove-Item -Force -LiteralPath $runtimePath -ErrorAction SilentlyContinue
}
