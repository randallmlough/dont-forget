#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_ENV="${ROOT_DIR}/.env.local"
MODE="${WORKTREE_ENV_MODE:-symlink}"
SOURCE_ENV="${WORKTREE_ENV_FILE:-${CODEX_WORKTREE_ENV_FILE:-}}"

if [[ -e "${TARGET_ENV}" || -L "${TARGET_ENV}" ]]; then
	echo ".env.local already exists in ${ROOT_DIR}"
	exit 0
fi

if [[ -z "${SOURCE_ENV}" ]]; then
	CURRENT_WORKTREE="$(cd "${ROOT_DIR}" && pwd -P)"
	while IFS= read -r line; do
		case "${line}" in
			worktree\ *)
				CANDIDATE_WORKTREE="${line#worktree }"
				CANDIDATE_WORKTREE_PATH="$(cd "${CANDIDATE_WORKTREE}" && pwd -P)"
				if [[
					"${CANDIDATE_WORKTREE_PATH}" != "${CURRENT_WORKTREE}" &&
					-f "${CANDIDATE_WORKTREE}/.env.local"
				]]; then
					SOURCE_ENV="${CANDIDATE_WORKTREE}/.env.local"
					break
				fi
				;;
		esac
	done < <(git -C "${ROOT_DIR}" worktree list --porcelain)
fi

if [[ -z "${SOURCE_ENV}" || ! -f "${SOURCE_ENV}" ]]; then
	cat >&2 <<'MESSAGE'
No source .env.local was found.

Create one from .env.example or point to an existing local env file:

  WORKTREE_ENV_FILE=/path/to/.env.local make worktree-env

By default this command symlinks the env file. To copy instead:

  WORKTREE_ENV_MODE=copy WORKTREE_ENV_FILE=/path/to/.env.local make worktree-env
MESSAGE
	exit 1
fi

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
