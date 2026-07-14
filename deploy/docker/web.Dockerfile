FROM node:24.14.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/platform/package.json apps/platform/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY packages/contracts/generated/typescript packages/contracts/generated/typescript
COPY apps/web apps/web
RUN npm run build --workspace @nop/web

FROM node:24.14.0-alpine AS runtime-dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/platform/package.json apps/platform/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts --omit=dev --workspace @nop/web --include-workspace-root=false

FROM node:24.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --chown=node:node --from=runtime-dependencies /workspace/node_modules node_modules
COPY --from=build /workspace/apps/web/package.json apps/web/package.json
COPY --from=build /workspace/apps/web/dist apps/web/dist
EXPOSE 4173
USER node
CMD ["npm", "run", "start", "--workspace", "@nop/web", "--", "--host", "0.0.0.0", "--port", "4173"]
