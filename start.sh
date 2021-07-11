#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/config.sh

"${__dir}"/proxy/reload-haproxy-config.sh

docker network prune -f
docker network create --driver=bridge main || true

docker-compose up -d --force

"${__dir}"/applications/watchdog.sh
