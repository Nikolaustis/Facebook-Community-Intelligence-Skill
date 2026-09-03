$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'queue_phase2_after_current.ps1'
if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Missing phase2 handoff source: $sourcePath"
}
$source = (Get-Content -Raw -LiteralPath $sourcePath) -replace "`r`n", "`n"
$old = @'
$starter = Join-Path $RootDir 'scripts\start_background_task.ps1'
'@.TrimEnd()
$new = @'
$starter = Join-Path $RootDir 'scripts\start_background_reliable.ps1'
'@.TrimEnd()
$first = $source.IndexOf($old, [System.StringComparison]::Ordinal)
if ($first -lt 0) { throw '[handoff-reliability] background starter marker not found; refusing unsafe patch.' }
$second = $source.IndexOf($old, $first + $old.Length, [System.StringComparison]::Ordinal)
if ($second -ge 0) { throw '[handoff-reliability] background starter marker is not unique; refusing unsafe patch.' }
$source = $source.Substring(0, $first) + $new + $source.Substring($first + $old.Length)
$runtimePath = Join-Path $PSScriptRoot (".__runtime_phase2_handoff_{0}_{1}.ps1" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
[System.IO.File]::WriteAllText($runtimePath, $source, (New-Object System.Text.UTF8Encoding($false)))
try {
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $runtimePath @args
  exit $LASTEXITCODE
} finally {
  Remove-Item -Force -LiteralPath $runtimePath -ErrorAction SilentlyContinue
}
