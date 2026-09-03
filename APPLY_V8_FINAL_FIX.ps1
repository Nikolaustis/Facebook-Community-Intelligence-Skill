param(
    [string]$RepoRoot = "."
)

$ErrorActionPreference = "Stop"

$repo = (Resolve-Path $RepoRoot).Path
$phase1 = Join-Path $repo "scripts\phase1_collect_candidates.js"
$validation = Join-Path $repo "V8.0.0_VALIDATION.md"

if (-not (Test-Path $phase1)) {
    throw "Missing file: $phase1"
}

$content = Get-Content -LiteralPath $phase1 -Raw -Encoding UTF8

$oldDiagnostic = "    version: '7.2.0',"
$newDiagnostic = "    version: '8.0.0',"
$oldIndex = "      skill_version: '7.2.0',"
$newIndex = "      skill_version: '8.0.0',"

$diagCount = ([regex]::Matches($content, [regex]::Escape($oldDiagnostic))).Count
$indexCount = ([regex]::Matches($content, [regex]::Escape($oldIndex))).Count

if ($diagCount -ne 1) {
    throw "Expected exactly 1 diagnostic version marker '$oldDiagnostic', found $diagCount. Refusing to modify."
}
if ($indexCount -ne 1) {
    throw "Expected exactly 1 phase1_index version marker '$oldIndex', found $indexCount. Refusing to modify."
}

$content = $content.Replace($oldDiagnostic, $newDiagnostic)
$content = $content.Replace($oldIndex, $newIndex)

Set-Content -LiteralPath $phase1 -Value $content -Encoding UTF8 -NoNewline

# Verify the mature collector now contains the V8.0.0 metadata directly.
$verified = Get-Content -LiteralPath $phase1 -Raw -Encoding UTF8
if (-not $verified.Contains($newDiagnostic)) {
    throw "Diagnostic version replacement verification failed."
}
if (-not $verified.Contains($newIndex)) {
    throw "phase1_index skill_version replacement verification failed."
}
if ($verified.Contains($oldDiagnostic) -or $verified.Contains($oldIndex)) {
    throw "Legacy 7.2.0 Phase 1 release markers still remain."
}

# This file was an internal pre-release checklist, not part of the public runtime/docs surface.
if (Test-Path $validation) {
    Remove-Item -LiteralPath $validation -Force
    Write-Host "Deleted public-repo internal checklist: V8.0.0_VALIDATION.md"
}

Write-Host ""
Write-Host "V8.0.0 source metadata fix applied successfully."
Write-Host "Modified: scripts\phase1_collect_candidates.js"
Write-Host ""
Write-Host "Recommended verification:"
Write-Host "  npm ci"
Write-Host "  npm run doctor"
Write-Host "  npm test"
