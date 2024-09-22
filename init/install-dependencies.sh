#!/usr/bin/env bash

# WARNING
# Currently written for the amazon linux 2 distribution
# WARNING

#
# This is a convenience script to install docker + docker-compose,
# and configure the daemon to start at boot time, plus grant the
# current user access to the docker socket.
#
# You may not wish to use this on a production system, and rather
# install and configure these manually, or via ansible etc, for
# greater control over the particulars.

# Amazon Linux 2 is not supported - use yum version instead, though
# might be less recent
#bash <(curl -fsSL https://get.docker.com)
sudo yum update -y

sudo amazon-linux-extras install kernel-ng
sudo amazon-linux-extras install docker
sudo amazon-linux-extras install epel

sudo yum -y install wireguard-tools
sudo yum -y install docker bash-completion

sudo groupadd docker
sudo usermod -aG docker $USER

sudo systemctl enable docker.service
sudo systemctl enable containerd.service

sudo systemctl start docker.service
sudo systemctl start containerd.service

OCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.29.6/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

docker version
docker compose --version

sudo docker run --rm hello-world

# install docker shell completion
sudo curl \
  -L https://raw.githubusercontent.com/docker/docker-ce/master/components/cli/contrib/completion/bash/docker \
  -o /etc/bash_completion.d/docker.sh

# install docker-compose shell completion
sudo curl \
  -L https://raw.githubusercontent.com/docker/compose/master/contrib/completion/bash/docker-compose \
  -o /etc/bash_completion.d/docker-compose
