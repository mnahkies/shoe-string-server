#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/config.sh

docker-compose -f "${__dir}"/docker-compose.yaml -p cluster-core down --remove-orphans

"${__dir}"/applications/watchdog-down.sh

docker network prune -f
