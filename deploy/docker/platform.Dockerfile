FROM node:24.14.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY packages/contracts/generated/typescript packages/contracts/generated/typescript
COPY apps/platform apps/platform
RUN npm run build --workspace @nop/platform
RUN find apps/platform/dist -type f -name '*.test.js' -delete \
  && rm apps/platform/dist/database/unit-test-setup.js

FROM node:24.14.0-alpine AS runtime-dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts --omit=dev --workspace @nop/platform --include-workspace-root=false

FROM node:24.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=runtime-dependencies /workspace/node_modules node_modules
COPY --from=build /workspace/apps/platform/package.json apps/platform/package.json
COPY --from=build /workspace/apps/platform/dist apps/platform/dist
COPY --from=build /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --from=build /workspace/packages/contracts/generated/typescript/index.js packages/contracts/generated/typescript/index.js
USER node
CMD ["node", "apps/platform/dist/main.js"]
