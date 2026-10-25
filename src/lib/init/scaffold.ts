import path from "node:path"
import {dump} from "js-yaml"
import type {z} from "zod"
import {
  type ApplicationWizardContext,
  applicationRegistry,
  type InstallApplication,
} from "../../registry/application-registry.ts"
import {
  type HaproxyInput,
  haproxy,
} from "../../registry/applications/haproxy.ts"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"

export interface InitAnswers {
  appsDir: string
  proxies: HaproxyInput[]
  applications: InstallApplication<ApplicationWizardContext, z.ZodObject>[]
}

export function renderClusterYaml(answers: InitAnswers): string {
  const header = [
    "# shoe-string-server cluster configuration",
    "#",
    "# All paths resolve relative to this file. See the shoe-string-server README",
    "# for the full schema.",
    "",
  ].join("\n")

  return (
    header +
    dump({
      appsDir: answers.appsDir,
      environment: {},
    })
  )
}

export function validateProxies(proxies: HaproxyInput[]): void {
  const seen: Record<"name" | "containerName" | "confDir", Set<string>> = {
    name: new Set(),
    containerName: new Set(),
    confDir: new Set(),
  }

  for (const proxy of proxies) {
    for (const field of ["name", "containerName", "confDir"] as const) {
      const value = proxy[field]
      if (seen[field].has(value)) {
        throw new Error(`duplicate proxy ${field}: '${value}'`)
      }
      seen[field].add(value)
    }
  }
}

export function validateAnswers(answers: InitAnswers): void {
  validateProxies(answers.proxies)

  const proxyNames = answers.proxies.map((proxy) => proxy.name)

  const seenAppNames = new Set<string>()

  for (const {application, inputs} of answers.applications) {
    const parsed = application.inputs.parse(inputs)
    application.validate?.(parsed, {proxyNames})

    // the compose project name doubles as the compose file name
    const name =
      application.templates.compose?.(parsed)?.name || application.name

    if (seenAppNames.has(name)) {
      throw new Error(`duplicate application name: '${name}'`)
    }

    seenAppNames.add(name)
  }
}

/**
 * Writes the cluster skeleton: directory structure, cluster.yaml, the
 * haproxy application (compose file + conf template) for each proxy, and
 * every selected application.
 * Returns the created file paths.
 */
export async function writeCluster(
  rootConfDir: string,
  answers: InitAnswers,
): Promise<string[]> {
  const fs = getFsAdaptor()
  const created: string[] = []

  const appsDir = path.resolve(rootConfDir, answers.appsDir)

  for (const dir of [
    rootConfDir,
    path.join(rootConfDir, "data"),
    path.join(rootConfDir, "conf"),
    appsDir,
  ]) {
    await fs.mkdir(dir, {recursive: true})
  }

  const clusterYamlPath = path.join(rootConfDir, "cluster.yaml")
  await fs.writeFile(clusterYamlPath, renderClusterYaml(answers))

  created.push(clusterYamlPath)

  for (const proxy of answers.proxies) {
    created.push(
      ...(await applicationRegistry.renderApplication(haproxy, proxy, fs, {
        rootConfDir,
        appsDir,
      })),
    )
  }
  created.push(
    ...(await applicationRegistry.renderApplications(answers.applications, fs, {
      rootConfDir,
      appsDir,
    })),
  )

  return created
}
