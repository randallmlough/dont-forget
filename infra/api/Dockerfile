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

COPY . .
RUN pnpm --filter @dont-forget/api build

FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/apps/api/dist/main.mjs /app/dist/main.mjs

USER node
EXPOSE 8080
CMD ["node", "dist/main.mjs"]
