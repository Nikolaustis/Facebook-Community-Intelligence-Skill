param(
  [string]$Cdp = "http://127.0.0.1:9222",
  [string]$UserDataDir = "",
  [string]$BrowserPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-BrowserPath {
  param([string]$ExplicitPath)

  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) { $candidates += $ExplicitPath }
  if (-not [string]::IsNullOrWhiteSpace($env:FBM_BROWSER_PATH)) { $candidates += $env:FBM_BROWSER_PATH }

  $registryKeys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe'
  )
  foreach ($key in $registryKeys) {
    try {
      $item = Get-ItemProperty -Path $key -ErrorAction Stop
      if ($item.'(default)') { $candidates += $item.'(default)' }
      elseif ($item.PSObject.Properties.Name -contains '') { $candidates += $item.'' }
    } catch { }
  }

  $candidates += @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
  )

  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }
  return ""
}

function Test-CdpEndpoint {
  param([string]$BaseUrl)
  try {
    $base = $BaseUrl.TrimEnd('/')
    $response = Invoke-RestMethod -Uri "$base/json/version" -TimeoutSec 2 -Method Get
    return [bool]($response -and ($response.Browser -or $response.webSocketDebuggerUrl))
  } catch {
    return $false
  }
}

$uri = $null
try { $uri = [Uri]$Cdp } catch { throw "Invalid CDP URL: $Cdp" }
if ($uri.Scheme -notin @('http', 'https')) { throw "CDP URL must use http/https: $Cdp" }
if ($uri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
  throw "This launcher only starts a local browser. CDP host must be localhost/127.0.0.1: $Cdp"
}
$port = if ($uri.Port -gt 0) { $uri.Port } else { 9222 }

if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
  if (-not [string]::IsNullOrWhiteSpace($env:FBM_BROWSER_PROFILE)) {
    $UserDataDir = $env:FBM_BROWSER_PROFILE
  } else {
    $UserDataDir = Join-Path $env:LOCALAPPDATA 'FacebookGameGroupMonitor\browser-profile'
  }
}
New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null
$UserDataDir = (Resolve-Path $UserDataDir).Path

if (Test-CdpEndpoint -BaseUrl $Cdp) {
  Write-Host "A Chromium CDP browser is already available at $Cdp. Reusing it."
  Write-Host "Run 'npm run validate-login' to verify the Facebook session."
  exit 0
}

$browser = Resolve-BrowserPath -ExplicitPath $BrowserPath
if ([string]::IsNullOrWhiteSpace($browser)) {
  throw "No supported Chromium browser was found. Install Google Chrome or Microsoft Edge, or pass -BrowserPath / set FBM_BROWSER_PATH."
}

Start-Process -FilePath $browser -ArgumentList @(
  "--remote-debugging-port=$port",
  "--user-data-dir=$UserDataDir",
  "--no-first-run",
  "--no-default-browser-check",
  "https://www.facebook.com/"
)

Write-Host "Browser started: $browser"
Write-Host "CDP=$Cdp"
Write-Host "UserDataDir=$UserDataDir"
Write-Host "Log in to Facebook manually, then run 'npm run validate-login'."
