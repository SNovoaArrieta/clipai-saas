$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $PSCommandPath
$repoRoot = Resolve-Path (Join-Path $scriptDirectory '..\..')
$manifest = Get-Content -Raw (Join-Path $scriptDirectory 'artifacts.json') | ConvertFrom-Json
$artifact = $manifest.artifacts.'win32-x64'
$destination = Join-Path $repoRoot '.artifacts\ffprobe\win32-x64'
$target = Join-Path $destination 'ffprobe.exe'
$workDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("clipai-ffprobe-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workDirectory | Out-Null
try {
  $archive = Join-Path $workDirectory $artifact.filename
  Invoke-WebRequest -Uri $artifact.url -OutFile $archive -UseBasicParsing
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  if ($actualHash -ne $artifact.sha256) {
    throw 'ffprobe artifact SHA-256 mismatch.'
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    foreach ($entry in $zip.Entries) {
      $normalized = $entry.FullName.Replace('\', '/')
      if ($normalized.StartsWith('/') -or $normalized.Split('/') -contains '..') {
        throw 'Unsafe archive entry.'
      }
    }
  } finally {
    $zip.Dispose()
  }
  $extracted = Join-Path $workDirectory 'extracted'
  Expand-Archive -LiteralPath $archive -DestinationPath $extracted
  $candidates = @(Get-ChildItem -LiteralPath $extracted -Recurse -File -Filter 'ffprobe.exe')
  if ($candidates.Count -ne 1) {
    throw 'Expected exactly one ffprobe binary.'
  }
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item -LiteralPath $candidates[0].FullName -Destination $target -Force
  $versionOutput = (& $target -version 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or -not $versionOutput.Contains('N-125365-g9a01c1cb6a')) {
    throw 'Provisioned ffprobe has an unexpected build version.'
  }
  Write-Output $target
} finally {
  if (Test-Path -LiteralPath $workDirectory) {
    Remove-Item -LiteralPath $workDirectory -Recurse -Force
  }
}
