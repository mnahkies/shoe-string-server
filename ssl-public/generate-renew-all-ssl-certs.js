#!/usr/bin/env node
const {loadApplications} = require('../lib/load-applications')
const DIR = process.argv[2]

const applications = loadApplications(DIR)

applications.map(it => it.externalHostNames.join(','))
  .forEach(it => console.log(`push-cert-to-haproxy.sh ${it.split(',')[0]}`))
