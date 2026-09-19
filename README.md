# shoe-string-server

> \[!WARNING]
> We're in the process of refining a complete rewrite of the project. `main` should be considered unstable until this is complete.
> See the `legacy` branch for the original bash-based version of this project, which will only receive critical bug fixes.

## Contents

* [Project Status](#project-status)
  * [Rough Roadmap](#rough-roadmap)
* [What's new? / Current Features](#whats-new--current-features)
  * [Reworked conf repo structure](#reworked-conf-repo-structure)
  * [Smarter reconciliation](#smarter-reconciliation)
  * [Secrets Management](#secrets-management)
  * [Stricter container isolation](#stricter-container-isolation)
  * [Better packaging / update story](#better-packaging--update-story)
  * [Simplified SSL Certificate management](#simplified-ssl-certificate-management)
  * [More flexible ingress declaration, and proxy management](#more-flexible-ingress-declaration-and-proxy-management)
  * [Flexible network layout](#flexible-network-layout)
* [Additional Docs](#additional-docs)
* [Development](#development)
* [LLM Policy](#llm-policy)

## Project Status

The following commands are already implemented:

* `up` - starts the cluster
* `down` - stops the cluster
* `reconcile` - reconciles the cluster with conf repo state
* `reload-proxy` - regenerates proxy config and signals haproxy containers
* `secrets` - decrypts secrets using sops/age
* `self-update` - updates the CLI to the latest version

### Rough Roadmap

* Dependency ordering, containers don't start in any specific order which can require multiple `shoe-string up` to get them all running successfully
* `init` command / pre-defined application library
* `lint` - static analysis of the configuration repo, checking volumes and secrets references all resolve, etc
* HAProxy conf template could be further cleaned up / abstracted
* `docker` / `docker-compose` compatibility testing
* backup orchestration / tooling
* shell completions
* `updatecli` integration
* More complete documentation / runbooks. Sorry this will come soon.

## What's new? / Current Features

### Reworked conf repo structure

* Flat applications structure, as some applications may be available on both internal and public networks
* Top-level separation of `conf` and `data`
  * Enables auto-classification of `conf` vs `data` volume mounts for reconciliation purposes
  * Simplifies `.gitignore` maintenance
* `cluster.yaml` - new configuration file
* `secrets.encrypted.yaml` - new sops secrets file
* `mise.toml` - mise is recommended to manage the `nodejs`, `age`, `sops` runtime dependencies.

Example:

```shell
├── applications
|   ├── example.yaml
|   ├── haproxy-internal.yaml
|   └── haproxy-public.yaml
├── conf
|   ├── example
|   |   └── whatever.yaml
|   ├── haproxy
|       ├── internal
|       |   ├── directory.html
|       |   ├── haproxy.cfg
|       |   └── haproxy.cfg.template
|       └── public
|           ├── haproxy.cfg
|           └── haproxy.cfg.template
├── data
|   ├── example
|       └── whatever.sqlite
├── mise.lock
├── mise.toml
├── cluster.yaml
├── secrets.encrypted.yaml
```

### Smarter reconciliation

Hashes container configuration volumes and injects as labels, such that compose reconciliation will detect changes.
This means that we only restart containers that have changed, instead of all of them as in the legacy version.

### Secrets Management

Formalizes secrets management using [sops](https://github.com/mozilla/sops) and [age](https://github.com/FiloSottile/age),
to inject [compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)

### Stricter container isolation

Leverages [userns](https://docs.podman.io/en/stable/markdown/podman-run.1.html#userns-mode) and `:Z` SELinux relabelling,
to isolate containers from the host, and each-other.

Explicit SELinux labels are preferred, eg:

```yaml
    security_opt:
      - label:level:s0:c100,c209,c211
```

To give each container a stable labeling, such that we don't have to relabel its volumes on every recreation.

### Better packaging / update story

New self update command is able to track `main`, or check `npm` for updates.

### Simplified SSL Certificate management

We now use [lego](https://go-acme.github.io/lego/) exclusively and use a `lego.yml` conf file. Individual certificates are mounted directly
to the proxy containers that require it, with no intermediate processing required. By ditching HTTP-01 challenges, we can issue certs before
starting the cluster for the first time.

### More flexible ingress declaration, and proxy management

The CLI no longer directly controls any container definitions - this is completely delegated to your `conf` repository, meaning you have full
control of the HAProxy versioning and updates.

Additionally, the compose extensions now support more complex ingress configurations (multiple ports, raw tcp, wss, forward-auth).
See [docker-compose-extensions.ts](./src/types/docker-compose-extensions.ts)

### Flexible network layout

Similar to the proxy definitions moving into your `conf` repository, so do all network definitions. This means there are no longer
hardcoded assumptions about the network layout, and you can define your own networks as required.

## Additional Docs

* [install.md](./docs/install.md)
* [dns.md](./docs/dns.md)
* [postres.md](./docs/postgres.md)

## Development

* [Contributing](CONTRIBUTING.md): setup, test selection, formatting, and review checklist.
* [Agent guidance](AGENTS.md): repository map, implementation constraints, and verification instructions.
* [License](LICENSE).

## LLM Policy

We have used LLM's in the development of this project and are doing our best to find ways to work effectively with them.
That said, we still expect human judgment and care to be exercised and will not entertain slop.

Please see the [Jellyfin LLM Policy](https://jellyfin.org/docs/general/contributing/llm-policies/) for the general vibe of our expectations.
