#!/usr/bin/env bash

set -eo pipefail

source "$1"

echo "$APPLICATION_NAME"

CURRENT_IMAGE="$(docker ps -f status=running -f name="^$APPLICATION_NAME$" --format '{{.Image}}')"
DESIRED_IMAGE="${IMAGE_NAME}:${DESIRED_TAG}"

echo "run-app: current image: " $CURRENT_IMAGE
echo "run-app: desired image: " $DESIRED_IMAGE

if [ "$CURRENT_IMAGE" != "$DESIRED_IMAGE" ]; then

  echo "run-app: starting ${REGISTRY}/${IMAGE_NAME}:${DESIRED_TAG}"

  docker pull "${REGISTRY}"/"${IMAGE_NAME}":"${DESIRED_TAG}"

  docker stop "${APPLICATION_NAME}" || true

  docker run --rm -d \
    --network=main \
    --hostname "${APPLICATION_NAME}" --name "${APPLICATION_NAME}" \
    "${REGISTRY}"/"${IMAGE_NAME}":"${DESIRED_TAG}"
else
  echo "run-app: already running: ${CURRENT_IMAGE}"
fi
