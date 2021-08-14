#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

DATABASE=${DATABASE:-telegraf}
DURATION=${DURATION:-4w}

"$__dir"/influx-shell.sh -execute "CREATE RETENTION POLICY \"default\" ON \"$DATABASE\" DURATION $DURATION REPLICATION 1 DEFAULT"
