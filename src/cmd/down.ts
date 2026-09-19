import {$} from "zx"
import {
  buildProcessEnv,
  type GlobalOptions,
  resolveConfig,
  type ServerConfig,
} from "../config.ts"
import {resolveAppTargets} from "../lib/compose-files/compose-files.ts"
import {loadSecrets} from "../lib/secrets.ts"

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

export async function downCommand(
  opts: GlobalOptions & DownOptions,
): Promise<void> {
  const config = await resolveConfig(opts)
  await down(config, {targets: opts.targets})
}
