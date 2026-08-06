FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY tooling/package.json tooling/package.json
RUN pnpm install --frozen-lockfile

ARG APP_ENV
ENV APP_ENV=$APP_ENV

COPY . .
RUN pnpm --filter @dont-forget/web build

FROM nginx:1.30.4-alpine AS runner

COPY infra/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/apps/web/dist/client /usr/share/nginx/html

EXPOSE 8080
