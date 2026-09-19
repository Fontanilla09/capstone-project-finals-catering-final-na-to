$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$mysql = 'C:\xampp\mysql\bin\mysql.exe'
$database = 'cateraiDB'

if (-not (Test-Path $mysql)) {
    throw "XAMPP MySQL was not found at $mysql."
}

function Invoke-MySqlFile([string] $path) {
    Write-Host "Applying $([System.IO.Path]::GetFileName($path))..."
    Get-Content $path -Raw | & $mysql -u root
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL failed while applying $path."
    }
}

& $mysql -u root -e "CREATE DATABASE IF NOT EXISTS $database;"
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to create or access cateraiDB.'
}

$tableExists = (& $mysql -u root -N -B -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='$database' AND TABLE_NAME='users';").Trim()
if ($tableExists -eq '0') {
    Invoke-MySqlFile (Join-Path $projectRoot 'database\schema.sql')
} else {
    Write-Host 'Base schema already exists; preserving current data.'
}

Invoke-MySqlFile (Join-Path $projectRoot 'database\migration_gcash_qr.sql')
Invoke-MySqlFile (Join-Path $projectRoot 'database\migration_admin_activity_log.sql')

Write-Host "CaterAI database merge completed successfully."
