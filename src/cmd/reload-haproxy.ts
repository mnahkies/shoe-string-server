import type {Command} from "@bomb.sh/tab"
import {$} from "zx"
import type {ServerConfig} from "../config.ts"
import {discoverProxies} from "../lib/proxy/haproxy-bindings.ts"
import {generateHaproxyConfig} from "../lib/proxy/haproxy-generate.ts"
import type {Cmd} from "./types.ts"

export async function reloadHaproxy(
  appsDir: string,
  proxyConfig: {name: string; confDir: string; containerName: string},
  rootConfDir: string,
): Promise<void> {
  await generateHaproxyConfig(appsDir, proxyConfig, rootConfDir)

  const running = (
    await $`docker ps -aq -f status=running -f name=^/?${proxyConfig.containerName}$`
      .quiet()
      .nothrow()
  ).stdout.trim()

  if (running) {
    console.log(`Sending HUP to ${proxyConfig.containerName}...`)
    await $`docker kill -s HUP ${proxyConfig.containerName}`
  }
}

/**
 * Regenerates proxy configs for every proxy in the cluster config, then reloads
 * each via SIGHUP if its container is running.
 */
export async function action(config: ServerConfig): Promise<void> {
  const discovered = await discoverProxies(config.appsDir)

  for (const proxy of discovered) {
    await reloadHaproxy(config.appsDir, proxy, config.rootConfDir)
  }
}

export async function registerCompletions(
  _cmd: Command | undefined,
  _config: ServerConfig | undefined,
) {
  // none yet
  return
}

export const reloadHaproxyCmd = {
  action,
  registerCompletions,
} satisfies Cmd
