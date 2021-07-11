#!/usr/bin/env node

const DIR = process.argv[2]

require(`/home/node/${DIR}/applications`)
    .applications
    .map(it => Array.isArray(it.hostName) ? it.hostName.join(',') : it.hostName)
    .forEach(it => console.log(`push-cert-to-haproxy.sh ${it.split(',')[0]} haproxy-public-ssl;`))
