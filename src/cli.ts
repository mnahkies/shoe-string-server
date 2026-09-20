#!/usr/bin/env node
import {fileURLToPath} from "node:url"
import {parseArgs} from "node:util"
import tab from "@bomb.sh/tab/commander"
import {Command} from "commander"
import {z} from "zod"
import packageJson from "../package.json" with {type: "json"}
import {cmds} from "./cmd/index.ts"
import {resolveConfig, type ServerConfig} from "./config.ts"

/**
 * Minimal arg parsing for loading server config
 */
export function parseMinimalConfigArgs(args: string[]) {
  const schema = z.object({
    dataDir: z.string().optional(),
    secretsFile: z.string().optional(),
  })

  const {values} = parseArgs({
    options: {
      "data-dir": {
        type: "string",
        default: undefined,
        short: "d",
      },
      "secrets-file": {
        type: "string",
        default: undefined,
      },
    },
    strict: false,
    args,
  })

  return schema.parse({
    dataDir: values["data-dir"],
    secretsFile: values["secrets-file"],
  })
}

type MaybeConfig = {config?: ServerConfig | undefined; loadError?: unknown}

function unwrapConfig(maybeConfig: MaybeConfig): ServerConfig {
  if (maybeConfig.config !== undefined) {
    return maybeConfig.config
  }

  throw maybeConfig.loadError instanceof Error
    ? maybeConfig.loadError
    : new Error("Could not load server configuration", {
        cause: maybeConfig.loadError,
      })
}

/**
 * Creates the full CLI program, including all commands and options.
 */
export function createProgram(maybeConfig: MaybeConfig): Command {
  const program = new Command()
    .name("shoe-string")
    .version(packageJson.version)
    .description("Server orchestration tool for containerized applications")
    .option(
      "-d, --data-dir <path>",
      "Path to configuration/data directory (default: DATA_BASE_PATH or cwd)",
    )
    .option(
      "--secrets-file <path>",
      "Path to secrets file (default: DATA_BASE_PATH/secrets.encrypted.yaml)",
    )

  program
    .command("up")
    .description("Provision networks, start applications, and reload proxies")
    .argument("[targets...]", "Application(s) to start; defaults to all")
    .option(
      "--force-recreate",
      "Force recreation of containers, even if nothing changed",
    )
    .option("--build", "Build images before starting containers.")
    .option("--debug", "Enable debug logging")
    .action((targets, opts) =>
      cmds.up.action(unwrapConfig(maybeConfig), {
        ...opts,
        targets,
      }),
    )

  program
    .command("down")
    .description(
      "Stop applications and prune unused networks (targeted by default)",
    )
    .argument("[targets...]", "Application(s) to stop; defaults to all")
    .action((targets, opts) =>
      cmds.down.action(unwrapConfig(maybeConfig), {
        ...opts,
        targets,
      }),
    )

  program
    .command("reconcile")
    .description("Fetch git updates and reconcile applications")
    .action((_, cmd) =>
      cmds.reconcile.action(
        unwrapConfig(maybeConfig),
        undefined,
        cmd.optsWithGlobals(),
      ),
    )

  program
    .command("reload-proxy")
    .description("Re-generate proxy configs and send HUP signal")
    .action(() => cmds.reloadProxy.action(unwrapConfig(maybeConfig)))

  program
    .command("secrets")
    .description(
      `Decrypt and export secrets from secrets.encrypted.yaml as environment variables.`,
    )
    .option("-l, --list", "List secret keys without printing values")
    .option(
      "-f, --filter <filter>",
      "Filter secret keys (separated by | or comma)",
    )
    .action((opts) => cmds.secrets.action(unwrapConfig(maybeConfig), opts))

  program
    .command("self-update")
    .description("Update shoe-string to the latest version")
    .option(
      "--installation-dir <path>",
      "Override the automatically detected installation directory",
    )
    .action((opts) => cmds.selfUpdate.action(maybeConfig.config, opts))

  return program
}

export async function createProgramWithCompletions(maybeConfig: MaybeConfig) {
  const program = createProgram(maybeConfig)
  const completion = tab(program)

  for (const [name, cmd] of Object.entries(cmds)) {
    await cmd.registerCompletions?.(
      completion.commands.get(name),
      maybeConfig.config,
    )
  }

  return program
}

export async function main(args: string[] = process.argv): Promise<void> {
  const maybeConfig: MaybeConfig = await resolveConfig(
    parseMinimalConfigArgs([...args]),
  )
    .then((config) => ({config}))
    .catch((err) => ({loadError: err}))

  const program = await createProgramWithCompletions(maybeConfig)
  await program.parseAsync([...args])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
