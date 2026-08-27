param(
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL is missing. Pass -DatabaseUrl or set it temporarily in this PowerShell session."
  exit 1
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$folder = Join-Path $PSScriptRoot "..\backups"

New-Item -ItemType Directory -Force -Path $folder | Out-Null

$file = Join-Path $folder "dcurs_$timestamp.dump"

Write-Host "Creating DCURS PostgreSQL backup..."
Write-Host "Output: $file"

pg_dump `
  --dbname="$DatabaseUrl" `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file="$file"

if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup failed."
  exit $LASTEXITCODE
}

Write-Host "Backup completed successfully."
Write-Host "Keep the .dump file in a secure location outside the Render database."
