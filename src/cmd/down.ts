import path from "node:path"
import type {Command} from "@bomb.sh/tab"
import {$} from "zx"
import {
  buildProcessEnv,
  type GlobalOptions,
  resolveConfig,
  type ServerConfig,
} from "../config.ts"
import {
  resolveAppTargets,
  resolveRunningAppTargets,
} from "../lib/compose-files/compose-files.ts"
import {loadSecrets} from "../lib/secrets.ts"
import type {Cmd} from "./types.ts"

export interface DownOptions {
  targets?: string[]
}

/**
 * Stops applications. With no targets, stops every application and prunes
 * unused networks; with targets, only the matching application stacks.
 */
export async function down(
  config: ServerConfig,
  options: DownOptions = {},
): Promise<void> {
  const files = await resolveAppTargets(config.appsDir, options.targets ?? [])

  const secrets = await loadSecrets({file: config.secretsFile})
  const envWithSecrets = buildProcessEnv(config, secrets)

  for (const file of files) {
    console.log(`Stopping application (${file})`)

    await $({
      env: envWithSecrets,
    })`docker compose --file ${file} down --remove-orphans`
  }

  if (!options.targets || options.targets.length === 0) {
    console.log("Pruning unused docker networks...")
    await $`docker network prune -f`
  }
}

export async function action(opts: GlobalOptions & DownOptions): Promise<void> {
  const config = await resolveConfig(opts)
  await down(config, {targets: opts.targets})
}

export async function registerCompletions(
  cmd: Command | undefined,
  config: ServerConfig | undefined,
) {
  if (!cmd) {
    throw new Error("couldn't find command")
  }

  const possibleTargets = config
    ? await resolveRunningAppTargets(config.appsDir, [])
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

export const downCmd = {
  action,
  registerCompletions,
} satisfies Cmd
