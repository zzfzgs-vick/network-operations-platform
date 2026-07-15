$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
    & node tests/recovery/runtime/compose-smoke.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "T009 Compose lifecycle smoke failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
