# Network Operations Platform

This repository is the modular-monolith workspace for the network observability and operations platform.

## Toolchain

- Node.js 24 LTS (`.node-version`)
- npm 11 (`package-lock.json` is the only Node lock file)
- Go 1.26.5 (`go.mod`)
- Windows 11 for development
- Ubuntu Server 24.04 LTS for production builds

## Development commands

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
pwsh -NoProfile -File scripts/verify.ps1
```

On Ubuntu, run the same verification through:

```text
sh scripts/verify.sh
```

## Dependency policy

- Commit `package-lock.json` and use `npm ci` in automation.
- Pin direct dependencies exactly; do not add business dependencies before the Ticket that needs them.
- Review release notes, licenses, and security advisories before upgrades, then run the full verification command.
- Use `npm audit` as an advisory input; assess findings against actual usage instead of applying unreviewed forced upgrades.
