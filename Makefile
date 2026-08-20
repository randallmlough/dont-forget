# ==================================================================================== #
# COMMANDS
# ==================================================================================== #

PNPM ?= pnpm
GITLEAKS ?= gitleaks
APP_ENV_VALUE = $(if $(APP_ENV),$(APP_ENV),local)
# Expo CLI's built-in dotenv support always loads .env.local, which would shadow
# .env.$(APP_ENV); loadEnvFile() in app.config.ts is the single env loader.
export EXPO_NO_DOTENV = 1
PORT_ARG = $(if $(PORT),--port $(PORT),)
COMPOSE ?= docker compose
override INFRA_COMPOSE_FILE = $(if $(filter local,$(APP_ENV_VALUE)),infra/docker-compose.yaml,$(if $(filter staging,$(APP_ENV_VALUE)),infra/compose.staging.yaml,$(if $(filter production,$(APP_ENV_VALUE)),infra/compose.production.yaml,)))
INFRA_COMPOSE = $(COMPOSE) --env-file .env.$(APP_ENV_VALUE) -f $(INFRA_COMPOSE_FILE)

.DEFAULT_GOAL := help

##@ Common

.PHONY: install
install: ## Install dependencies *common*
	@$(PNPM) install

.PHONY: worktree-env
worktree-env: ## Link/copy .env.local and generate checkout-local API/web ports
	@./tooling/scripts/setup_worktree_env.sh

.PHONY: worktree-db
worktree-db: ## Create an isolated per-worktree directory DB and point .env.local at it
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/db worktree:db

.PHONY: worktree-db-destroy
worktree-db-destroy: ## Delete this worktree's directory DB plus its Household DBs and restore .env.local
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/db worktree:db:destroy

.PHONY: start
start: ## Start Expo for normal app development *common*
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile dev -- $(PORT_ARG)

.PHONY: api
api: ## Start the standalone API server in watch mode *common*
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/api dev

.PHONY: web
web: ## Start the dedicated public web link surface *common*
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/web dev

.PHONY: web-build
web-build: ## Build and verify the dedicated public web link surface
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/web build

.PHONY: api-build
api-build: ## Build and verify the standalone API artifact
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) turbo run build --filter @dont-forget/api

.PHONY: ios
ios: ## Run the native iOS target *common*
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile ios -- $(PORT_ARG)

.PHONY: prebuild
prebuild: ## Generate the native iOS project. Use `make prebuild -- --clean` to pass --clean
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile prebuild -- $(if $(filter --clean,$(MAKECMDGOALS)),--clean,)

.PHONY: --clean
--clean:
	@:

# eas.json build profiles are named after APP_ENV except local, whose profile is "development".
# PROFILE overrides the mapping (e.g. PROFILE=preview for a QR-installable staging build).
EAS_BUILD_PROFILE = $(if $(PROFILE),$(PROFILE),$(if $(filter local,$(APP_ENV_VALUE)),development,$(APP_ENV_VALUE)))
# Skips eas-cli's Apple team picker during credential setup; must match appleTeamId in eas.json.
APPLE_TEAM_ID = D64V4GPNLJ

.PHONY: eas-build
eas-build: ## Build on EAS for the selected environment (APP_ENV, default local; PROFILE overrides)
	cd apps/mobile && APP_ENV="$(APP_ENV_VALUE)" EXPO_APPLE_TEAM_ID="$(APPLE_TEAM_ID)" eas build --profile $(EAS_BUILD_PROFILE) --platform ios

.PHONY: submit
submit: ## Submit the latest EAS build for the selected environment to TestFlight/App Store
	@cd apps/mobile && APP_ENV="$(APP_ENV_VALUE)" eas submit --profile $(APP_ENV_VALUE) --platform ios --latest

.PHONY: storybook
storybook: ## Start Storybook for the native iOS build *common*
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile storybook:start -- $(PORT_ARG)

.PHONY: verify
verify: typecheck biome-check eslint-rules lint test-ci ## Run typecheck, Biome, lint, and tests *common*

.PHONY: ci
ci: verify expo-check expo-config-check audit ## Run the full CI contract *common*

##@ Storybook

.PHONY: storybook-ios
storybook-ios: ## Build and run Storybook on iOS
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile storybook:ios -- $(PORT_ARG)

.PHONY: storybook-generate
storybook-generate: ## Regenerate Storybook story imports
	@$(PNPM) --filter @dont-forget/mobile storybook:generate

##@ Verification

.PHONY: typecheck
typecheck: ## Run TypeScript without emitting files *common*
	@$(PNPM) typecheck

.PHONY: lint
lint: ## Run whole-project ESLint *common*
	@$(PNPM) lint

.PHONY: eslint-rules
eslint-rules: ## Run local ESLint rule tests *common*
	@$(PNPM) test:eslint-rules

.PHONY: biome-check
biome-check: ## Run Biome formatting, import, and lint checks *common*
	@$(PNPM) biome:check

.PHONY: format
format: ## Apply Biome formatting and safe fixes
	@$(PNPM) format

.PHONY: audit
audit: ## Audit dependencies for high-severity vulnerabilities
	@$(PNPM) audit --audit-level high

.PHONY: secrets-scan
secrets-scan: ## Scan Git history for secrets with Gitleaks v8
	@command -v "$(GITLEAKS)" > /dev/null || (echo "Gitleaks v8 is required: https://github.com/gitleaks/gitleaks#installing" >&2; exit 127)
	@"$(GITLEAKS)" git --redact .

.PHONY: expo-check
expo-check: ## Check Expo SDK package compatibility
	@$(PNPM) --filter @dont-forget/mobile expo:check

.PHONY: expo-config-check
expo-config-check: ## Resolve the public Expo config without printing it
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile expo:config > /dev/null

.PHONY: expo-clear
expo-clear: ## Start Expo with a cleared Metro cache
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile expo:clear -- $(PORT_ARG)

##@ Tests

.PHONY: test
test: ## Run Jest in watch mode
	@$(PNPM) test

.PHONY: test-ci
test-ci: ## Run all tests once *common*
	@$(PNPM) test:ci

.PHONY: test-coverage
test-coverage: ## Run all tests once and report coverage
	@$(PNPM) test:coverage

##@ Database

.PHONY: db-generate
db-generate: ## Generate directory migrations
	@$(PNPM) --filter @dont-forget/db db:generate

.PHONY: db-migrate
db-migrate: ## Apply migrations to configured databases
	@APP_ENV="$(APP_ENV)" CONFIRM_APP_ENV="$(CONFIRM_APP_ENV)" $(PNPM) --filter @dont-forget/db db:migrate

.PHONY: db-reset
db-reset: ## Delete app data from configured databases
	@APP_ENV="$(APP_ENV)" CONFIRM_APP_ENV="$(CONFIRM_APP_ENV)" CONFIRM_DB_RESET="$(CONFIRM_DB_RESET)" $(PNPM) --filter @dont-forget/db db:reset

.PHONY: db-seed
db-seed: ## Seed local deterministic data without resetting (requires migrated seed DB)
	@test "$(APP_ENV_VALUE)" = "local" || (echo "db-seed requires APP_ENV=local" && exit 1)
	@APP_ENV="$(APP_ENV_VALUE)" EMAIL="$(EMAIL)" $(PNPM) --filter @dont-forget/db db:seed

.PHONY: db-reseed
db-reseed: ## Reset, migrate, and seed local deterministic development data
	@test "$(APP_ENV_VALUE)" = "local" || (echo "db-reseed requires APP_ENV=local" && exit 1)
	@APP_ENV="$(APP_ENV_VALUE)" EMAIL="$(EMAIL)" $(PNPM) --filter @dont-forget/db db:reseed

##@ Infrastructure

.PHONY: _infra-require-environment
_infra-require-environment:
	@case "$(APP_ENV_VALUE)" in local|staging|production) ;; *) echo "infra targets require APP_ENV=local, staging, or production"; exit 1 ;; esac

.PHONY: _infra-require-deployment-environment
_infra-require-deployment-environment: _infra-require-environment
	@case "$(APP_ENV_VALUE)" in staging|production) ;; *) echo "this infra target requires APP_ENV=staging or production"; exit 1 ;; esac

.PHONY: _infra-require-production-confirmation
_infra-require-production-confirmation: _infra-require-deployment-environment
	@test "$(APP_ENV_VALUE)" != "production" || test "$(CONFIRM_APP_ENV)" = "production" || (echo "production migration requires CONFIRM_APP_ENV=production" && exit 1)

.PHONY: infra-up
infra-up: _infra-require-environment ## Start the PowerSync stack for the selected environment (APP_ENV, default local)
	@$(INFRA_COMPOSE) up -d

.PHONY: infra-down
infra-down: _infra-require-environment ## Stop the PowerSync stack (keeps data volumes)
	@$(INFRA_COMPOSE) down

.PHONY: infra-destroy
infra-destroy: _infra-require-environment ## Stop the stack and DELETE its Postgres volumes
	@test "$(APP_ENV_VALUE)" != "production" || (echo "infra-destroy refuses APP_ENV=production" && exit 1)
	@$(INFRA_COMPOSE) down --volumes

.PHONY: infra-restart
infra-restart: _infra-require-environment ## Restart the stack. Optional: SERVICE=powersync
	@$(INFRA_COMPOSE) restart $(SERVICE)

.PHONY: infra-ps
infra-ps: _infra-require-environment ## Show PowerSync stack container status
	@$(INFRA_COMPOSE) ps

.PHONY: infra-logs
infra-logs: _infra-require-environment ## Follow stack logs. Optional: SERVICE=powersync
	@$(INFRA_COMPOSE) logs --follow $(SERVICE)

.PHONY: infra-pull
infra-pull: _infra-require-environment ## Pull the latest stack images
	@$(INFRA_COMPOSE) pull

.PHONY: infra-build
infra-build: _infra-require-deployment-environment ## Build stack images (staging/production api). Optional: SERVICE=api
	@$(INFRA_COMPOSE) build $(SERVICE)

.PHONY: infra-migrate
infra-migrate: _infra-require-production-confirmation ## Apply migrations via the stack's one-off migrate container (staging/production)
	@CONFIRM_APP_ENV="$(CONFIRM_APP_ENV)" $(INFRA_COMPOSE) --profile tools run --build --rm migrate

.PHONY: infra-seed
infra-seed: _infra-require-environment ## Seed one confirmed email-backed staging QA fixture
	@test "$${APP_ENV:-}" = "staging" || (echo "infra-seed requires APP_ENV=staging" && exit 1)
	@case "$${EMAIL:-}" in *[![:space:]]*) ;; *) echo "infra-seed requires a nonblank EMAIL"; exit 1 ;; esac
	@$(INFRA_COMPOSE) --profile tools run --build --rm seed

.PHONY: infra-deploy
infra-deploy: _infra-require-production-confirmation ## Build images, start the stack, and migrate (staging/production)
	@$(INFRA_COMPOSE) build
	@$(INFRA_COMPOSE) up -d
	@CONFIRM_APP_ENV="$(CONFIRM_APP_ENV)" $(INFRA_COMPOSE) --profile tools run --build --rm migrate

.PHONY: pg-shell
pg-shell: _infra-require-environment ## Open psql on the source Postgres
	@$(INFRA_COMPOSE) exec pg-source sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: ps-token-test
ps-token-test: ## Probe PowerSync /sync/stream with a real Clerk token (powersync JWT template)
	@set -a; . ./.env.local; set +a; node tooling/powersync/clerk-token-test.mjs "http://localhost:$${PS_PORT:-8089}" powersync

.PHONY: ps-synced-rows
ps-synced-rows: ## Show rows a user receives from PowerSync. Usage: make ps-synced-rows USER=<clerk-user-id>
	@test -n "$(USER)" || (echo "Usage: make ps-synced-rows USER=<clerk-user-id>" && exit 1)
	@set -a; . ./.env.local; set +a; node tooling/powersync/synced-rows.mjs "$(USER)" "http://localhost:$${PS_PORT:-8089}"

# ==================================================================================== #
# UTILITIES
# ==================================================================================== #

##@ Utilities

.PHONY: expo-config
expo-config: ## Print the public Expo config
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) --filter @dont-forget/mobile expo:config

.PHONY: why
why: ## Inspect why a package is installed. Usage: make why PKG=<package>
	@test -n "$(PKG)" || (echo "Usage: make why PKG=<package>" && exit 1)
	@$(PNPM) why $(PKG)

.PHONY: outdated
outdated: ## Show dependencies with available newer versions
	@$(PNPM) outdated

.PHONY: status
status: ## Show concise git worktree status
	@git status --short

.PHONY: help
help: ## Display this help
	@printf "Usage:\n  make \033[36m<target>\033[0m\n\n"
	@awk 'BEGIN {FS = ":.*##"; common_header_printed = 0;} \
		/^[a-zA-Z0-9._%-]+:.*?##.*\*common\*/ { \
			if (common_header_printed == 0) { \
				printf "\033[1mCommon\033[0m\n"; \
				common_header_printed = 1; \
			} \
			target = $$1; desc = $$2; \
			gsub(/\s*\*common\*/, "", desc); \
			gsub(/^[[:space:]]+|[[:space:]]+$$/, "", desc); \
			printf "  \033[36m%-22s\033[0m %s\n", target, desc; \
		}' $(MAKEFILE_LIST)
	@awk 'BEGIN {FS = ":.*##";} \
		/^##@/ { \
			if ($$0 == "##@ Common") next; \
			printf "\n"; \
			printf "\033[1m%s\033[0m\n", substr($$0, 5); \
		} \
		/^[a-zA-Z0-9._%-]+:.*?##/ { \
			target = $$1; desc = $$2; \
			if (desc ~ /\*common\*/) next; \
			gsub(/\s*\*common\*/, "", desc); \
			gsub(/^[[:space:]]+|[[:space:]]+$$/, "", desc); \
			printf "  \033[36m%-22s\033[0m %s\n", target, desc; \
		}' $(MAKEFILE_LIST)
