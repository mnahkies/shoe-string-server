#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

APPLICATION_NAME=$1
TAG=$2

sed -i "/export DESIRED_TAG=/c\export DESIRED_TAG=${TAG}" "${DATA_BASE_PATH}"/applications/"${APPLICATION_NAME}".sh

"${__dir}"/watchdog.sh
