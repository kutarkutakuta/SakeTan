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

$allBackups = @(Get-ChildItem -LiteralPath $backupRoot -Filter "saketan-*.dump" -File |
  Sort-Object LastWriteTime -Descending
)

# 変更履歴を通常の復元に使う前提で、バックアップは災害復旧用に最小限保持する。
# - 最新の1本
# - 最新のバックアップとは別に、直近2週の各週から1本ずつ
$keepBackups = @()
if ($allBackups.Count -gt 0) {
  $keepBackups += $allBackups[0]
}

$weeklyBackups = $allBackups |
  Select-Object -Skip 1 |
  Group-Object {
    $date = $_.LastWriteTime.Date
    $daysFromMonday = ([int]$date.DayOfWeek + 6) % 7
    $date.AddDays(-$daysFromMonday).ToString("yyyy-MM-dd")
  } |
  Sort-Object Name -Descending |
  Select-Object -First 2 |
  ForEach-Object {
    $_.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }

$keepBackups += $weeklyBackups
$keepPaths = @($keepBackups | ForEach-Object { $_.FullName })

$allBackups |
  Where-Object { $keepPaths -notcontains $_.FullName } |
  Remove-Item -Force

Write-Output "Backup completed: $backupFile"
Write-Output ("Retained backups: " + $keepPaths.Count)
