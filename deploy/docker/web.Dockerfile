FROM node:24.14.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/platform/package.json apps/platform/package.json
RUN npm ci --ignore-scripts
COPY apps/web apps/web
RUN npm run build --workspace @nop/web

FROM node:24.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --chown=node:node --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/apps/web apps/web
EXPOSE 4173
USER node
CMD ["npm", "run", "start", "--workspace", "@nop/web", "--", "--host", "0.0.0.0", "--port", "4173"]
