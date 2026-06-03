#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

show_usage() {
	cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run     Start the Expo development server
  --ios, ios     Build and run the iOS app
  --help, help   Show this help

Environment:
  PORT=8090      Run Expo on an alternate Metro port
USAGE
}

case "$MODE" in
	start | run)
		exec make start
		;;
	--ios | ios)
		exec make ios
		;;
	--help | help)
		show_usage
		;;
	*)
		show_usage >&2
		exit 2
		;;
esac
