#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

set -x

LETS_ENCRYPT_DIR="${DATA_BASE_PATH}"/letsencrypt

DOMAINS=$1

echo "issuing cert for ${DOMAINS}"

docker run -it --rm --name certbot \
  -v "${LETS_ENCRYPT_DIR}/etc:/etc/letsencrypt" \
  -v "${LETS_ENCRYPT_DIR}/var:/var/lib/letsencrypt" \
  --network=main \
  --name certbot \
  certbot/certbot certonly \
  --standalone \
  -m "${LETS_ENCRYPT_EMAIL_ADDRESS}" \
  --non-interactive \
  --agree-tos \
  -d ${DOMAINS}
