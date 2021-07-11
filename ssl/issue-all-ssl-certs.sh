#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

docker run -it --rm --user="1000:1000" \
  -v="${__dir}:/code" \
  -v="${DATA_BASE_PATH}:/home/node" node:16-alpine /code/generate-issue-all-ssl-certs.js haproxy-public | while read -r line; do
      "${__dir}"/$line
  done

"${__dir}"/../proxy/reload-haproxy-config.sh
