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
	@$(PNPM) start

.PHONY: ios
ios: ## Run the native iOS target *common*
	@$(PNPM) ios

.PHONY: android
android: ## Run the native Android target *common*
	@$(PNPM) android

.PHONY: storybook
storybook: ## Start native React Native Storybook *common*
	@$(PNPM) storybook:start

.PHONY: verify
verify: typecheck lint test-ci ## Run typecheck, lint, and tests *common*

##@ App

.PHONY: web
web: ## Start the Expo web target
	@$(PNPM) web

.PHONY: reset-project
reset-project: ## Run Expo starter reset script
	@$(PNPM) reset-project

##@ Storybook

.PHONY: storybook-ios
storybook-ios: ## Start Storybook and open the iOS target
	@$(PNPM) storybook:ios

.PHONY: storybook-android
storybook-android: ## Start Storybook and open the Android target
	@$(PNPM) storybook:android

.PHONY: storybook-generate
storybook-generate: ## Regenerate Storybook story imports
	@$(PNPM) storybook:generate

##@ Verification

.PHONY: typecheck
typecheck: ## Run TypeScript without emitting files *common*
	@$(PNPM) typecheck

.PHONY: lint
lint: ## Run Expo lint *common*
	@$(PNPM) lint

.PHONY: expo-check
expo-check: ## Check Expo SDK package compatibility
	@$(PNPM) expo install --check

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

.PHONY: db-generate-directory
db-generate-directory: ## Generate Drizzle migrations for the directory DB schema
	@$(PNPM) db:generate:directory

.PHONY: db-generate-household
db-generate-household: ## Generate Drizzle migrations for the replicated Household DB schema
	@$(PNPM) db:generate:household

.PHONY: db-generate
db-generate: ## Generate both directory and Household migrations
	@$(PNPM) db:generate

.PHONY: db-migrate
db-migrate: ## Apply migrations to configured databases
	@$(PNPM) db:migrate

# ==================================================================================== #
# UTILITIES
# ==================================================================================== #

##@ Utilities

.PHONY: expo-config
expo-config: ## Print the public Expo config
	@$(PNPM) expo config --type public

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
