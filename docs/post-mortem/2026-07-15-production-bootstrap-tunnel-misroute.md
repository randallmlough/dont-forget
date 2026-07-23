# Production bootstrap failed: Cloudflare tunnel pointed at the wrong container

Date: 2026-07-15

Status: Resolved

## Summary

The first production deployment of the API stack never served a single successful
`POST /api/bootstrap`. Every production sign-in reached Clerk successfully, then
failed Authenticated App Session activation with the generic client message
`Unable to prepare your Household. Please try again.` The Cloudflare tunnel's
public hostname for the production API pointed at the wrong container name, so
requests never reached `dontforget-prod-api`. Once the tunnel service was
corrected, the Household provisioned immediately.

This was not a regression: PostHog showed the production bundle
(`com.dont-forget.app`) had zero `authenticated_app_session_loaded` events ever.
All prior successes came from the `.local` and `.staging` bundles, which share
the same PostHog project token and blend together in the logs view.

## Impact

- 100% of production bootstrap attempts failed from the first production deploy
  (compose stack added 2026-07-15 15:26 PDT) until the tunnel fix
  (~2026-07-15 22:13 PDT).
- Two Users were affected during the observed failure window,
  2026-07-16 04:05–04:57 UTC (2026-07-15 21:05–21:57 PDT); both were internal
  test accounts. No external Users existed yet.
- Affected Users could sign in via Clerk but could never enter the app: sign-in
  succeeded, session activation failed, and both Users signed out.

## Detection

Manual testing of the production app surfaced the client error. PostHog held
only the client half of the story:

- 7 identical error logs from `posthog-react-native`:
  `authenticated app session activation failed` with
  `Unable to prepare your Household. Please try again.`, all
  `deployment.environment: production`.
- No server-side logs of any kind — the only log service in PostHog is the
  client SDK.
- Event trails showed `$identify` and `user_signed_up` firing normally, then
  `settings_opened` and `user_signed_out`: Clerk auth worked, only the bootstrap
  API call failed.
- Splitting events by `$app_namespace` showed every historical bootstrap success
  belonged to `com.dont-forget.app.local` or `com.dont-forget.app.staging`;
  production had none.

## Diagnosis path

The client throws the generic message for any non-2xx response
(`src/client/session/bootstrap.ts`), discarding the status code and body, so
PostHog could not distinguish 401 vs 500 vs a tunnel-level 404/502.

`docker logs dontforget-prod-api` showed only the startup line. Because
`handleBootstrap` (`src/server/bootstrap/api.ts`) always logs
`Bootstrap API failed` before returning 500, the silent log ruled out the
database/migration failure class. That left two silent-by-design candidates:

1. 401 from `verifyClerkRequest` — returned without logging (Clerk instance
   mismatch between the prod build and the prod server env).
2. Requests never reaching the container — tunnel misroute.

Checking the Cloudflare tunnel configuration confirmed candidate 2: the public
hostname's service pointed at a container name that matched neither
`dontforget-staging-api` nor `dontforget-prod-api`. The stale example in
`infra/README.md` (`dontforget-api:8080`) predates the production stack and
matches the misconfigured value's shape.

## Root Causes

### 1. Tunnel hostname configured against a stale container name

The production compose stack introduced the `dontforget-prod-api` container
name, but the Cloudflare tunnel public hostname was configured with a
different (stale) service name, so the tunnel could not route requests to the
running container.

### 2. Documentation carried the stale name

`infra/README.md` documents the tunnel setup with `dontforget-api:8080`, which
matches neither the staging nor the production container name. Configuration
done from the doc reproduces the failure.

### 3. The failure was indistinguishable at every observable layer

- The client collapses all non-2xx bootstrap responses (and tunnel-level
  responses) into one generic error without the HTTP status.
- The server logs nothing on the 401 path and nothing on requests it never
  receives, and its `console.error` output is not shipped to PostHog anyway.
- All app environments report to one PostHog project with no environment
  property on analytics events (only logs carry `deployment.environment`),
  so "production has never worked" was hidden inside aggregate success counts.

## Fix

Corrected the Cloudflare tunnel public hostname service to
`dontforget-prod-api:8080`. No code change was required.

## Verification

PostHog recorded the first-ever production
`authenticated_app_session_loaded` event at 2026-07-16 05:13 UTC for one of
the previously failing Users on `com.dont-forget.app`, immediately after the
tunnel correction. The Household provisioned and the User entered the app.

## Follow-up Work

### Fix the tunnel hostname example in infra/README.md

Update the documented service names to the real container names for both
environments (`dontforget-staging-api:8080`, `dontforget-prod-api:8080`) so
tunnel configuration done from the doc cannot reintroduce the misroute.

### Include the HTTP status in the client bootstrap error

`src/client/session/bootstrap.ts` should carry `response.status` (and ideally
a short body excerpt) in the thrown error so the PostHog client log
distinguishes 401 vs 500 vs tunnel-level 404/502. This single change would
have reduced this diagnosis from hours to minutes.

### Log the 401 path on the server

`handleBootstrap` returns `UnauthorizedError` silently. A single log line on
that path separates "Clerk rejected the token" from "no request arrived",
which were indistinguishable during this incident.

### Ship server logs to PostHog

The API's `console.error` output lives only in container stdout on the
homelab. Shipping server logs (or `$exception` capture) to PostHog would put
server-side stack traces next to the client logs where diagnosis starts.

### Add a post-deploy smoke check

An unauthenticated `curl -si -X POST https://<api-host>/api/bootstrap` through
the public hostname must return this API's 401 JSON. Anything else (404, 502,
Cloudflare HTML) means the route is broken before auth. Fold this into the
deploy playbook or a `make` target so the first request through new
infrastructure is a check, not a User.
