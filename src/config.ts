import path from "node:path"
import {load as loadYaml} from "js-yaml"
import {z} from "zod"
import {getFsAdaptor} from "./lib/file-system/fs-adaptor.ts"

export type GlobalOptions = {
  dataDir?: string
  secretsFile?: string
}

export interface ProxyConfig {
  name: string
  containerName: string
  conf: string
}

export interface ServerConfig {
  rootConfDir: string
  secretsFile: string
  appsDir: string
  proxies: ProxyConfig[]
  environment: Record<string, string>
}

const clusterConfigSchema = z
  .object({
    appsDir: z.string().optional().default("applications"),
    secretsFile: z.string().optional().default("secrets.encrypted.yaml"),
    proxies: z
      .array(
        z
          .object({
            name: z.string().min(1),
            containerName: z.string(),
            conf: z.string(),
          })
          .strict(),
      )
      .optional()
      .default([]),
    environment: z.record(z.string(), z.string()).optional().default({}),
  })
  .strict()

type ClusterConfig = z.infer<typeof clusterConfigSchema>

/**
 * Loads cluster.yaml from the data directory.
 * All paths in the file resolve relative to the data directory, unless absolute.
 */
export async function loadClusterConfigFile(
  rootConfDir: string,
): Promise<ClusterConfig> {
  const fs = getFsAdaptor()
  const rootConfFile = path.join(rootConfDir, "cluster.yaml")

  if (!(await fs.exists(rootConfFile))) {
    throw new Error(`cluster.yaml not found in ${rootConfFile}`)
  }

  return clusterConfigSchema.parse(loadYaml(await fs.readFile(rootConfFile)))
}

function resolvePath(rootConfDir: string, filename: string): string {
  return path.isAbsolute(filename) ? filename : path.join(rootConfDir, filename)
}

export async function resolveConfig(
  opts: GlobalOptions,
): Promise<ServerConfig> {
  const fs = getFsAdaptor()

  const rootConfDir = path.resolve(
    opts.dataDir || process.env.DATA_BASE_PATH || process.cwd(),
  )

  const config = await loadClusterConfigFile(rootConfDir)
  const secretsFile = resolvePath(
    rootConfDir,
    opts.secretsFile ?? config.secretsFile,
  )

  if (!(await fs.exists(secretsFile))) {
    throw new Error(`secretsFile must exist, got: ${secretsFile}`)
  }

  const appsDir = resolvePath(rootConfDir, config.appsDir)

  if (!(await fs.exists(appsDir))) {
    throw new Error(`appsDir must exist, got: ${appsDir}`)
  }

  const proxies: ProxyConfig[] = config.proxies.map((it) => {
    return {
      name: it.name,
      containerName: it.containerName,
      conf: resolvePath(rootConfDir, it.conf),
    }
  })

  for (const proxy of proxies) {
    if (!(await fs.exists(proxy.conf))) {
      throw new Error(`proxy.conf must exist, got: ${proxy.conf}`)
    }
  }

  return {
    rootConfDir,
    secretsFile,
    appsDir,
    proxies,
    environment: config.environment,
  }
}

function loadEnvFromConfig(config: ServerConfig): Record<string, string> {
  return {
    ...config.environment,
    DATA_BASE_PATH: config.rootConfDir,
  }
}

/**
 * Builds process environment with strict precedence:
 * 1. Cluster configuration environment (config.environment + DATA_BASE_PATH)
 * 2. Decrypted secrets
 * 3. Process environment (process.env)
 */
export function buildProcessEnv(
  config: ServerConfig,
  secrets: Record<string, string>,
  processEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  return {
    ...loadEnvFromConfig(config),
    ...secrets,
    ...processEnv,
  }
}
