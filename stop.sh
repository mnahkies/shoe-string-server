#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/config.sh

docker-compose down --remove-orphans
