FROM node:24.14.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts
COPY apps/platform apps/platform
RUN npm run build --workspace @nop/platform

FROM node:24.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/apps/platform/package.json apps/platform/package.json
COPY --from=build /workspace/apps/platform/dist apps/platform/dist
USER node
CMD ["node", "apps/platform/dist/main.js"]
