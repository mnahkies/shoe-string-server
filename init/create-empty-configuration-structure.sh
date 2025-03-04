#!/usr/bin/env bash

set -exo pipefail

DATA_BASE_PATH=${1:-/var/cluster-config}

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -d "${DATA_BASE_PATH}" ]; then
 echo "Error: Directory ${DATA_BASE_PATH} already exists."
 exit 1
fi

cp -rv "$__dir"/template/ "$DATA_BASE_PATH"/

pushd $DATA_BASE_PATH
mv .gitignore.template .gitignore
git init
git add .
git commit -m "initial commit"
popd

# haproxy needs to write to this directory, so we change it's ownership
# to the uid:gid that the proxy executes as.
sudo chown 99:99 "$DATA_BASE_PATH"/haproxy-public-stats

openssl dhparam -out "$DATA_BASE_PATH"/haproxy-public/dhparam 2048
openssl dhparam -out "$DATA_BASE_PATH"/haproxy-internal/dhparam 2048


# Save the path to config.sh
sed "s|<PATH_GOES_HERE>|$DATA_BASE_PATH|g" "$__dir"/../config.sh.example > "$__dir"/../config.sh
