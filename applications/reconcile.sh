#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

pushd "$DATA_BASE_PATH"
git fetch

if [ $(git rev-parse HEAD) = $(git rev-parse @{u}) ]; then
  echo "Up to date - no changes to reconcile"
  popd
else
  echo "Not up to date - running reconcile"
  git pull
  popd
  "$__dir"/watchdog-up.sh
fi

