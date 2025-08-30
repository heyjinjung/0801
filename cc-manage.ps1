#!/usr/bin/env pwsh

param (
    [string]$Command,
    [string]$Service
)

# Compose file to use
$ComposeFile = "docker-compose.yml"

# Build compose args with optional local override
function Get-ComposeArgs {
    $argsList = @('-f', $ComposeFile)
    $localOverride = "docker-compose.override.local.yml"
    if (Test-Path $localOverride) {
        $argsList += @('-f', $localOverride)
    }
    return ,$argsList
}

# Detect Docker & Compose (v2 preferred, fallback to v1)
$UseComposeV2 = $true
function Test-DockerInstalled {
    try { & docker --version *> $null; return $true } catch { return $false }
}
function Test-Compose {
    if (-not (Test-DockerInstalled)) {
        Write-Host "Docker Desktop is not installed or the engine is not running." -ForegroundColor Red
        Write-Host "Start Docker Desktop, then retry. (C: Program Files Docker Docker Docker Desktop.exe)" -ForegroundColor Yellow
        exit 1
    }
    try { & docker info *> $null } catch {
        Write-Host "Docker Engine is not running. Start Docker Desktop and wait until it says 'Running'." -ForegroundColor Red
        exit 1
    }
    try { & docker compose version *> $null; $script:UseComposeV2 = $true; return }
    catch {}
    try { & docker-compose --version *> $null; $script:UseComposeV2 = $false; return }
    catch {
        Write-Host "Docker Compose not found (neither 'docker compose' nor 'docker-compose')." -ForegroundColor Red
        Write-Host "Update Docker Desktop to a recent version." -ForegroundColor Yellow
        exit 1
    }
}
function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
    $envArgs = @()
    if (Test-Path ".env.local") { $envArgs += @('--env-file', '.env.local') }
    # Force compose to use .env.development to avoid BOM issues in .env
    if (Test-Path ".env.development") { $env:COMPOSE_DOTENV_PATH = (Join-Path (Get-Location) ".env.development") }
    if ($UseComposeV2) { & docker @('compose') @envArgs @Args }
    else { & docker-compose @envArgs @Args }
}

# Normalize legacy service aliases to actual compose service names
function Resolve-ServiceName($name) {
    if (-not $name) { return $null }
    $map = @{ db = 'postgres'; api = 'backend'; web = 'frontend' }
    if ($map.ContainsKey($name)) { return $map[$name] }
    return $name
}

function Start-Environment {
    Test-Compose
    # Ensure .env exists (auto-copy from .env.development if present)
    try {
        if (-not (Test-Path ".env") -and (Test-Path ".env.development")) {
            $content = Get-Content ".env.development" -Raw
            # Force UTF8 without BOM to avoid docker compose parse errors
            [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $content, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "Created .env from .env.development (auto)" -ForegroundColor Yellow
        }
    } catch {}
    Write-Host "Starting Casino-Club F2P environment..." -ForegroundColor Cyan
    # Fix .env BOM issues (rewrite UTF-16 -> UTF-8 without BOM if detected)
    try {
        $envPath = ".env"
        if (Test-Path $envPath) {
            $bytes = [System.IO.File]::ReadAllBytes($envPath)
            if ($bytes.Length -ge 2) {
                $isUtf16Le = ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE)
                $isUtf16Be = ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF)
                if ($isUtf16Le -or $isUtf16Be) {
                    $text = [System.Text.Encoding]::Unicode.GetString($bytes)
                    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $envPath), $text, (New-Object System.Text.UTF8Encoding($false)))
                    Write-Host "Rewrote .env as UTF-8 (no BOM)" -ForegroundColor Yellow
                }
                elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
                    # UTF-8 BOM detected → rewrite without BOM
                    $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
                    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $envPath), $text, (New-Object System.Text.UTF8Encoding($false)))
                    Write-Host "Stripped UTF-8 BOM from .env (rewritten as UTF-8 without BOM)" -ForegroundColor Yellow
                }
            }
        }
    } catch {}
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs up -d --build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to start containers. Check Docker Desktop is running and try logs." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Environment started!" -ForegroundColor Green
    Show-Status
    $usingOverride = Test-Path "docker-compose.override.local.yml"
    if ($usingOverride) {
        Write-Host "Frontend: http://localhost:3001" -ForegroundColor Yellow
        Write-Host "Backend API: http://localhost:8001" -ForegroundColor Yellow
    Write-Host "Database: localhost:5433 (User: cc_user, Password: cc_password, DB: cc_webapp)" -ForegroundColor Yellow
    } else {
        Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
        Write-Host "Backend API: http://localhost:8000" -ForegroundColor Yellow
        Write-Host "Database: localhost:5432 (User: cc_user, Password: cc_password, DB: cc_webapp)" -ForegroundColor Yellow
    }
}

function Stop-Environment {
    Test-Compose
    Write-Host "Stopping Casino-Club F2P environment..." -ForegroundColor Cyan
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs down
    Write-Host "Environment stopped!" -ForegroundColor Green
}

function Show-Logs {
    Test-Compose
    $resolved = Resolve-ServiceName $Service
    if ($resolved) {
        Write-Host "Showing logs for $resolved..." -ForegroundColor Cyan
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs logs -f $resolved
    } else {
        Write-Host "Showing all logs..." -ForegroundColor Cyan
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs logs -f
    }
}

function Show-Status {
    Test-Compose
    Write-Host "Checking environment status..." -ForegroundColor Cyan
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs ps
}

function Start-Tools {
    Test-Compose
    Write-Host "Starting monitoring tools (Prometheus/Grafana/Metabase)..." -ForegroundColor Cyan
    $file = "docker-compose.monitoring.yml"
    if (-not (Test-Path $file)) { Write-Host "Monitoring compose file not found: $file" -ForegroundColor Red; exit 1 }
    # Render Prometheus rule templates with ENV thresholds before starting
    $renderScript = Join-Path (Get-Location) 'scripts/render_prometheus_rules.ps1'
    if (Test-Path $renderScript) {
        try {
            Write-Host "Rendering Prometheus rule templates..." -ForegroundColor Yellow
            & $renderScript
        } catch {
            Write-Host "Rule template rendering failed (continuing with existing rules): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    if ($UseComposeV2) { & docker compose -f $file up -d }
    else { & docker-compose -f $file up -d }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to start monitoring tools" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Monitoring tools started!" -ForegroundColor Green
}

function Stop-Tools {
    Test-Compose
    Write-Host "Stopping monitoring tools..." -ForegroundColor Cyan
    $file = "docker-compose.monitoring.yml"
    if ($UseComposeV2) { & docker compose -f $file down }
    else { & docker-compose -f $file down }
    Write-Host "Monitoring tools stopped!" -ForegroundColor Green
}

function Get-ToolsStatus {
    Test-Compose
    Write-Host "Checking monitoring tools status..." -ForegroundColor Cyan
    $file = "docker-compose.monitoring.yml"
    if ($UseComposeV2) { & docker compose -f $file ps }
    else { & docker-compose -f $file ps }
}

function Enter-Container {
    Test-Compose
    if (-not $Service) {
        Write-Host "Error: Service name is required" -ForegroundColor Red
        Write-Host "Usage: ./cc-manage.ps1 shell <service_name> (postgres, backend, or frontend)" -ForegroundColor Yellow
        exit 1
    }

    $resolved = Resolve-ServiceName $Service
    Write-Host "Entering $resolved container..." -ForegroundColor Cyan
    if ($resolved -eq "postgres") {
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs exec postgres psql -U cc_user -d cc_webapp
    } elseif ($resolved -eq "backend" -or $resolved -eq "frontend") {
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs exec $resolved /bin/sh
    } else {
        Write-Host "Error: Unknown service '$Service'" -ForegroundColor Red
        Write-Host "Available services: postgres, backend, frontend" -ForegroundColor Yellow
        exit 1
    }
}

function Test-Prerequisites {
    Write-Host "Running environment checks..." -ForegroundColor Cyan
    Test-Compose
    # Ensure .env exists (auto-copy from .env.development if present)
    try {
        if (-not (Test-Path ".env") -and (Test-Path ".env.development")) {
            $content = Get-Content ".env.development" -Raw
            [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $content, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "Created .env from .env.development (auto)" -ForegroundColor Yellow
        }
    } catch {}
    Write-Host "✔ Docker detected" -ForegroundColor Green
    try { Invoke-Compose -f $ComposeFile config *> $null; Write-Host "✔ Compose file valid" -ForegroundColor Green } catch { Write-Host "✖ Compose file invalid" -ForegroundColor Red; exit 1 }
    # Quick port checks
    $ports = @(3000,8000,5432)
    if (Test-Path "docker-compose.override.local.yml") {
        $ports = @(3001,8001,5433)
    }
    foreach ($p in $ports) {
        $inUse = (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $p }).Count -gt 0
        if ($inUse) { Write-Host "⚠ Port $p is already in use" -ForegroundColor Yellow } else { Write-Host "✔ Port $p is free" -ForegroundColor Green }
    }
    Write-Host "Done." -ForegroundColor Cyan
}

function Test-Health {
    Write-Host "Probing service health..." -ForegroundColor Cyan
    $apiPort = 8000
    $webPort = 3000
    if (Test-Path "docker-compose.override.local.yml") {
        $apiPort = 8001
        $webPort = 3001
    }
    if (Test-Path ".env.local") {
        $lines = Get-Content .env.local
        foreach ($l in $lines) {
            if ($l -match '^BACKEND_PORT=(\d+)$') { $apiPort = [int]$Matches[1] }
            if ($l -match '^FRONTEND_PORT=(\d+)$') { $webPort = [int]$Matches[1] }
        }
    }
    try { $api = Invoke-RestMethod -Uri "http://localhost:$apiPort/health" -TimeoutSec 5; Write-Host ("API /health => {0}" -f ($api.status)) -ForegroundColor Green } catch { Write-Host "API not responding on http://localhost:$apiPort/health" -ForegroundColor Yellow }
    try { $web = Invoke-WebRequest -Uri "http://localhost:$webPort" -UseBasicParsing -TimeoutSec 5; Write-Host ("Web / => {0}" -f $web.StatusCode) -ForegroundColor Green } catch { Write-Host "Web not responding on http://localhost:$webPort" -ForegroundColor Yellow }
}

function Test-DBConnection {
    Write-Host "Checking database connectivity..." -ForegroundColor Cyan
    Test-Compose

    # Host port check
    $dbPort = 5432
    if (Test-Path "docker-compose.override.local.yml") { $dbPort = 5433 }
    if (Test-Path ".env.local") {
        $lines = Get-Content .env.local
        foreach ($l in $lines) { if ($l -match '^POSTGRES_PORT=(\d+)$') { $dbPort = [int]$Matches[1] } }
    }
    try {
        $tcp = Test-NetConnection -ComputerName 'localhost' -Port $dbPort -WarningAction SilentlyContinue
        if ($tcp.TcpTestSucceeded) { Write-Host "✔ Host port $dbPort reachable" -ForegroundColor Green }
        else { Write-Host "✖ Host port $dbPort not reachable" -ForegroundColor Red }
    } catch { Write-Host "⚠ Unable to run Test-NetConnection (PowerShell version?)" -ForegroundColor Yellow }

    # Container readiness
    try {
        Write-Host "→ Running pg_isready in postgres container" -ForegroundColor Yellow
    $composeArgs = Get-ComposeArgs
    # Use shell wrapper to avoid Windows/PowerShell arg parsing oddities
    Invoke-Compose @composeArgs exec postgres /bin/sh -lc "pg_isready -U cc_user -d cc_webapp"
    } catch { Write-Host "✖ pg_isready failed (Is postgres container running?)" -ForegroundColor Red }

    # Simple SQL query
    try {
        Write-Host "→ Running SELECT 1; via psql" -ForegroundColor Yellow
    $composeArgs = Get-ComposeArgs
    Invoke-Compose @composeArgs exec postgres psql -U cc_user -d cc_webapp -c 'SELECT 1;'
    } catch { Write-Host "✖ psql test query failed" -ForegroundColor Red }

    Write-Host "DB check complete." -ForegroundColor Cyan
}

function Show-Help {
    Write-Host "Casino-Club F2P Management Script" -ForegroundColor Green
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host "Usage: ./cc-manage.ps1 <command> [options]" -ForegroundColor Yellow
    Write-Host "" 
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  start       Start the environment" -ForegroundColor White
    Write-Host "  stop        Stop the environment" -ForegroundColor White
    Write-Host "  logs        Show logs (all services or specific service)" -ForegroundColor White
    Write-Host "  status      Show container status" -ForegroundColor White
    Write-Host "  shell       Enter shell in a container" -ForegroundColor White
    Write-Host "  check       Verify prerequisites (Docker, ports, compose)" -ForegroundColor White
    Write-Host "  health      Probe http://localhost:8000/health and :3000" -ForegroundColor White
    Write-Host "  db-check    Verify PostgreSQL connectivity (port, pg_isready, SELECT 1)" -ForegroundColor White
    Write-Host "  tools       Manage monitoring tools (usage: tools start|stop|status)" -ForegroundColor White
    Write-Host "  help        Show this help" -ForegroundColor White
    Write-Host "" 
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  ./cc-manage.ps1 check" -ForegroundColor White
    Write-Host "  ./cc-manage.ps1 start" -ForegroundColor White
    Write-Host "  ./cc-manage.ps1 db-check" -ForegroundColor White
    Write-Host "  ./cc-manage.ps1 logs backend" -ForegroundColor White
    Write-Host "  ./cc-manage.ps1 shell postgres" -ForegroundColor White
}

# Main script execution
switch ($Command) {
    "start" { Start-Environment }
    "stop" { Stop-Environment }
    "logs" { Show-Logs }
    "status" { Show-Status }
    "shell" { Enter-Container }
    "check" { Test-Prerequisites }
    "health" { Test-Health }
    "db-check" { Test-DBConnection }
    "tools" {
        switch ($Service) {
            "start" { Start-Tools }
            "stop" { Stop-Tools }
            "status" { Get-ToolsStatus }
            default { Write-Host "Usage: ./cc-manage.ps1 tools <start|stop|status>" -ForegroundColor Yellow }
        }
    }
    "help" { Show-Help }
    default { Show-Help }
}
