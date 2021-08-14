#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

set -x

LETS_ENCRYPT_DIR="${DATA_BASE_PATH}"/letsencrypt

docker run -it --rm --name certbot \
  -v "${LETS_ENCRYPT_DIR}/etc:/etc/letsencrypt" \
  -v "${LETS_ENCRYPT_DIR}/var:/var/lib/letsencrypt" \
  --network=main \
  --name certbot \
  certbot/certbot renew \
  --standalone \
  -m "${LETS_ENCRYPT_EMAIL_ADDRESS}" \
  --non-interactive \
  --agree-tos

docker run -i --rm --user="1000:1000" \
  -v="${SCRIPT_BASE_PATH}:/code" \
  -v="${DATA_BASE_PATH}:/home/node" node:16-alpine /code/ssl-public/generate-renew-all-ssl-certs.js  /home/node/applications-public | while read -r line; do
  "${__dir}"/$line
done

"${SCRIPT_BASE_PATH}"/proxy/reload-haproxy-config.sh
