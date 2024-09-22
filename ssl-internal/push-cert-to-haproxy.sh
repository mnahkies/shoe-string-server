#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

set -x

LEGO_DIR="${DATA_BASE_PATH}"/lego/certificates

NAME=$1
DESTINATION="${DATA_BASE_PATH}/haproxy-internal-ssl"

echo "pushing cert to haproxy ${LEGO_DIR}/${NAME}"

bash -c "sudo cat ${LEGO_DIR}/${NAME}.crt ${LEGO_DIR}/${NAME}.issuer.crt ${LEGO_DIR}/${NAME}.key > ${DESTINATION}/${NAME}.pem"
