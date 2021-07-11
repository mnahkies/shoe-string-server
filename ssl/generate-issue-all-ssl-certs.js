#!/usr/bin/env node

const DIR = process.argv[2]

require(`/home/node/${DIR}/applications`)
    .applications
    .map(it => Array.isArray(it.hostName) ? it.hostName.join(',') : it.hostName)
    .forEach(it => console.log(`issue-new-ssl-cert.sh ${it};
push-cert-to-haproxy.sh ${it.split(',')[0]} haproxy-public-ssl;`))
