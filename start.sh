#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/config.sh

set -x

"${__dir}"/proxy/reload-haproxy-config.sh

docker network prune -f

docker network create --driver=bridge main || true
docker network create --driver=bridge internal || true

for name in ${ADDITIONAL_NETWORKS:-()}; do
  docker network create --driver=bridge "$name" || true
done

sleep 2

docker compose --file "${__dir}"/docker-compose.yaml -p cluster-core up -d  --force-recreate --remove-orphans

"${__dir}"/applications/watchdog-up.sh
