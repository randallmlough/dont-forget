# ==================================================================================== #
# COMMANDS
# ==================================================================================== #

PNPM ?= pnpm

.DEFAULT_GOAL := help

##@ Common

.PHONY: install
install: ## Install dependencies *common*
	@$(PNPM) install

.PHONY: start
start: ## Start Expo for normal app development *common*
	@APP_ENV="$(if $(APP_ENV),$(APP_ENV),local)" $(PNPM) start

.PHONY: ios
ios: ## Run the native iOS target *common*
	@APP_ENV="$(if $(APP_ENV),$(APP_ENV),local)" $(PNPM) ios

.PHONY: storybook
storybook: ## Start Storybook for the native iOS build *common*
	@APP_ENV="$(if $(APP_ENV),$(APP_ENV),local)" $(PNPM) storybook:start

.PHONY: verify
verify: typecheck biome-check eslint-rules lint test-ci ## Run typecheck, Biome, lint, and tests *common*

.PHONY: ci
ci: verify expo-check expo-config-check audit ## Run the full CI contract *common*

##@ Storybook

.PHONY: storybook-ios
storybook-ios: ## Build and run Storybook on iOS
	@APP_ENV="$(if $(APP_ENV),$(APP_ENV),local)" $(PNPM) storybook:ios

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
	@APP_ENV="$(if $(APP_ENV),$(APP_ENV),local)" $(PNPM) expo config --type public > /dev/null

.PHONY: expo-clear
expo-clear: ## Start Expo with a cleared Metro cache
	@$(PNPM) expo start --clear

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
	@APP_ENV="$(APP_ENV)" $(PNPM) db:seed

.PHONY: db-reseed
db-reseed: ## Reset, migrate, and seed local deterministic development data
	@APP_ENV="$(APP_ENV)" CONFIRM_DB_RESET="$(CONFIRM_DB_RESET)" $(PNPM) db:reseed

# ==================================================================================== #
# UTILITIES
# ==================================================================================== #

##@ Utilities

.PHONY: expo-config
expo-config: ## Print the public Expo config
	@APP_ENV="$(if $(APP_ENV),$(APP_ENV),local)" $(PNPM) expo config --type public

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
