# haproxy-public-ssl

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

## TODO:

- Improve file system permissions, such that only haproxy can read from this
  directory?
  
- Find way to avoid above hacky workaround for first start?
