#!/usr/bin/env bash

set -exo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

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

docker run -it --rm --user="1000:1000" \
  -v="${__dir}:/code" \
  -v="${DATA_BASE_PATH}:/home/node" node:16-alpine /code/generate-renew-all-ssl-certs.js haproxy-public | while read -r line; do
  "${__dir}"/$line
done

"${__dir}"/../proxy/reload-haproxy-config.sh
