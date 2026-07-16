$ErrorActionPreference = 'Stop'

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        0
    )
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    return $port
}

function Start-RuntimeProcess {
    param(
        [Parameter(Mandatory)] [string] $FilePath,
        [Parameter(Mandatory)] [AllowEmptyCollection()] [string[]] $ArgumentList,
        [Parameter(Mandatory)] [string] $WorkingDirectory,
        [hashtable] $Environment = @{},
        [string[]] $RemoveEnvironment = @()
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false

    foreach ($argument in $ArgumentList) {
        $startInfo.ArgumentList.Add($argument)
    }
    foreach ($name in $RemoveEnvironment) {
        [void] $startInfo.Environment.Remove($name)
    }
    foreach ($entry in $Environment.GetEnumerator()) {
        $startInfo.Environment[$entry.Key] = $entry.Value
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Failed to start $FilePath"
    }
    return $process
}

function Wait-HttpResponse {
    param(
        [Parameter(Mandatory)] [string] $Uri,
        [Parameter(Mandatory)] [scriptblock] $Assert
    )

    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 1
            & $Assert $response
            return
        }
        catch {
            Start-Sleep -Milliseconds 100
        }
    }

    throw "Runtime did not become ready: $Uri"
}

function Test-TcpConnection {
    param([Parameter(Mandatory)] [int] $Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $connection.Wait(500)) {
            return $false
        }
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Test-DockerRuntime {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        $dockerOs = & docker info --format '{{.OSType}}' 2> $null
        return $LASTEXITCODE -eq 0 -and $dockerOs.Trim() -eq 'linux'
    }
    if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
        $dockerOs = & wsl.exe -- docker info --format '{{.OSType}}' 2> $null
        return $LASTEXITCODE -eq 0 -and $dockerOs.Trim() -eq 'linux'
    }
    return $false
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$go = (Get-Command go -ErrorAction Stop).Source
Get-Command npm -ErrorAction Stop | Out-Null
$webDirectory = Join-Path $root 'apps/web'
$platformDirectory = Join-Path $root 'apps/platform'
$collectorDirectory = Join-Path $root 'services/collector'
$collectorOutput = Join-Path $collectorDirectory 'dist/collector.exe'
$processes = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$collectorServiceToken = 't008-test-only-collector-token-not-production'
$vmAlertServiceToken = 't008-test-only-vmalert-token-not-production'
$serviceSecretNames = @(
    'COLLECTOR_SERVICE_TOKEN',
    'COLLECTOR_SERVICE_TOKEN_FILE',
    'COLLECTOR_SERVICE_PREVIOUS_TOKEN',
    'COLLECTOR_SERVICE_PREVIOUS_TOKEN_FILE',
    'VMALERT_SERVICE_TOKEN',
    'VMALERT_SERVICE_TOKEN_FILE',
    'VMALERT_SERVICE_PREVIOUS_TOKEN',
    'VMALERT_SERVICE_PREVIOUS_TOKEN_FILE'
)

$env:DATABASE_HOST = '127.0.0.1'
$env:DATABASE_PORT = '5432'
$env:DATABASE_NAME = 'network_operations'
$env:DATABASE_USER = 'nop'
$env:DATABASE_PASSWORD = 'change-me-local-only'
$env:DATABASE_SSL_MODE = 'disable'
$env:DATABASE_POOL_MAX = '10'
$env:DATABASE_CONNECT_TIMEOUT_MS = '5000'
$env:DATABASE_QUERY_TIMEOUT_MS = '10000'
$env:VICTORIAMETRICS_URL = 'http://127.0.0.1:8428'
$env:VMALERT_URL = 'http://127.0.0.1:8880'
$env:PLATFORM_HEALTH_TIMEOUT_MS = '2000'
$env:WORKER_HEARTBEAT_INTERVAL_MS = '1000'
$env:WORKER_HEARTBEAT_STALE_AFTER_MS = '5000'
$env:WORKER_INSTANCE_ID = 'platform-worker-smoke'
$totpEncryptionKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
$totpKeyVersion = 't015-test-only-v1'
$totpSecretNames = @(
    'TOTP_ENCRYPTION_KEY',
    'TOTP_ENCRYPTION_KEY_FILE',
    'TOTP_ENCRYPTION_KEY_VERSION'
)

$dependencyHealthVerified = Test-DockerRuntime
if ($dependencyHealthVerified) {
    $previousTotpKey = $env:TOTP_ENCRYPTION_KEY
    $previousTotpVersion = $env:TOTP_ENCRYPTION_KEY_VERSION
    try {
        $env:TOTP_ENCRYPTION_KEY = $totpEncryptionKey
        $env:TOTP_ENCRYPTION_KEY_VERSION = $totpKeyVersion
        npm run test:integration --workspace apps/platform -- service-auth
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        npm run test:integration --workspace apps/platform -- platform-health
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally {
        $env:TOTP_ENCRYPTION_KEY = $previousTotpKey
        $env:TOTP_ENCRYPTION_KEY_VERSION = $previousTotpVersion
    }
    npm run db:migrate --workspace apps/platform
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
    Write-Warning 'Docker is unavailable; dependency readiness scenarios are covered by the Ubuntu job.'
}

foreach ($required in @(
        (Join-Path $webDirectory 'dist/index.html'),
        (Join-Path $platformDirectory 'dist/main.js'),
        (Join-Path $platformDirectory 'dist/worker.js'),
        (Join-Path $root 'node_modules/vite/bin/vite.js')
    )) {
    if (-not (Test-Path $required)) {
        throw "Missing build output: $required"
    }
}

New-Item -ItemType Directory -Force (Split-Path $collectorOutput) | Out-Null
& $go build -o $collectorOutput ./services/collector/cmd/collector
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$collectorVersion = & $collectorOutput --version
if ($collectorVersion -ne 'collector dev') {
    throw "Unexpected Collector version: $collectorVersion"
}

$missingCredentialCollector = Start-RuntimeProcess `
    -FilePath $collectorOutput `
    -ArgumentList @() `
    -WorkingDirectory $collectorDirectory `
    -RemoveEnvironment $serviceSecretNames
if (-not $missingCredentialCollector.WaitForExit(5000)) {
    $missingCredentialCollector.Kill($true)
    $missingCredentialCollector.WaitForExit()
    $missingCredentialCollector.Dispose()
    throw 'Collector without a credential did not fail fast'
}
if ($missingCredentialCollector.ExitCode -eq 0) {
    $missingCredentialCollector.Dispose()
    throw 'Collector without a credential unexpectedly succeeded'
}
$missingCredentialCollector.Dispose()

$webPort = Get-FreePort
$apiPort = Get-FreePort
$workerProbePort = Get-FreePort
$collectorHealthPort = Get-FreePort

$platformEnvironment = @{
    NODE_ENV                         = 'development'
    DATABASE_HOST                    = $env:DATABASE_HOST
    DATABASE_PORT                    = $env:DATABASE_PORT
    DATABASE_NAME                    = $env:DATABASE_NAME
    DATABASE_USER                    = $env:DATABASE_USER
    DATABASE_PASSWORD                = $env:DATABASE_PASSWORD
    DATABASE_SSL_MODE                = $env:DATABASE_SSL_MODE
    DATABASE_POOL_MAX                = $env:DATABASE_POOL_MAX
    DATABASE_CONNECT_TIMEOUT_MS      = $env:DATABASE_CONNECT_TIMEOUT_MS
    DATABASE_QUERY_TIMEOUT_MS        = $env:DATABASE_QUERY_TIMEOUT_MS
    VICTORIAMETRICS_URL              = $env:VICTORIAMETRICS_URL
    VMALERT_URL                      = $env:VMALERT_URL
    PLATFORM_HEALTH_TIMEOUT_MS       = $env:PLATFORM_HEALTH_TIMEOUT_MS
    WORKER_HEARTBEAT_INTERVAL_MS     = $env:WORKER_HEARTBEAT_INTERVAL_MS
    WORKER_HEARTBEAT_STALE_AFTER_MS  = $env:WORKER_HEARTBEAT_STALE_AFTER_MS
    WORKER_INSTANCE_ID               = $env:WORKER_INSTANCE_ID
}
if (-not $dependencyHealthVerified) {
    $platformEnvironment.DATABASE_STARTUP_CHECK = 'disabled'
    $platformEnvironment.NODE_ENV = 'test'
}

try {
    $web = Start-RuntimeProcess -FilePath $node -ArgumentList @(
        (Join-Path $root 'node_modules/vite/bin/vite.js'),
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        [string] $webPort,
        '--strictPort'
    ) -WorkingDirectory $webDirectory
    $processes.Add($web)

    $api = Start-RuntimeProcess -FilePath $node -ArgumentList @(
        (Join-Path $platformDirectory 'dist/main.js')
    ) -WorkingDirectory $platformDirectory `
        -RemoveEnvironment $serviceSecretNames `
        -Environment ($platformEnvironment + @{
            HOST = '127.0.0.1'
            PORT = [string] $apiPort
            COLLECTOR_SERVICE_TOKEN = $collectorServiceToken
            VMALERT_SERVICE_TOKEN = $vmAlertServiceToken
            TOTP_ENCRYPTION_KEY = $totpEncryptionKey
            TOTP_ENCRYPTION_KEY_VERSION = $totpKeyVersion
        })
    $processes.Add($api)

    $worker = Start-RuntimeProcess -FilePath $node -ArgumentList @(
        (Join-Path $platformDirectory 'dist/worker.js')
    ) -WorkingDirectory $platformDirectory `
        -RemoveEnvironment ($serviceSecretNames + $totpSecretNames) `
        -Environment ($platformEnvironment + @{
            PORT = [string] $workerProbePort
        })
    $processes.Add($worker)

    $collector = Start-RuntimeProcess -FilePath $collectorOutput `
        -ArgumentList @() `
        -WorkingDirectory $collectorDirectory `
        -RemoveEnvironment $serviceSecretNames `
        -Environment @{
            COLLECTOR_HEALTH_LISTEN_ADDRESS = "127.0.0.1:$collectorHealthPort"
            COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS = '2000'
            COLLECTOR_SERVICE_TOKEN = $collectorServiceToken
        }
    $processes.Add($collector)

    Wait-HttpResponse -Uri "http://127.0.0.1:$webPort" -Assert {
        param($response)
        if ($response.Content -notmatch 'Network Operations Platform') {
            throw 'Web runtime identity is missing'
        }
    }

    Wait-HttpResponse -Uri "http://127.0.0.1:$apiPort" -Assert {
        param($response)
        $body = $response.Content | ConvertFrom-Json
        if ($body.service -ne 'platform-api' -or $body.version -ne 'dev') {
            throw 'API runtime identity is invalid'
        }
    }

    Wait-HttpResponse -Uri "http://127.0.0.1:$apiPort/health/live" -Assert {
        param($response)
        $body = $response.Content | ConvertFrom-Json
        if ($body.status -ne 'ALIVE') { throw 'API liveness is invalid' }
    }

    Wait-HttpResponse -Uri "http://127.0.0.1:$apiPort/metrics" -Assert {
        param($response)
        if ($response.Content -notmatch 'nop_runtime_dependency_available') {
            throw 'API runtime metrics are missing'
        }
        if ($response.Content -notmatch 'nop_runtime_configuration_loaded\{category="runtime"\} 1') {
            throw 'API configuration-loaded metric is missing'
        }
    }

    Wait-HttpResponse -Uri "http://127.0.0.1:$collectorHealthPort/health/ready" -Assert {
        param($response)
        $body = $response.Content | ConvertFrom-Json
        if ($body.status -ne 'READY') { throw 'Collector readiness is invalid' }
    }

    if ($dependencyHealthVerified) {
        Wait-HttpResponse -Uri "http://127.0.0.1:$apiPort/health/ready" -Assert {
            param($response)
            $body = $response.Content | ConvertFrom-Json
            if ($body.status -ne 'READY') { throw 'API readiness is invalid' }
        }
        Invoke-WebRequest -Uri 'http://127.0.0.1:8428/-/healthy' -TimeoutSec 2 | Out-Null
        Invoke-WebRequest -Uri 'http://127.0.0.1:8880/-/healthy' -TimeoutSec 2 | Out-Null
        if (-not (Test-TcpConnection -Port 5432)) { throw 'PostgreSQL is unavailable' }
    }

    Start-Sleep -Milliseconds 500
    if ($worker.HasExited) {
        throw 'Platform Worker exited unexpectedly'
    }
    if (Test-TcpConnection -Port $workerProbePort) {
        throw 'Platform Worker opened an HTTP listener'
    }
    if ($collector.HasExited) {
        throw 'Collector exited unexpectedly'
    }

    Write-Output "Web runtime: PASS (http://127.0.0.1:$webPort)"
    Write-Output "API runtime: PASS (http://127.0.0.1:$apiPort)"
    Write-Output "Worker runtime: PASS (no listener on $workerProbePort)"
    Write-Output 'Collector runtime: PASS (version and running process)'
    if ($dependencyHealthVerified) {
        Write-Output 'Dependency readiness: PASS (PostgreSQL, VictoriaMetrics, vmalert, Worker heartbeat, failure and recovery)'
    }
}
finally {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            $process.Kill($true)
            $process.WaitForExit()
        }
        $process.Dispose()
    }
}
