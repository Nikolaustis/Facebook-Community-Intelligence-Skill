param(
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$TaskName
)

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'scheduled_phase2_runner.ps1'
if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Missing scheduled phase2 runner source: $sourcePath"
}
$source = Get-Content -Raw -LiteralPath $sourcePath

$old = @'
$nodeArgs.Add((Join-Path $RootDir 'scripts\phase2_collect_details.js')) | Out-Null
'@.TrimEnd()
$new = @"
`$nodeArgs.Add((Join-Path `$RootDir 'scripts\run_collector_reliable.js')) | Out-Null
`$nodeArgs.Add('phase2') | Out-Null
"@.TrimEnd()

$first = $source.IndexOf($old, [System.StringComparison]::Ordinal)
if ($first -lt 0) { throw '[scheduled-reliability] phase2 collector marker not found; refusing unsafe patch.' }
$second = $source.IndexOf($old, $first + $old.Length, [System.StringComparison]::Ordinal)
if ($second -ge 0) { throw '[scheduled-reliability] phase2 collector marker is not unique; refusing unsafe patch.' }
$source = $source.Substring(0, $first) + $new + $source.Substring($first + $old.Length)

$runtimePath = Join-Path $PSScriptRoot (".__runtime_scheduled_phase2_{0}_{1}.ps1" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
[System.IO.File]::WriteAllText($runtimePath, $source, (New-Object System.Text.UTF8Encoding($false)))
try {
  & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runtimePath -Manifest $Manifest -TaskName $TaskName
  exit $LASTEXITCODE
} finally {
  Remove-Item -Force -LiteralPath $runtimePath -ErrorAction SilentlyContinue
}
