# Shoe-string cluster

This project is an attempt to create a turn-key "cluster" that is suitable for
small servers with limited RAM.

The only OS level dependencies it needs to be operated are `docker` and `docker-compose`
and I use it on a AWS Lightsail host with 1GB of RAM.

I wrote this after attempting to get "light weight" kubernetes environments going like K3s
or KIND, and finding that the resource overhead was simply too high for my requirements 
(`512mb` minimum, `1gb` recommended at time of writing)

**Current architecture**
![architecture](./architecture.svg)

## Guiding principals
- Every application runs in a `docker` container

- All configuration and data is stored under a single directory structure, to make backups simple

- Portable across different cloud providers, minimal host pre-requisites

- Provides the software that I typically want available to me when experimenting with personal projects 
  (eg: `npm` registry, `postgres` instance)

## Contributing
I welcome feedback and improvements, especially around any security concerns. However please note,
this project is pretty particular to my personal preferences and needs - I hope it might be of use
to others, but I might not accept PR's that don't align with my requirements. 

Please feel free to fork and customize to your hearts desire though :) 

## Features
- Public ingress on port 80 using haproxy

- Internal/private service ingress on configured port and ip address using haproxy
  - I recommend using `wireguard` or similar to bind this to a private ip address

- Private Docker registry

- Private NPM registry

- Metrics collected by telegraf to influxdb, with grafana for dashboards

- Letsencrypt certbot for automatic SSL provisioning, and renewal

- "Watchdog" script suitable for running on demand, or as `CronJob` to reconcile
  running applications with the configuration on filesystem

- Helper scripts for updating application configuration with new docker tags to
  deploy

## Considerations
- Letsencrypt will ban domains that make invalid requests to its production environment
  it's worthwhile testing this part of things using their staging environment before running

- This is held together with string, a collection of bash scripts that may or may not be portable,
  it has been tested on Fedora 34 and AWS Linux 2.
  
## Setup
1. Clone repo to somewhere on host or otherwise place the contents on the server
2. Install `docker` / `docker-compose` (`./init/install-dependencies.sh`, or manually)
3. Create `config.sh` from `config.sh.example`
4. Bootstrap data/configuration structure using `./init/create-empty-configuration-structure.sh`
5. Configure initial applications in the created configuration structure, and adjust templates/config as needed
6. Run ./start.sh

## Usage / Scripts reference
There are a number of bash scripts in this project, I give a brief overview below,
but you should probably read through them before attempting to use in production.

### `./config.sh`
- Contains the path to the directory containing all configuration files, and other storage.
- Contains credentials to be used for things like `influxdb` and `postgres` users.
- Contains the ip address and port to bind to for the ingresses

### `./start.sh`
- Generates haproxy configuration
- Creates the `main` docker network
- Start services defined in `docker-compose.yaml`
- Runs `watchdog.sh` to start applications configured in `applications`

### `./stop.sh`
- Stop services defined in `docker-compose.yaml`
- TODO: stop applications?

### `./proxy/reload-haproxy-config.sh`
- Called automatically by `start.sh` and ssl certificate scripts
- Re-generates `haproxy.cfg` files, and sends a signal to the containers to reload their config.
- Can be called manually if changes to the template or applications.js files have been made

### `./applications/watchdog.sh`
- Suitable for calling as a `CronJob` or manually after making changes to the `applications/*.sh`
  configuration files, attempts to reconcile running containers with the configuration state.

### `./appplications/deploy-new-version.sh`
Usage:
```shell
./appplications/deploy-new-version.sh <APPLICATION_NAME> <TAG>
```

Where `<APPLICATION_NAME>` is the name of a configuration file, and `<TAG>` is the new
desired `docker` tag to be executed.

### `./ssl/*`

TODO: write documentation

## Accessing internal services
There are two main options for configuring this securely:
- Bind to private ip address and access via VPN
- Bind to localhost / **firewalled** port and access via SSH tunnel

**Note:** these services are only exposed over `http` but I might add support for
exposing them over `https` as well since `docker` in particular gets a bit naggy about "insecure"
registries. It is assumed that you will only make them accessible via secure channels
like the examples below.

### VPN Wireguard example
**Prerequisites:** `wireguard-tools` installed, Linux kernel >= 5.6 or `wireguard` installed as a kernel module.
If you're not using Linux on both ends then you'll need to consult your platforms documentation.

1. On both host and client generate public/private key pairs:
   (you'll want to delete these files at the end)
 ```shell
wg genkey | tee privatekey | wg pubkey > publickey
```

2. Create server config:

Create file /etc/wireguard/wg0.conf:
 ```shell
[Interface]
Address = 10.12.0.1
PrivateKey = <SERVER_PRIVATE_KEY>
ListenPort = 51820

[Peer]
PublicKey = <CLIENT_PRIVATE_KEY>
AllowedIPs = 10.12.0.1/24
```
3. Open port `51820` on your servers firewall

4. Bring interface up on server
```shell
wg-quick up wg0
```

5. Create client config

Create file /etc/wireguard/wg0.conf:
 ```shell
 [Interface]
Address = 10.12.0.2
PrivateKey = <CLIENT_PRIVATE_KEY>

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = <SERVER_PUBLIC_IP>:51820
AllowedIPs = 10.12.0.2/24

PersistentKeepalive = 25
```

6. Bring interface up on client and test
```shell
wg-quick up wg0
ping 10.12.0.1
```

### SSH Tunnel example
**Assumptions:** ingress configured to 127.0.0.1:8080

Create tunnel using ssh, eg:
```shell
ssh user@host.com -L 127.0.0.1:8080:127.0.0.1:8080
```

Then services are available via port 8080, with the domains configured in the `haproxy-internal/applications.js`
file. The easiest way to make this available in your browser is to add entries to your
hosts file, or use something like `dnsmasq`

Eg: `/etc/hosts` file
```shell
127.0.0.1   grafana.example.internal
127.0.0.1   npm.example.internal
127.0.0.1   docker.example.internal
```

## Core Services
There are a number of "core" services managed by `docker-compose`. This is distinct from application services
that you want to deploy and make available.

### Influxdb
This is a time series database used by `telegraf` / `grafana` to collect and display metrics
about the host system, and public proxy.

By default, authentication is disabled. For production environments it probably makes sense to enable
authentication, and adjust the `telegraf` / `grafana` configuration as appropriate.

You may wish to customise the rentention policy and add continous queries to downsample your data,
refer to https://docs.influxdata.com/influxdb/v1.7/guides/downsampling_and_retention/ for help with this.

Start a influx shell using:
```shell
docker exec -it monitoring_influxdb influx
```

### Telegraf
This is the agent that collects metrics from the system and stores them in `influxdb`.

The default configuration should be a good baseline, and you can of course configure this as
required after bootstrapping your instance, in `/path/to/config/telegraf/telegraf.conf`

Refer to the manual at https://docs.influxdata.com/telegraf/v1.18/administration/configuration/

### Grafana
At first start you will need to configure grafana with a connection to the influxdb datasource, and
create / import some dashboards.

Datasource configuration:
- URL: `http://influxdb:8086`
- Database: `telegraf`
- Authentication disabled by default, if you enabled it in the `docker-compose.yaml` file then
  use the username/password you specified in `config.sh`

I recommend importing these dashboards to get started:
- System: https://grafana.com/grafana/dashboards/5955
- Docker: https://grafana.com/grafana/dashboards/10585
- HAProxy: https://grafana.com/grafana/dashboards/2263

### HAProxy
There are two instances of haproxy in use, one for public ingress, and one for private/internal ingress.

The configuration is generated from a template `haproxy.cfg.template` and a list of 
applications defined in `applications.js`

Any customizations you need to make should be made to the template rather to avoid them
being overwritten.

The public proxy exposes stats using a unix socket, mounted to `haproxy-public-stats` and 
read from by telegraf.

For the public ingress, SSL certificates are read from `haproxy-public-ssl`, noting that haproxy
requires the public and private portion to be stored in the same file.

Originals are managed by certbot and stored in `letsencrypt/etc`

#### haproxy-public-ssl
This folder is where the concatenated ssl certificate + private keys will be
stored, and loaded by the public facing haproxy instance.

Due to an annoying "feature" of haproxy where it will refuse to start if this
directly is empty, which is likely is when first bootstrapping your server,
there is a `invalid.pem` file which contains a self-signed certificate for the
domain `invalid.`

This avoids the chicken and egg situation where you either need to first start
with ssl disabled then restart after certificates have been populated, etc

As per [RFC 6761](https://datatracker.ietf.org/doc/html/rfc6761) section 6.4,
`invalid.` is guaranteed to never exist, and once you have your own certificates
in this folder, it is safe to delete this placeholder certificate.

##### TODO:

- Improve file system permissions, such that only haproxy can read from this
  directory?

- Find way to avoid above hacky workaround for first start?
  - Possibly use the configuration generator to create an explicit
    of certificates based on what is available in the `letsencrypt/etc` 
    directory, and not bind to 443 until at least one exists?

- Get rid of the certificate concatenation, haproxy no longer requires this
  since version 2.2 🥳

### Docker Registry (`registry:2`)

TODO: write documentation

### NPM Registry (`verdaccio`)

TODO: write documentation
  
## Future / TODO
- find a way to allow issuing of SSL certs for private/internal services?
  - would probably have to go the DNS TXT record route, but AFAIK there is not
    a standardised API for this that can be reasonably expected to work across providers 😢
- selectively enable/disable core services, eg: `postgres`
