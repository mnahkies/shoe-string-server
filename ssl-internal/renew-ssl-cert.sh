#!/usr/bin/env bash

set -eo pipefail

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${__dir}"/../config.sh

set -x

LEGO_DIR="${DATA_BASE_PATH}"/lego
DOMAINS=$1

echo "issuing cert for ${DOMAINS} using ${LETS_ENCRYPT_EMAIL_ADDRESS}"

docker run -it --rm --name lego \
  -v "${LEGO_DIR}:/var/lego" \
  --name lego \
  -e ZONOMI_API_KEY="${ZONOMI_API_KEY}" \
  -e ZONOMI_PROPAGATION_TIMEOUT=1200 \
  -e ZONOMI_TTL=60 \
  goacme/lego \
  --path /var/lego \
  --email "${LETS_ENCRYPT_EMAIL_ADDRESS}" \
  --dns.resolvers 8.8.8.8 --dns.resolvers 8.8.4.4 \
  --dns zonomi --domains "${DOMAINS}" \
  --accept-tos \
  renew
