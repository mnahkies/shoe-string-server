#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

LETS_ENCRYPT_DIR="${DATA_BASE_PATH}"/letsencrypt/etc

NAME=$1
DESTINATION="${DATA_BASE_PATH}"/$2

echo "pushing cert to haproxy ${LETS_ENCRYPT_DIR}/live/${NAME}"

sudo bash -c "cat ${LETS_ENCRYPT_DIR}/live/${NAME}/fullchain.pem ${LETS_ENCRYPT_DIR}/live/${NAME}/privkey.pem > ${DESTINATION}/${NAME}.pem"
