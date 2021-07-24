#!/usr/bin/env bash

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
sudo yum -y install docker bash-completion
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

sudo docker run --rm hello-world

# install docker shell completion
sudo curl \
  -L https://raw.githubusercontent.com/docker/docker-ce/master/components/cli/contrib/completion/bash/docker \
  -o /etc/bash_completion.d/docker.sh

# install docker-compose shell completion
sudo curl \
  -L https://raw.githubusercontent.com/docker/compose/master/contrib/completion/bash/docker-compose \
  -o /etc/bash_completion.d/docker-compose
