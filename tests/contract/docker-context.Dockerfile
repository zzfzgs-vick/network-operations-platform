FROM node:24.14.0-alpine

COPY . /context

RUN test ! -e /context/.git \
  && test ! -e /context/.env \
  && test ! -e /context/.env.docker-context-sentinel \
  && test ! -e /context/docker-context-sentinel.pem \
  && test ! -e /context/node_modules/docker-context-sentinel.txt \
  && test ! -e /context/dist/docker-context-sentinel.txt \
  && test ! -e /context/.cache/docker-context-sentinel.txt \
  && test -f /context/package.json \
  && test -f /context/package-lock.json \
  && test -f /context/.env.example \
  && test -f /context/apps/platform/package.json \
  && test -f /context/apps/web/package.json \
  && test -f /context/packages/contracts/package.json \
  && test -f /context/packages/contracts/schemas/platform-contracts.schema.json \
  && test -f /context/packages/contracts/generated/typescript/index.js \
  && test -f /context/packages/contracts/generated/go/contracts.go \
  && test -f /context/apps/platform/src/main.ts \
  && test -f /context/apps/platform/tsconfig.build.json \
  && test -f /context/apps/web/src/App.tsx \
  && test -f /context/apps/web/tsconfig.json \
  && test -f /context/deploy/docker/platform.Dockerfile \
  && test -f /context/go.mod \
  && test -f /context/services/collector/cmd/collector/main.go
