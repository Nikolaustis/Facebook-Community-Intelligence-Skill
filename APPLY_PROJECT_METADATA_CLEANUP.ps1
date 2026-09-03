param(
  [string]$RepoRoot = "."
)

$ErrorActionPreference = "Stop"

$repo = (Resolve-Path $RepoRoot).Path
$phase1 = Join-Path $repo "scripts\phase1_collect_candidates.js"

if (-not (Test-Path (Join-Path $repo "package.json"))) {
  throw "package.json was not found. Run this script from the repository root."
}
if (-not (Test-Path $phase1)) {
  throw "Phase 1 collector was not found."
}

# Remove project release metadata from the mature Phase 1 collector.
$text = [System.IO.File]::ReadAllText($phase1)
$diagnosticPattern = '(?m)^\s{4}version:\s*[''"][^''"]+[''"],\s*\r?\n'
$indexPattern = '(?m)^\s{6}skill_version:\s*[''"][^''"]+[''"],\s*\r?\n'
$text = [regex]::Replace($text, $diagnosticPattern, '')
$text = [regex]::Replace($text, $indexPattern, '')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($phase1, $text, $utf8NoBom)

# Remove obsolete files whose names encode a project release identifier.
$excludedRoots = @(".git", "node_modules", "runs")
$allFiles = Get-ChildItem -LiteralPath $repo -Recurse -File -Force | Where-Object {
  $relative = $_.FullName.Substring($repo.Length).TrimStart('\', '/')
  $first = ($relative -split '[\\/]')[0]
  $excludedRoots -notcontains $first
}

$namePattern = '(?i)(^|[_\-.])v\d+(?:\.\d+){0,2}(?=$|[_\-.])'
$versionNamed = $allFiles | Where-Object { $_.Name -match $namePattern }

foreach ($file in $versionNamed) {
  Remove-Item -LiteralPath $file.FullName -Force
  Write-Host "Removed release-encoded filename: $($file.FullName.Substring($repo.Length).TrimStart('\', '/'))"
}

# Verify replacement files are present.
$required = @(
  "README.md",
  "SKILL.md",
  "package.json",
  "package-lock.json",
  "RELIABILITY_HARDENING.md",
  "scripts\collector_reliability_patcher.js",
  "scripts\run_multi_games_reliable.ps1",
  "tests\test_project_metadata.js",
  "references\geonames_filter_safety.md"
)

foreach ($relative in $required) {
  $full = Join-Path $repo $relative
  if (-not (Test-Path $full)) {
    throw "Required replacement file is missing: $relative"
  }
}

Write-Host ""
Write-Host "Project release metadata cleanup completed."
Write-Host "Run:"
Write-Host "  npm ci"
Write-Host "  npm test"
Write-Host "  npm run doctor"

# The migration helper is not part of the repository's permanent source surface.
$self = $MyInvocation.MyCommand.Path
if ($self -and (Test-Path $self)) {
  Remove-Item -LiteralPath $self -Force -ErrorAction SilentlyContinue
}
