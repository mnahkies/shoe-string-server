# Suggested DNS Configuration

Most `shoe-string` instances will run both a public proxy, and internal proxy over VPN (Wireguard/Tailscale).

## Contents

* [Suggested SSL Certificates](#suggested-ssl-certificates)
* [Example Public Zone Configuration (BIND syntax)](#example-public-zone-configuration-bind-syntax)
* [DNS Providers](#dns-providers)
* [DNS Resolver / VPN configuration](#dns-resolver--vpn-configuration)

## Suggested SSL Certificates

For simplicity and to avoid leaking unnecessary information to certificate transparency logs we suggest the following
DNS record setup, combined with two SSL certificates issued using [Let's Encrypt](https://letsencrypt.org/) via DNS-01 challenges.

* Public cert: `https://example.com`, `https://*.example.com`
* Internal cert: `https://<hostname>.internal.example.com`, `https://*.<hostname>.internal.example.com`

## Example Public Zone Configuration (BIND syntax)

```shell
# Restrict certificate issuance to Let's Encrypt
example.com.           IN CAA 0 issue "letsencrypt.org"
example.com.           IN CAA 0 issuewild "letsencrypt.org"
# Public A records
example.com.           IN A <public-ip>
*.example.com.         IN A <public-ip>
# Prevent public A record from resolving for <hostname>.internal.example.com
# (private / split-horizon DNS assumed)
internal.example.com.  IN TXT "exclude-from-wildcard"
```

## DNS Providers

Even though the internal services are routed privately, the ACME DNS-01 challenge (`_acme-challenge.<hostname>.internal.example.com`)
is validated by Let's Encrypt against your **public** authoritative DNS servers.

You'll need to configure lego with credentials for your DNS provider.
Any DNS provider supported by lego (https://go-acme.github.io/lego/dns/index.html) should be fine.

## DNS Resolver / VPN configuration

Devices on the VPN should resolve `*.<hostname>.internal.example.com` to the internal VPN IP. Our standard approach
is to run CoreDNS using `shoe-string` and configure it as a resolver in tailscale.
