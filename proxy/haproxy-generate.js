#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const {loadApplications} = require('../lib/load-applications')

function generateUseBackends(applications) {
  return applications.map(app => {
    return app.externalHostNames.map(hostName => {
      return `    use_backend ${app.internalHostName} if { hdr_beg(host) -i ${hostName} }`
    }).join('\n')
  }).join('\n\n')
}

function generateBackends(applications) {
  return applications.map(app => {
    return [
      `backend ${app.internalHostName}`,
      `    balance    roundrobin`,
      `    server     ${app.internalHostName} ${app.internalHostName}:${app.containerPort} resolvers docker_resolver`
    ].join('\n')
  }).join('\n\n')
}


function main() {
  const applicationsDirectory = process.argv[2]
  const proxyConfigDirectory = process.argv[3]



  console.info(`generating proxy configuration from directory ${applicationsDirectory} to ${proxyConfigDirectory}`)

  const applications = loadApplications(applicationsDirectory)

  const templatePath = path.join(proxyConfigDirectory, "haproxy.cfg.template");

  if (!fs.existsSync(templatePath)) {
    console.warn(`WARNING: template path does not exist: ${templatePath} - skipping.`)
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

  fs.writeFileSync(path.join(proxyConfigDirectory, 'haproxy.cfg'), output, {encoding: 'utf-8'})
}


main()
