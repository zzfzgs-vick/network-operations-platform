param(
    [ValidateSet('Config', 'Up', 'Smoke', 'Down', 'Clean')]
    [string]$Action = 'Smoke'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repoRoot 'deploy/compose/dev.compose.yml'

function Invoke-Compose {
    & docker compose -f $composeFile @args
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed with exit code $LASTEXITCODE"
    }
}

function Wait-Healthy([string]$Service) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $containerId = (& docker compose -f $composeFile ps -q $Service).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "could not inspect $Service"
        }
        if ($containerId) {
            $status = (& docker inspect --format '{{.State.Health.Status}}' $containerId).Trim()
            if ($status -eq 'healthy') {
                return
            }
            if ($status -eq 'unhealthy') {
                Invoke-Compose logs $Service
                throw "$Service is unhealthy"
            }
        }
        Start-Sleep -Seconds 2
    }

    Invoke-Compose logs $Service
    throw "$Service did not become healthy"
}

function Get-PublishedEndpoint([string]$Service, [int]$ContainerPort) {
    $endpoint = (& docker compose -f $composeFile port $Service $ContainerPort).Trim()
    if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^127\.0\.0\.1:(\d+)$') {
        throw "unexpected $Service endpoint: '$endpoint'"
    }
    return $endpoint
}

function Invoke-PostgresQuery([string]$Sql) {
    $output = & docker compose -f $composeFile exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' nop-smoke $Sql
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL smoke query failed'
    }
    return ($output -join "`n").Trim()
}

function Test-PostgresPersistence {
    $suffix = "${PID}_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    $markerTable = "nop_infra_smoke_$suffix"
    $markerValue = "marker_$suffix"

    Invoke-PostgresQuery "CREATE TABLE public.$markerTable (value text PRIMARY KEY); INSERT INTO public.$markerTable VALUES ('$markerValue');" | Out-Null
    Invoke-Compose stop postgres
    Invoke-Compose rm -f postgres
    Invoke-Compose up -d postgres
    Wait-Healthy postgres

    $persistedValue = Invoke-PostgresQuery "SELECT value FROM public.$markerTable;"
    if ($persistedValue -ne $markerValue) {
        throw 'PostgreSQL marker did not survive container recreation'
    }

    Invoke-PostgresQuery "DROP TABLE public.$markerTable;" | Out-Null
}

function Invoke-NativeDocker([string]$RequestedAction) {
    Push-Location $repoRoot
    try {
        switch ($RequestedAction) {
            'Config' { Invoke-Compose config --quiet }
            'Up' { Invoke-Compose up -d postgres victoriametrics vmalert }
            'Down' { Invoke-Compose --profile application down --remove-orphans }
            'Clean' { Invoke-Compose --profile application down --volumes --remove-orphans }
            'Smoke' {
                Invoke-Compose config | Out-Null
                Invoke-Compose up -d postgres victoriametrics vmalert
                Wait-Healthy postgres
                Wait-Healthy victoriametrics
                Wait-Healthy vmalert

                $victoriaMetricsEndpoint = Get-PublishedEndpoint victoriametrics 8428
                $vmalertEndpoint = Get-PublishedEndpoint vmalert 8880
                $postgresEndpoint = Get-PublishedEndpoint postgres 5432

                Invoke-WebRequest -UseBasicParsing "http://$victoriaMetricsEndpoint/-/healthy" | Out-Null
                Invoke-WebRequest -UseBasicParsing "http://$vmalertEndpoint/-/healthy" | Out-Null

                $postgresPort = [int]($postgresEndpoint.Split(':')[-1])
                $postgresConnection = [System.Net.Sockets.TcpClient]::new()
                try {
                    $postgresConnection.Connect('127.0.0.1', $postgresPort)
                }
                finally {
                    $postgresConnection.Dispose()
                }

                $schemaCount = Invoke-PostgresQuery "SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'public');"
                if ($schemaCount -ne '0') {
                    throw "expected an empty PostgreSQL instance, found '$schemaCount' user schemas"
                }

                Test-PostgresPersistence

                $running = @(& docker compose -f $composeFile ps --status running --services | Sort-Object)
                if (($running -join ',') -ne 'postgres,victoriametrics,vmalert') {
                    throw "unexpected running services: $($running -join ', ')"
                }

                Write-Host 'local infrastructure smoke passed'
            }
        }
    }
    finally {
        Pop-Location
    }
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    Invoke-NativeDocker $Action
    exit 0
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'Docker was not found. Install Docker or enable the Ubuntu-24.04 WSL environment.'
}

if ($repoRoot -notmatch '^([A-Za-z]):\\(.*)$') {
    throw "Could not translate repository path '$repoRoot' for WSL."
}
$wslRoot = "/mnt/$($Matches[1].ToLowerInvariant())/$($Matches[2].Replace('\', '/'))"

$shellAction = $Action.ToLowerInvariant()
& wsl.exe -d Ubuntu-24.04 -- sh -lc "cd '$wslRoot' && sh scripts/smoke-infra.sh '$shellAction'"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
