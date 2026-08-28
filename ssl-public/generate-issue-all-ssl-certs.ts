#!/usr/bin/env node
import {loadApplications} from '../lib/load-applications.ts'
const DIR = process.argv[2]

loadApplications(DIR)
  .map(it => it.externalHostNames.join(','))
  .forEach(it => console.log(`issue-new-ssl-cert.sh ${it};
push-cert-to-haproxy.sh ${it.split(',')[0]}`))
