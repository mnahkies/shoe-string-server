#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

if [ -d "${DATA_BASE_PATH}" ]; then
 echo "Error: Directory ${DATA_BASE_PATH} already exists."
 exit 1
fi

cp -rv "$__dir"/template/ "$DATA_BASE_PATH"/
