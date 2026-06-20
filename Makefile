# ==================================================================================== #
# COMMANDS
# ==================================================================================== #

PNPM ?= pnpm
APP_ENV_VALUE = $(if $(APP_ENV),$(APP_ENV),local)
PORT_ARG = $(if $(PORT),--port $(PORT),)
COMPOSE = docker compose --env-file .env.local -f infra/docker-compose.yaml

.DEFAULT_GOAL := help

##@ Common

.PHONY: install
install: ## Install dependencies *common*
	@$(PNPM) install

.PHONY: worktree-env
worktree-env: ## Link or copy local .env.local into this worktree
	@./script/setup_worktree_env.sh

.PHONY: worktree-db
worktree-db: ## Create an isolated per-worktree directory DB and point .env.local at it
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) worktree:db

.PHONY: worktree-db-destroy
worktree-db-destroy: ## Delete this worktree's directory DB plus its Household DBs and restore .env.local
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) worktree:db:destroy

.PHONY: start
start: ## Start Expo for normal app development *common*
	@APP_ENV="$(APP_ENV_VALUE)" NODE_OPTIONS=--dns-result-order=ipv4first $(PNPM) expo start --localhost $(PORT_ARG)

.PHONY: ios
ios: ## Run the native iOS target *common*
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) expo run:ios $(PORT_ARG)

.PHONY: prebuild
prebuild: ## Generate the native iOS project. Use `make prebuild -- --clean` to pass --clean
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) expo prebuild --platform ios $(if $(filter --clean,$(MAKECMDGOALS)),--clean,)

.PHONY: --clean
--clean:
	@:

.PHONY: storybook
storybook: ## Start Storybook for the native iOS build *common*
	@APP_ENV="$(APP_ENV_VALUE)" STORYBOOK_ENABLED=true NODE_OPTIONS=--dns-result-order=ipv4first $(PNPM) expo start --dev-client $(PORT_ARG)

.PHONY: verify
verify: typecheck biome-check eslint-rules lint test-ci ## Run typecheck, Biome, lint, and tests *common*

.PHONY: ci
ci: verify expo-check expo-config-check audit ## Run the full CI contract *common*

##@ Storybook

.PHONY: storybook-ios
storybook-ios: ## Build and run Storybook on iOS
	@APP_ENV="$(APP_ENV_VALUE)" STORYBOOK_ENABLED=true $(PNPM) expo run:ios $(PORT_ARG)

.PHONY: storybook-generate
storybook-generate: ## Regenerate Storybook story imports
	@$(PNPM) storybook:generate

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

.PHONY: expo-check
expo-check: ## Check Expo SDK package compatibility
	@$(PNPM) expo install --check

.PHONY: expo-config-check
expo-config-check: ## Resolve the public Expo config without printing it
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) expo config --type public > /dev/null

.PHONY: expo-clear
expo-clear: ## Start Expo with a cleared Metro cache
	@APP_ENV="$(APP_ENV_VALUE)" NODE_OPTIONS=--dns-result-order=ipv4first $(PNPM) expo start --clear --localhost $(PORT_ARG)

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
db-generate: ## Generate both directory and Household migrations
	@$(PNPM) db:generate

.PHONY: db-migrate
db-migrate: ## Apply migrations to configured databases
	@APP_ENV="$(APP_ENV)" CONFIRM_APP_ENV="$(CONFIRM_APP_ENV)" $(PNPM) db:migrate

.PHONY: db-reset
db-reset: ## Delete app data from configured databases
	@APP_ENV="$(APP_ENV)" CONFIRM_APP_ENV="$(CONFIRM_APP_ENV)" CONFIRM_DB_RESET="$(CONFIRM_DB_RESET)" $(PNPM) db:reset

.PHONY: db-seed
db-seed: ## Seed local deterministic data without resetting (requires migrated seed DB)
	@APP_ENV="$(APP_ENV_VALUE)" EMAIL="$(EMAIL)" $(PNPM) db:seed

.PHONY: db-reseed
db-reseed: ## Reset, migrate, and seed local deterministic development data
	@APP_ENV="$(APP_ENV_VALUE)" EMAIL="$(EMAIL)" $(PNPM) db:reseed

##@ PowerSync

.PHONY: infra-up
infra-up: ## Start the local PowerSync stack (source + storage Postgres, service)
	@$(COMPOSE) up -d

.PHONY: infra-down
infra-down: ## Stop the PowerSync stack (keeps data volumes)
	@$(COMPOSE) down

.PHONY: infra-destroy
infra-destroy: ## Stop the stack and DELETE its Postgres volumes
	@$(COMPOSE) down --volumes

.PHONY: infra-restart
infra-restart: ## Restart the stack. Optional: SERVICE=powersync
	@$(COMPOSE) restart $(SERVICE)

.PHONY: infra-ps
infra-ps: ## Show PowerSync stack container status
	@$(COMPOSE) ps

.PHONY: infra-logs
infra-logs: ## Follow stack logs. Optional: SERVICE=powersync
	@$(COMPOSE) logs --follow $(SERVICE)

.PHONY: infra-pull
infra-pull: ## Pull the latest stack images
	@$(COMPOSE) pull

.PHONY: pg-migrate
pg-migrate: ## Apply Postgres migrations + the powersync publication (reads DATABASE_URL)
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) exec drizzle-kit migrate --config=db/drizzle/postgres.migrate.config.ts

.PHONY: pg-shell
pg-shell: ## Open psql on the source Postgres
	@$(COMPOSE) exec pg-source sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: ps-token-test
ps-token-test: ## Probe PowerSync /sync/stream with a real Clerk token (powersync JWT template)
	@set -a; . ./.env.local; set +a; node tools/clerk-token-test.mjs "http://localhost:$${PS_PORT:-8089}" powersync

.PHONY: ps-synced-rows
ps-synced-rows: ## Show rows a user receives from PowerSync. Usage: make ps-synced-rows USER=<clerk-user-id>
	@test -n "$(USER)" || (echo "Usage: make ps-synced-rows USER=<clerk-user-id>" && exit 1)
	@set -a; . ./.env.local; set +a; node tools/synced-rows.mjs "$(USER)" "http://localhost:$${PS_PORT:-8089}"

# ==================================================================================== #
# UTILITIES
# ==================================================================================== #

##@ Utilities

.PHONY: expo-config
expo-config: ## Print the public Expo config
	@APP_ENV="$(APP_ENV_VALUE)" $(PNPM) expo config --type public

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
