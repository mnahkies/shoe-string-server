#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

if [ -d "${DATA_BASE_PATH}" ]; then
 echo "Error: Directory ${DATA_BASE_PATH} already exists."
 exit 1
fi

cp -rv "$__dir"/template/ "$DATA_BASE_PATH"/

# haproxy needs to write to this directory, so we change it's ownership
# to the uid:gid that the proxy executes as.
sudo chown 99:99 "$DATA_BASE_PATH"/haproxy-public-stats
