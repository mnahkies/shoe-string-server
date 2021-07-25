const fs = require('fs')
const path = require('path')

const yaml = require('./js-yaml')

/**
 * @param directory string
 * @returns {{externalHostNames: (*|*[]), containerPort: (*|number), internalHostName: string | (() => string)}[]}
 */
module.exports.loadApplications = function loadApplications(directory) {
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

    process.stderr.write(`found application ${JSON.stringify(result)}\n`)
    return result
  }).filter(it => {
    if (!it.internalHostName) {
      process.stderr.write(`ERROR: skipping application as could not find internal hostname ${JSON.stringify(it)}\n`)
      return false
    }

    if (!it.externalHostNames.length) {
      process.stderr.write(`INFO: skipping application as had no external hostnames (${it.internalHostName})\n`)
      return false
    }

    return true
  })
}
