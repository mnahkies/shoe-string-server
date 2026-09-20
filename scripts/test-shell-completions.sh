#!/usr/bin/env bash

pnpm run build
shoe-string() { node ./dist/cli.mjs "$@"; }

case "${1:-}" in
  bash)
    source <(shoe-string complete bash)
    ;;
  zsh)
    source <(shoe-string complete zsh)
    ;;
  *)
    echo "Usage: source ./scripts/test-shell-completions.sh <bash|zsh>" >&2
    return 1 2>/dev/null || exit 1
    ;;
esac
