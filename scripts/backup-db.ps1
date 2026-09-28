$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.local"
$backupRoot = Join-Path $env:USERPROFILE "Backups\SakeTan"
$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

if (-not (Test-Path -LiteralPath $envFile)) {
  throw ".env.local not found: $envFile"
}
if (-not (Test-Path -LiteralPath $pgDump)) {
  throw "pg_dump not found: $pgDump"
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
$backupFile = Join-Path $backupRoot "saketan-$stamp.dump"

& $pgDump $databaseUrl `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file=$backupFile
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $backupFile -Force -ErrorAction SilentlyContinue
  throw "pg_dump failed with exit code: $LASTEXITCODE"
}

Get-ChildItem -LiteralPath $backupRoot -Filter "saketan-*.dump" -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
  Remove-Item -Force

Write-Output "Backup completed: $backupFile"
