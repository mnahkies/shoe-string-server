#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

docker run -it --rm --user="1000:1000" \
    -v="${__dir}:/code" \
    -v="${DATA_BASE_PATH}:/home/node" node:16-alpine /code/haproxy-generate.js /home/node/haproxy-public

if [ "$(docker ps -aq -f status=running -f name=proxy_public)" ]; then
  docker kill -s HUP proxy_public
fi

docker run -it --rm --user="1000:1000" \
  -v="${__dir}:/code" \
  -v="${DATA_BASE_PATH}:/home/node" node:16-alpine /code/haproxy-generate.js /home/node/haproxy-internal

if [ "$(docker ps -aq -f status=running -f name=proxy_internal)" ]; then
  docker kill -s HUP proxy_internal
fi
