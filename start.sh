#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/config.sh

"${__dir}"/proxy/reload-haproxy-config.sh

docker network prune -f

docker network create --driver=bridge main || true
docker network create --driver=bridge internal || true
docker network create --driver=bridge monitoring || true

docker-compose -f "${__dir}"/docker-compose.yaml up -d --force

"${__dir}"/applications/watchdog-up.sh
