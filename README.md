# Setup, run, and deploy

## Prerequisites

Install:

- macOS with Xcode and the Xcode Command Line Tools
- Node.js 22
- Corepack with pnpm 11.9.0
- Docker Desktop or Docker Engine with Docker Compose
- GNU Make
- EAS CLI 20.1.0 or newer for device and App Store builds

Enable the repository's pnpm version and install EAS CLI:

```sh
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm add --global eas-cli
```

Physical-device and App Store builds also require an Expo account and an Apple
Developer Program membership. Sign in before building:

```sh
eas login
```

## Project setup

Install dependencies:

```sh
make install
```

Create the local environment file and fill in every required value:

```sh
cp .env.example .env.local
```

Keep one environment file per backend:

| Environment | File | `COMPOSE_FILE` |
| --- | --- | --- |
| Local | `.env.local` | `infra/docker-compose.yaml` |
| Staging | `.env.staging` | `infra/compose.staging.yaml` |
| Production | `.env.production` | `infra/compose.production.yaml` |

Never commit these files. Local, staging, and production must use separate
Postgres credentials, Clerk keys, public URLs, and PowerSync configuration.
Local and staging use Clerk development keys; production uses Clerk production
keys.

Configure the matching EAS environments in the Expo dashboard before creating
mobile builds:

| EAS environment | Used by | App environment |
| --- | --- | --- |
| `development` | `development` build profile | Local |
| `preview` | `preview` and `staging` build profiles | Staging |
| `production` | `production` build profile | Production |

At minimum, provide the client and shared values from `.env.example`, including
the Clerk publishable key, API URL, PowerSync URL, legal URLs, and PostHog
configuration. Do not put server secrets such as `DATABASE_URL`,
`CLERK_SECRET_KEY`, or `RESEND_API_KEY` in a mobile build.

## Run locally

Start Postgres and PowerSync, then apply the schema:

```sh
make infra-up APP_ENV=local
make db-migrate APP_ENV=local
```

Start the app in the iOS Simulator:

```sh
make ios APP_ENV=local
```

After the native app is installed, start Metro without rebuilding it:

```sh
make start APP_ENV=local
```

Useful local stack commands:

```sh
make infra-ps APP_ENV=local
make infra-logs APP_ENV=local
make infra-down APP_ENV=local
```

### Run locally on a physical iPhone through an Expo tunnel

This project uses custom native modules and does not run in the stock Expo Go
app. Install a development build first.

Register the iPhone with EAS, build the local development client, and install it
from the EAS build page or its QR code:

```sh
eas device:create
make eas-build APP_ENV=local
```

The development build is Apple-signed with an ad hoc provisioning profile. If
the device was registered after the build was created, rebuild before trying to
install it.

Ensure `EXPO_PUBLIC_POWERSYNC_URL` in `.env.local` is an HTTPS endpoint the
iPhone can reach. The Expo tunnel exposes Metro and the local Expo API routes;
it does not expose the separate PowerSync port.

Start Metro and the local API routes through an Expo tunnel:

```sh
APP_ENV=local pnpm exec expo start --dev-client --tunnel
```

Scan the terminal QR code with the iPhone Camera app and open it in the installed
Don't Forget Local development build.

For a USB-connected device, Xcode can create and install the development build
directly:

```sh
APP_ENV=local pnpm exec expo run:ios --device
```

## Run against staging

Create `.env.staging`, then build and launch the staging app in the iOS
Simulator:

```sh
make ios APP_ENV=staging
```

After it is installed, restart Metro without rebuilding:

```sh
make start APP_ENV=staging
```

The staging environment file must point to the deployed staging API and
PowerSync HTTPS endpoints.

## Run against production

Create `.env.production`, then build and launch the production app in the iOS
Simulator:

```sh
make ios APP_ENV=production
```

After it is installed, restart Metro without rebuilding:

```sh
make start APP_ENV=production
```

These commands connect to live production services and data. Use the staging
environment for routine validation.

## Deploy the backend

Staging and production run as isolated Docker Compose projects. Before
deploying, adapt the Compose ingress and external-network declarations to the
target hosting platform. Both the API and PowerSync services must be reachable
from the mobile app over public HTTPS endpoints.

### Deploy staging

On the deployment host, clone the repository, create `.env.staging`, and
deploy:

```sh
git clone <repo-url>
cd <checkout-directory>
cp .env.example .env.staging
# Fill in .env.staging and set COMPOSE_FILE=infra/compose.staging.yaml.
make infra-deploy APP_ENV=staging
make infra-ps APP_ENV=staging
```

Configure the hosting platform to expose the staging API and PowerSync services.
Use their public HTTPS endpoints in `.env.staging` and the EAS `preview`
environment. Clerk authenticates app requests, so the endpoints must remain
directly reachable by the mobile app.

Redeploy staging after pulling changes:

```sh
git pull --ff-only
make infra-deploy APP_ENV=staging
```

### Deploy production

On the deployment host, create `.env.production` with production-only
credentials and deploy:

```sh
cp .env.example .env.production
# Fill in .env.production and set COMPOSE_FILE=infra/compose.production.yaml.
make infra-deploy APP_ENV=production
make infra-ps APP_ENV=production
```

Configure the hosting platform to expose the production API and PowerSync
services. Use their public HTTPS endpoints in `.env.production` and the EAS
`production` environment. Production Postgres data is stored under
`infra/data/`; include it in backups. Never run
`make infra-destroy APP_ENV=production`.

Redeploy production after pulling changes:

```sh
git pull --ff-only
make infra-deploy APP_ENV=production
```

## Build and deploy the mobile app

### QR-installable local development build

Register the iPhone, create the development build, and use the EAS build QR code
to install it:

```sh
eas device:create
make eas-build APP_ENV=local
```

This build contains the native development client. Start it through Metro with
the local tunnel command shown above.

### QR-installable staging build

The `preview` profile creates a standalone staging build using EAS internal
distribution:

```sh
eas device:create
make eas-build APP_ENV=staging PROFILE=preview
```

Open the build link from EAS and scan its QR code on a registered iPhone. This
does not require TestFlight, but the binary is still Apple-signed with an ad hoc
provisioning profile.

### Staging through TestFlight

Build the App Store-distribution staging binary and submit the latest build:

```sh
make eas-build APP_ENV=staging
make submit APP_ENV=staging
```

After Apple finishes processing it, distribute the build to testers from the
Don't Forget Staging app in App Store Connect.

### Production through TestFlight and the App Store

Build the production binary and submit the latest build:

```sh
make eas-build APP_ENV=production
make submit APP_ENV=production
```

Use App Store Connect to add the processed build to TestFlight or attach it to
an App Store release and submit that release for review. `make submit` uploads
the binary; it does not release the app automatically.

### iOS signing and QR-code limitations

An iPhone cannot install an unsigned native app binary. A QR code does not
bypass Apple signing:

- EAS internal-distribution QR codes install Apple-signed ad hoc builds and only
  work on devices included in the provisioning profile.
- A Metro QR code opens JavaScript in an already-installed, signed development
  build; it does not install the native app.
- TestFlight and App Store builds are Apple-signed store-distribution binaries.
- Simulator builds do not need an App Store or ad hoc distribution profile, but
  they cannot be installed on an iPhone.

The repository currently has a QR-installable internal profile for local and
staging only. Production intentionally has only the App Store/TestFlight
profile. The project also does not configure EAS Update, so there is no
staging or production QR update path that can replace installing a compatible
signed binary.

See the official Expo documentation for
[development builds on iOS devices](https://docs.expo.dev/develop/development-builds/create-a-build/),
[tunneling](https://docs.expo.dev/more/expo-cli/#tunneling),
[internal distribution](https://docs.expo.dev/build/internal-distribution/), and
[App Store submission](https://docs.expo.dev/submit/ios/).
