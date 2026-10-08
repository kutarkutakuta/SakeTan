$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.local"
$backupRoot = Join-Path $env:USERPROFILE "Backups\SakeTan\permanent"
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$pgDump = Join-Path $pgBin "pg_dump.exe"
$pgRestore = Join-Path $pgBin "pg_restore.exe"

if (-not (Test-Path -LiteralPath $envFile)) {
  throw ".env.local not found: $envFile"
}
if (-not (Test-Path -LiteralPath $pgDump)) {
  throw "pg_dump not found: $pgDump"
}
if (-not (Test-Path -LiteralPath $pgRestore)) {
  throw "pg_restore not found: $pgRestore"
}

$databaseLine = Get-Content -LiteralPath $envFile |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
  Select-Object -First 1
if (-not $databaseLine) {
  throw "DATABASE_URL is missing from .env.local"
}

$databaseUrl = ($databaseLine -replace '^\s*DATABASE_URL\s*=\s*', "").Trim()
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw "DATABASE_URL is empty"
}

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $backupRoot "saketan-brand-registration-$stamp.dump"

$dumpOutput = & $pgDump $databaseUrl `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file=$backupFile
$dumpExitCode = $LASTEXITCODE
if ($dumpExitCode -ne 0 -or -not (Test-Path -LiteralPath $backupFile) -or (Get-Item -LiteralPath $backupFile).Length -eq 0) {
  Remove-Item -LiteralPath $backupFile -Force -ErrorAction SilentlyContinue
  $details = ($dumpOutput | Out-String).Trim()
  throw "pg_dump failed with exit code: $dumpExitCode. $details"
}

$restoreEntries = & $pgRestore --list $backupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore validation failed with exit code: $LASTEXITCODE"
}

$file = Get-Item -LiteralPath $backupFile
$hash = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash

[PSCustomObject]@{
  path = $backupFile
  size_bytes = $file.Length
  sha256 = $hash
  created = $file.LastWriteTime.ToString("o")
  restore_entries = ($restoreEntries | Measure-Object -Line).Lines
} | ConvertTo-Json
