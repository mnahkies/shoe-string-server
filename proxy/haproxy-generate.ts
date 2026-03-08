#!/usr/bin/env node --experimental-strip-types
import path from 'node:path'
import fs from 'node:fs'
import { loadApplications, type Application } from '../lib/load-applications.ts'

export function generateUseBackends(applications: Application[]): string {
  return applications.map(app => {
    return app.externalHostNames.map(hostName => {
      return `    use_backend ${ app.internalHostName } if { hdr(host) -i ${ hostName } }`
    }).join('\n')
  }).join('\n\n')
}

export function generateBackends(applications: Application[]): string {
  return applications.map(app => {
    return [
      `backend ${ app.internalHostName }`,
      `    balance    roundrobin`,
      `    server     ${ app.internalHostName } ${ app.containerHostName }:${ app.containerPort } resolvers docker_resolver`,
    ].join('\n')
  }).join('\n\n')
}


function main() {
  const applicationsDirectory = process.argv[2]
  const proxyConfigDirectory = process.argv[3]

  console.info(`generating proxy configuration from directory ${ applicationsDirectory } to ${ proxyConfigDirectory }`)

  const applications = loadApplications(applicationsDirectory)

  const templatePath = path.join(proxyConfigDirectory, "haproxy.cfg.template")

  if (!fs.existsSync(templatePath)) {
    console.warn(`WARNING: template path does not exist: ${ templatePath } - skipping.`)
    return
  }

  const template = fs.readFileSync(templatePath, 'utf-8')

  const warning = `#---------------------------------------------------------------------
# WARNING: automatically generated, please edit the template file haproxy.cfg.template
#---------------------------------------------------------------------

`

  const output = warning + template
    .replace('{{USE_BACKENDS}}', generateUseBackends(applications))
    .replace('{{BACKENDS}}', generateBackends(applications))

  fs.writeFileSync(path.join(proxyConfigDirectory, 'haproxy.cfg'), output, { encoding: 'utf-8' })
}


if (import.meta.url === `file://${ process.argv[1] }`) {
  main()
}
