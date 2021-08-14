#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

set -x

docker run -i --rm --user="1000:1000" \
  -v="${SCRIPT_BASE_PATH}:/code" \
  -v="${DATA_BASE_PATH}:/home/node" node:16-alpine /code/ssl-public/generate-issue-all-ssl-certs.js /home/node/applications-public | while read -r line; do
      "${__dir}"/$line
  done

"${__dir}"/../proxy/reload-haproxy-config.sh
