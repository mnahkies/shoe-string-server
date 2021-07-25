#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const yaml = require('./js-yaml');

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

function readApplications(directory) {
  const applications = []
  const applicationFilenames = fs.readdirSync(directory)

  for (const applicationFilename of applicationFilenames) {
    if (!applicationFilename.endsWith('.yaml') && !applicationFilename.endsWith('.yml')) {
      continue
    }

    const application = yaml.load(fs.readFileSync(path.join(directory, applicationFilename), 'utf-8'))
    applications.push(application)
  }

  /*
  interface Application {
      x-container-port: number;
      x-external-host-names: string[];
      services: {
        application: {
          hostname: string
          container_name: string
        }
      }
  }
  */

  return applications.map(app => {
    const internalHostName = app?.services?.application?.hostname
    const externalHostNames = app['x-external-host-names'] || []
    const containerPort = app['x-container-port'] ?? 80

    const result = {
      internalHostName,
      externalHostNames,
      containerPort,
    }

    console.info("found application", result)
    return result
  }).filter(it => {
    if (!it.internalHostName) {
      console.error("skipping application as could not find internal hostname", it)
      return false
    }

    if (!it.externalHostNames.length) {
      console.info("skipping application as had no external hostnames", it.internalHostName)
      return false
    }

    return true
  })
}

function main() {
  const applicationsDirectory = process.argv[2]
  const proxyConfigDirectory = process.argv[3]

  console.info(`generating proxy configuration from directory ${applicationsDirectory} to ${proxyConfigDirectory}`)

  const applications = readApplications(applicationsDirectory)
  const template = fs.readFileSync(path.join(proxyConfigDirectory, 'haproxy.cfg.template'), 'utf-8')

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
