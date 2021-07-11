#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

FILES="${DATA_BASE_PATH}/applications/*"

for FILE in $FILES; do
  "${__dir}"/run-app.sh "$FILE"
done
