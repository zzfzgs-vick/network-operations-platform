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
        [hashtable] $Environment = @{}
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false

    foreach ($argument in $ArgumentList) {
        $startInfo.ArgumentList.Add($argument)
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

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$go = (Get-Command go -ErrorAction Stop).Source
$webDirectory = Join-Path $root 'apps/web'
$platformDirectory = Join-Path $root 'apps/platform'
$collectorDirectory = Join-Path $root 'services/collector'
$collectorOutput = Join-Path $collectorDirectory 'dist/collector.exe'
$processes = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

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

$webPort = Get-FreePort
$apiPort = Get-FreePort
$workerProbePort = Get-FreePort

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
    ) -WorkingDirectory $platformDirectory -Environment @{
        HOST = '127.0.0.1'
        PORT = [string] $apiPort
    }
    $processes.Add($api)

    $worker = Start-RuntimeProcess -FilePath $node -ArgumentList @(
        (Join-Path $platformDirectory 'dist/worker.js')
    ) -WorkingDirectory $platformDirectory -Environment @{
        PORT = [string] $workerProbePort
    }
    $processes.Add($worker)

    $collector = Start-RuntimeProcess -FilePath $collectorOutput `
        -ArgumentList @() `
        -WorkingDirectory $collectorDirectory
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
