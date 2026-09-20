import path from "node:path"
import type {Command} from "@bomb.sh/tab"
import {$} from "zx"
import {buildProcessEnv, type ServerConfig} from "../config.ts"
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
import type {Cmd} from "./types.ts"

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

  const secrets = await loadSecrets({file: config.secretsFile})
  const envWithSecrets = buildProcessEnv(config, secrets)

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

export async function action(
  config: ServerConfig,
  opts: UpOptions = {},
): Promise<void> {
  await up(config, opts)
}

export async function registerCompletions(
  cmd: Command | undefined,
  config: ServerConfig | undefined,
) {
  if (!cmd) {
    throw new Error("couldn't find command")
  }

  const possibleTargets = config
    ? await resolveAppTargets(config.appsDir, [])
    : []

  // there's no good way to communicate the lack of options, so just return
  if (!possibleTargets.length) {
    return
  }

  const targetsArgument = cmd.arguments.get("targets")

  if (!targetsArgument) {
    throw new Error("couldn't find targets argument")
  }

  targetsArgument.handler = (complete) => {
    for (const target of possibleTargets) {
      complete(path.basename(target), "")
    }
  }
}

export const upCmd = {
  action,
  registerCompletions,
} satisfies Cmd<UpOptions>
