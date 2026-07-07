# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN npm ci

FROM deps AS build
COPY packages/server packages/server
RUN npm run build -w packages/server

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN npm ci --omit=dev
COPY --from=build /app/packages/server/dist packages/server/dist
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
