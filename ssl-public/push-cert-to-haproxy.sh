#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

LETS_ENCRYPT_DIR="${DATA_BASE_PATH}"/letsencrypt/etc

NAME=$1
DESTINATION="${DATA_BASE_PATH}/haproxy-public-ssl"

echo "pushing cert to haproxy ${LETS_ENCRYPT_DIR}/live/${NAME}"

bash -c "cat ${LETS_ENCRYPT_DIR}/live/${NAME}/fullchain.pem ${LETS_ENCRYPT_DIR}/live/${NAME}/privkey.pem > ${DESTINATION}/${NAME}.pem"
