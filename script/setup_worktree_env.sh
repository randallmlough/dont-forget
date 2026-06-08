#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ENV="${ROOT_DIR}/.env.local"
TARGET_LOCAL_DOCS="${ROOT_DIR}/docs/.local"
MODE="${WORKTREE_ENV_MODE:-symlink}"
SOURCE_ENV="${WORKTREE_ENV_FILE:-${CODEX_WORKTREE_ENV_FILE:-}}"
SOURCE_LOCAL_DOCS="${WORKTREE_LOCAL_DOCS_DIR:-${CODEX_WORKTREE_LOCAL_DOCS_DIR:-}}"
CURRENT_WORKTREE="$(cd "${ROOT_DIR}" && pwd -P)"

if [[ -z "${SOURCE_ENV}" || -z "${SOURCE_LOCAL_DOCS}" ]]; then
	while IFS= read -r line; do
		case "${line}" in
			worktree\ *)
				CANDIDATE_WORKTREE="${line#worktree }"
				CANDIDATE_WORKTREE_PATH="$(cd "${CANDIDATE_WORKTREE}" && pwd -P)"
				if [[
					"${CANDIDATE_WORKTREE_PATH}" != "${CURRENT_WORKTREE}" &&
					-z "${SOURCE_ENV}" &&
					-f "${CANDIDATE_WORKTREE}/.env.local"
				]]; then
					SOURCE_ENV="${CANDIDATE_WORKTREE}/.env.local"
				fi
				if [[
					"${CANDIDATE_WORKTREE_PATH}" != "${CURRENT_WORKTREE}" &&
					-z "${SOURCE_LOCAL_DOCS}" &&
					-d "${CANDIDATE_WORKTREE}/docs/.local"
				]]; then
					SOURCE_LOCAL_DOCS="${CANDIDATE_WORKTREE}/docs/.local"
				fi
				;;
		esac
	done < <(git -C "${ROOT_DIR}" worktree list --porcelain)
fi

if [[ -e "${TARGET_ENV}" || -L "${TARGET_ENV}" ]]; then
	echo ".env.local already exists in ${ROOT_DIR}"
elif [[ -z "${SOURCE_ENV}" || ! -f "${SOURCE_ENV}" ]]; then
	cat >&2 <<'MESSAGE'
No source .env.local was found.

Create one from .env.example or point to an existing local env file:

  WORKTREE_ENV_FILE=/path/to/.env.local make worktree-env

By default this command symlinks the env file. To copy instead:

  WORKTREE_ENV_MODE=copy WORKTREE_ENV_FILE=/path/to/.env.local make worktree-env
MESSAGE
	exit 1
else
	case "${MODE}" in
		symlink)
			ln -s "${SOURCE_ENV}" "${TARGET_ENV}"
			echo "Linked .env.local -> ${SOURCE_ENV}"
			;;
		copy)
			cp "${SOURCE_ENV}" "${TARGET_ENV}"
			chmod 0600 "${TARGET_ENV}"
			echo "Copied .env.local from ${SOURCE_ENV}"
			;;
		*)
			echo "Unsupported WORKTREE_ENV_MODE=${MODE}. Use symlink or copy." >&2
			exit 2
			;;
	esac
fi

if [[ -e "${TARGET_LOCAL_DOCS}" || -L "${TARGET_LOCAL_DOCS}" ]]; then
	echo "docs/.local already exists in ${ROOT_DIR}"
elif [[ -n "${SOURCE_LOCAL_DOCS}" && -d "${SOURCE_LOCAL_DOCS}" ]]; then
	case "${MODE}" in
		symlink)
			ln -s "${SOURCE_LOCAL_DOCS}" "${TARGET_LOCAL_DOCS}"
			echo "Linked docs/.local -> ${SOURCE_LOCAL_DOCS}"
			;;
		copy)
			cp -R "${SOURCE_LOCAL_DOCS}" "${TARGET_LOCAL_DOCS}"
			echo "Copied docs/.local from ${SOURCE_LOCAL_DOCS}"
			;;
		*)
			echo "Unsupported WORKTREE_ENV_MODE=${MODE}. Use symlink or copy." >&2
			exit 2
			;;
	esac
else
	echo "No source docs/.local was found; skipped docs/.local setup"
fi
