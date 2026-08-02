FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /app

ARG APP_ENV
ENV APP_ENV=$APP_ENV

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY tooling/package.json tooling/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @dont-forget/web build

FROM nginx:1.30.4-alpine AS runner

COPY infra/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/apps/web/dist/client /usr/share/nginx/html

EXPOSE 8080
