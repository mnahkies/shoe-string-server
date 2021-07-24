#!/usr/bin/env bash

#
# This is a convenience script to install docker + docker-compose,
# and configure the daemon to start at boot time, plus grant the
# current user access to the docker socket.
#
# You may not wish to use this on a production system, and rather
# install and configure these manually, or via ansible etc, for
# greater control over the particulars.

bash <(curl -fsSL https://get.docker.com)

sudo groupadd docker
sudo usermod -aG docker $USER

sudo systemctl enable docker.service
sudo systemctl enable containerd.service

sudo systemctl start docker.service
sudo systemctl start containerd.service

sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

docker version
docker-compose --version

docker run --rm -it hello-world
