#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

INTERNAL_APPLICATIONS="${DATA_BASE_PATH}/applications-internal/*.yaml"

for APP in $INTERNAL_APPLICATIONS; do
  echo $APP
  APP_NAME=$(basename $APP ".yaml")
  docker compose --file "$APP" -p $APP_NAME up -d --force-recreate --remove-orphans
done

PUBLIC_APPLICATIONS="${DATA_BASE_PATH}/applications-public/*.yaml"

for APP in $PUBLIC_APPLICATIONS; do
  echo $APP
  APP_NAME=$(basename $APP ".yaml")
  docker compose --file "$APP" -p $APP_NAME up -d --force-recreate --remove-orphans
done

"$__dir"/../proxy/reload-haproxy-config.sh
