#!/usr/bin/env bash

export INFLUXDB_ADMIN_USER=admin
export INFLUXDB_ADMIN_PASSWORD=admin

export LETS_ENCRYPT_EMAIL_ADDRESS=support@example.com

# On AWS you can find these addresses by:
# curl http://169.254.169.254/latest/meta-data/public-ipv4
# curl http://169.254.169.254/latest/meta-data/local-ipv4

export PUBLIC_IP=127.0.0.1
export PUBLIC_PORT_HTTP=80
export PUBLIC_PORT_HTTPS=443

export PRIVATE_IP=10.12.0.1
export PRIVATE_PORT=80

# Space separated list of additional docker bridge networks to create
export ADDITIONAL_NETWORKS=()
