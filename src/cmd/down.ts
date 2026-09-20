import path from "node:path"
import type {Command} from "@bomb.sh/tab"
import {$} from "zx"
import {buildProcessEnv, type ServerConfig} from "../config.ts"
import {
  resolveAppTargets,
  resolveRunningAppTargets,
} from "../lib/compose-files/compose-files.ts"
import {sortByStopOrder} from "../lib/compose-files/dependency-ordering.ts"
import {getOverlayFilePathForComposeFile} from "../lib/compose-files/generated-overlay.ts"
import {getFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
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
  const fs = getFsAdaptor()

  const secrets = await loadSecrets({
    file: config.secretsFile,
    filter: undefined,
  })
  const envWithSecrets = buildProcessEnv(config, secrets)

  if (files.length === 0) {
    console.log("No applications to stop")
    return
  }

  const {stopOrder} = await sortByStopOrder(files)

  // todo: figure out if we're stopping something that has dependencies
  //      eg: stopping postgres should stop all that depend on it
  //          but stopping some-api shouldn't stop postgres

  for (const file of stopOrder) {
    console.log(`Stopping application (${file})`)

    const composeArgs = ["--file", file]
    const overlay = getOverlayFilePathForComposeFile(file)

    if (await fs.exists(overlay)) {
      composeArgs.push("--file", overlay)
    }

    await $({
      env: envWithSecrets,
    })`docker compose ${composeArgs} down --remove-orphans`
  }

  if (!options.targets || options.targets.length === 0) {
    console.log("Pruning unused docker networks...")
    await $`docker network prune -f`
  }
}

export async function action(
  config: ServerConfig,
  opts: DownOptions = {},
): Promise<void> {
  await down(config, opts)
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
} satisfies Cmd<DownOptions>
