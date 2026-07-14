$ErrorActionPreference = 'Stop'

npm run verify
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
