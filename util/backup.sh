#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

OUTPUT_PATH=$1

sudo tar cvjf "$OUTPUT_PATH"/"$(date -Iseconds)".bz2 "$DATA_BASE_PATH"
