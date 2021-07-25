#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

INTERNAL_APPLICATIONS="${DATA_BASE_PATH}/applications-internal/*.yaml"

for APP in $INTERNAL_APPLICATIONS; do
  docker-compose -f "$APP" down -d
done

PUBLIC_APPLICATIONS="${DATA_BASE_PATH}/applications-public/*.yaml"

for APP in $PUBLIC_APPLICATIONS; do
  docker-compose -f "$APP" down --remove-orphans
done
