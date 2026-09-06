import {$} from "zx"
import {
  buildProcessEnv,
  type GlobalOptions,
  loadEnv,
  resolveConfig,
  type ServerConfig,
} from "../config.ts"
import {resolveAppTargets} from "../lib/compose-files/compose-files.ts"
import {
  generateOverlayFileForComposeFile,
  getOverlayFilePathForComposeFile,
} from "../lib/compose-files/generated-overlay.ts"
import {ensureDataDirectories} from "../lib/compose-files/volumes.ts"
import {getFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {createNetworks} from "../lib/networks/create-networks.ts"
import {discoverProxies} from "../lib/proxy/haproxy-bindings.ts"
import {generateHaproxyConfig} from "../lib/proxy/haproxy-generate.ts"
import {loadSecrets} from "../lib/secrets.ts"
import {reloadHaproxy} from "./reload-haproxy.ts"

export interface UpOptions {
  targets?: string[]
  build?: boolean
  forceRecreate?: boolean
  debug?: boolean
}

/**
 * Pre-generates haproxy.cfg for all configured proxies before any container boots.
 */
export async function generateAllProxyConfigs(
  config: ServerConfig,
): Promise<void> {
  const proxies = await discoverProxies(config.appsDir)

  for (const proxy of proxies) {
    const proxyConfig = config.proxies.find((it) => it.name === proxy.name)

    if (!proxyConfig) {
      throw new Error(`Proxy '${proxy.name}' not found in cluster config`)
    }

    await generateHaproxyConfig(config.appsDir, proxyConfig)
  }
}

/**
 * Regenerates config and sends SIGHUP only to proxies whose own compose file
 * was started or recreated.
 */
export async function reloadAffectedProxies(
  config: ServerConfig,
  startedFiles: string[],
): Promise<void> {
  const proxies = await discoverProxies(config.appsDir)
  const affected = proxies.filter((proxy) =>
    startedFiles.includes(proxy.appsFile),
  )

  for (const proxy of affected) {
    const proxyConfig = config.proxies.find((it) => it.name === proxy.name)

    if (!proxyConfig) {
      throw new Error(`Proxy '${proxy.name}' not found in cluster config`)
    }

    await reloadHaproxy(config.appsDir, proxyConfig)
  }
}

export async function up(
  config: ServerConfig,
  options: UpOptions = {},
): Promise<void> {
  const fs = getFsAdaptor()
  const files = await resolveAppTargets(config.appsDir, options.targets ?? [])

  const env = await loadEnv(config)
  const secrets = await loadSecrets({file: config.secretsFile})
  const envWithSecrets = buildProcessEnv(env, secrets)

  if (files.length === 0) {
    console.log("No applications to start")
    return
  }

  await createNetworks(files)

  // Invariant: generate proxy configs for all proxies before starting any container
  await generateAllProxyConfigs(config)

  for (const file of files) {
    await ensureDataDirectories(config.rootConfDir, file)
    await generateOverlayFileForComposeFile(config.rootConfDir, file)

    const composeArgs = []
    const overlay = getOverlayFilePathForComposeFile(file)

    if (options.debug) {
      composeArgs.push('--podman-args="--log-level=debug"')
    }

    if (await fs.exists(overlay)) {
      composeArgs.push("-f", file, "-f", overlay)
    } else {
      composeArgs.push("-f", file)
    }

    composeArgs.push("up", "-d", "--remove-orphans")

    if (options.forceRecreate) {
      composeArgs.push("--force-recreate")
    }

    if (options.build) {
      composeArgs.push("--build")
    }

    console.log(`Starting application (${file})`)
    const result = await $({
      env: envWithSecrets,
    })`docker compose ${composeArgs}`.verbose()

    if (result.exitCode !== 0) {
      throw new Error(`docker compose failed for ${file}:\n${result.stderr}`)
    }
  }

  // Invariant: regenerate and HUP only proxies that were started/recreated
  await reloadAffectedProxies(config, files)
}

export async function upCommand(
  opts: GlobalOptions & UpOptions,
): Promise<void> {
  const config = await resolveConfig(opts)
  await up(config, {
    targets: opts.targets,
    forceRecreate: opts.forceRecreate,
    build: opts.build,
    debug: opts.debug,
  })
}
