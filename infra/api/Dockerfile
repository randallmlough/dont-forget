# ---- Builder: runs `expo export` (bakes EXPO_PUBLIC_* into dist/) ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Baked at export time — build args, never runtime env.
ARG APP_ENV
ARG EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_POWERSYNC_URL
ENV APP_ENV=$APP_ENV \
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY \
    EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL \
    EXPO_PUBLIC_POWERSYNC_URL=$EXPO_PUBLIC_POWERSYNC_URL

COPY package.json pnpm-lock.yaml ./
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

# Runtime env (DATABASE_URL, CLERK_SECRET_KEY, PUBLIC_APP_BASE_URL, RESEND_*,
# POSTHOG_*) comes from compose `environment:` ← server .env. PUBLIC_APP_BASE_URL
# is read at src/server/http.ts:189; without it invitation links throw.

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
