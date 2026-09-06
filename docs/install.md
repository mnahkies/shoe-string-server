# Installation Guide

`shoe-string` depends on a working container runtime, such as `podman` or `docker`. We are primarily testing
with rootless `podman`, so your mileage may vary when using other runtimes.

## Contents

* [Operating System Requirements](#operating-system-requirements)
* [Installing `shoe-string`](#installing-shoe-string)
  * [From `git`](#from-git)
  * [From `npm`](#from-npm)

## Operating System Requirements

This assumes you are using Amazon Linux 2023, but should be relatively portable to other distributions.

Broadly it:

* Installs git, podman / podman-compose (fork pending upstreaming patches)
* Installs mise and configures it for `bash`
* Enables unprivileged binding of port 53 and up, as well as user lingering
* Installs `shoe-string`

> \[!WARNING]
> This script is meant to be run as `ec2-user` in an interactive login shell.
> It would require adapting to be run as a cloud-init script (planned)

```shell
sudo dnf install -y git python3 python3-pip
# Enable Supplementary Packages for Amazon Linux - https://docs.aws.amazon.com/linux/al2023/ug/spal.html
sudo dnf install -y spal-release
sudo dnf install -y podman podman-docker

podman --version

# Enable the podman.socket
systemctl --user enable --now podman.socket
systemctl --user status podman.socket

# Verify that subordinate IDs are configured
for file in /etc/subuid /etc/subgid; do
  if ! grep -q -E "^${USER}:" "$file" 2>/dev/null; then
    echo "ERROR: Subordinate ID entry for '${USER}' missing in ${file}" >&2
    exit 1
  fi
done

# Install podman-compose fork
git clone https://github.com/mnahkies/podman-compose.git /tmp/podman-compose
pushd /tmp/podman-compose
  git checkout mn/fix/update-environment-secrets
  python3 -m venv ~/.local/share/podman-compose
  ~/.local/share/podman-compose/bin/pip install --upgrade pip
  ~/.local/share/podman-compose/bin/pip install /tmp/podman-compose
  mkdir -p ~/.local/bin
  ln -sf ~/.local/share/podman-compose/bin/podman-compose ~/.local/bin/podman-compose
popd 

# Disable "Emulate Docker CLI using podman." warning message
 sudo touch /etc/containers/nodocker

# Disable podman compose warning message
sudo mkdir -p /etc/containers/containers.conf.d
cat <<'EOF' | sudo tee /etc/containers/containers.conf.d/disable-compose-warning.conf
[engine]
compose_warning_logs = false
EOF

podman-compose --version

# Enable linger, to allow rootless containers to continue running after user logs out
sudo loginctl enable-linger $USER
loginctl show-user $USER --property=Linger

# Enable binding to low ports (53, 80, 443, etc) using rootless containers
echo "net.ipv4.ip_unprivileged_port_start=53" | sudo tee /etc/sysctl.d/99-rootless-ports.conf
sudo sysctl --system

# Install mise
curl https://mise.run | sh
echo "eval \"\$(/home/ec2-user/.local/bin/mise activate bash)\"" >> ~/.bashrc
source ~/.bashrc
mise doctor || { echo "mise doctor failed with exit code $?"; exit 1; }

```

## Installing `shoe-string`

We have two supported methods of installation:

### From `git`

For a bleeding-edge installation, you can install from source. After installation the `shoe-string self-update` command can be used to update to `HEAD` of `main`.
This script assumes that `~/.local/bin` is in your `PATH`.

```shell
# Install shoe-string
git clone https://github.com/mnahkies/shoe-string-server.git ~/.local/share/shoe-string-server
pushd ~/.local/share/shoe-string-server
 mise trust
 mise install
 mise run install
 ln -sf ~/.local/share/shoe-string-server/bin/shoe-string ~/.local/bin/shoe-string
 chmod +x ~/.local/bin/shoe-string
popd

shoe-string --version

# to later upgrade
# shoe-string self-update
```

### From `npm`

> \[!WARNING]
> We haven't yet published the first npm release. Watch this space.

We publish stable releases to [npm](https://www.npmjs.com/package/shoe-string-server). You can install these, however you please, here are some options:

| package manager | command                                     |
|-----------------|---------------------------------------------|
| mise            | `mise install npm:shoe-string-server`       |
| pnpm            | `pnpm add -g shoe-string-server@latest`     |
| npm             | `npm install -g shoe-string-server@latest`  |
| yarn            | `yarn global add shoe-string-server@latest` |

Typically `mise` is a good option, as this allows you to manage it alongside other dependencies like `age` / `sops` in your configuration repo root.
