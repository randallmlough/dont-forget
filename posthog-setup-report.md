<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the dont-forget Expo app. Here's what was done:

- **Installed** `posthog-react-native` and `react-native-svg` (required peer dependency)
- **Created** `app.config.js` to expose `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` from `.env` via `expo-constants` extras
- **Created** `lib/posthog.ts` — the PostHog client singleton, configured via `Constants.expoConfig.extra`
- **Wrapped** the app root in `<PostHogProvider>` in `app/_layout.tsx`, with autocapture for touches and manual screen tracking via `posthog.screen()` on every route change
- **Added** `identify()` + `capture()` calls on all authentication flows: email sign-in, email sign-up, email verification, Apple SSO, and Google SSO
- **Added** `user_signed_out` capture + `posthog.reset()` on sign-out in the home screen

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User signed in with email and password | `app/sign-in.tsx` |
| `user_signed_up` | User created a new account with email and password | `app/sign-up.tsx` |
| `user_email_verified` | User verified their email address after sign-up | `app/sign-up.tsx` |
| `user_signed_in_apple` | User signed in or registered using Apple SSO | `components/auth/social-sign-in.tsx` |
| `user_signed_in_google` | User signed in or registered using Google SSO | `components/auth/social-sign-in.tsx` |
| `user_signed_out` | User signed out of their account | `app/(tabs)/index.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/408469/dashboard/1540183
- **Sign-in funnel (email vs SSO)**: https://us.posthog.com/project/408469/insights/ld0UBoaq
- **Daily sign-ins by method**: https://us.posthog.com/project/408469/insights/R43zl5Gx
- **New user sign-ups per day**: https://us.posthog.com/project/408469/insights/tswLuGbE
- **User churn (sign-outs)**: https://us.posthog.com/project/408469/insights/VKe3DQyT
- **SSO vs email registration split**: https://us.posthog.com/project/408469/insights/mTCeWrUA

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
