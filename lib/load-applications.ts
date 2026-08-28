import fs from 'node:fs'
import path from 'node:path'
import yaml from './js-yaml.js'

export interface Application {
  internalHostName: string
  containerHostName: string
  externalHostNames: string[]
  containerPort: number
}

/*
Simple format (single port):
  x-container-port: 3000
  x-external-host-names:
    - grafana.example.com
  services:
    application:
      hostname: monitoring_grafana

Multi-port format (e.g. garage):
  services:
    application:
      hostname: garage
      x-external-host-names:
        - [3900, garage-s3.example.com]
        - [3901, garage-rpc.example.com]
*/

export function loadApplications(directory: string): Application[] {
  const applications = []
  const applicationFilenames = fs.readdirSync(directory)

  for (const applicationFilename of applicationFilenames) {
    if (!applicationFilename.endsWith('.yaml') && !applicationFilename.endsWith('.yml')) {
      continue
    }

    const application = yaml.load(fs.readFileSync(path.join(directory, applicationFilename), 'utf-8'))
    applications.push(application)
  }

  return applications.flatMap((app: any) => {
    const result: Application[] = []

    const topLevelExternalHostNames = app['x-external-host-names']

    if (Array.isArray(topLevelExternalHostNames) && topLevelExternalHostNames.length) {
      // Simple format: top-level x-external-host-names are plain strings
      const internalHostName = app?.services?.application?.hostname
      const containerPort = app['x-container-port'] ?? 80
      const externalHostNames = topLevelExternalHostNames

      result.push({
        internalHostName,
        containerHostName: internalHostName,
        externalHostNames,
        containerPort,
      })

      process.stderr.write(`found application ${JSON.stringify(result[result.length - 1])}\n`)
    } else {
      // Multi-port format: x-external-host-names on individual services as [port, hostname] tuples
      for (const service of Object.values(app?.services ?? {}) as any[]) {
        const serviceExternalHostNames = service['x-external-host-names']

        if (!service.hostname || !Array.isArray(serviceExternalHostNames) || !serviceExternalHostNames.length) {
          continue
        }

        for (const [containerPort, hostName] of serviceExternalHostNames) {
          const entry: Application = {
            internalHostName: `${service.hostname}_${containerPort}`,
            containerHostName: service.hostname,
            externalHostNames: [hostName],
            containerPort,
          }
          result.push(entry)
          process.stderr.write(`found application ${JSON.stringify(entry)}\n`)
        }
      }
    }

    return result
  }).filter((it: Application) => {
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
