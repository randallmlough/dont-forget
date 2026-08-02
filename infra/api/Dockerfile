# ---- Builder: runs `expo export` for the API routes. The app is iOS-only,
# so the web client bundle in dist/ is unused and no EXPO_PUBLIC_* vars are
# needed; app.config.ts tolerates their absence. ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Baked at export time — build arg, never runtime env.
ARG APP_ENV
ENV APP_ENV=$APP_ENV

# pnpm-workspace.yaml carries nodeLinker/overrides recorded in the lockfile;
# without it (and the tooling workspace manifest) the frozen install fails
# with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH and would hoist nothing.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tooling/package.json tooling/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm expo export --platform web --no-ssg

# ---- Runner: runs `node server.mjs` (server secrets injected by compose) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY infra/api/server.mjs ./server.mjs

# Runtime env (DATABASE_URL, CLERK_SECRET_KEY, PUBLIC_WEB_BASE_URL, RESEND_*,
# POSTHOG_*) comes from compose `environment:` ← server .env. PUBLIC_WEB_BASE_URL
# is read at src/server/http.ts:189; without it invitation links throw.

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
