#!/usr/bin/env node
import {fileURLToPath} from "node:url"
import {parseArgs} from "node:util"
import tab from "@bomb.sh/tab/commander"
import {Command} from "commander"
import {z} from "zod"
import packageJson from "../package.json" with {type: "json"}
import {downCommand} from "./cmd/down.ts"
import {reconcileCommand} from "./cmd/reconcile.ts"
import {reloadHaproxyCommand} from "./cmd/reload-haproxy.ts"
import {loadSecretsCommand} from "./cmd/secrets.ts"
import {selfUpdateCommand} from "./cmd/self-update.ts"
import {upCmd} from "./cmd/up.ts"
import {resolveConfig} from "./config.ts"

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

/**
 * Creates the full CLI program, including all commands and options.
 */
export function createProgram(): Command {
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
    .action((targets, _, cmd) =>
      upCmd.action({...cmd.optsWithGlobals(), targets}),
    )

  program
    .command("down")
    .description(
      "Stop applications and prune unused networks (targeted by default)",
    )
    .argument("[targets...]", "Application(s) to stop; defaults to all")
    .action((targets, _, cmd) =>
      downCommand({...cmd.optsWithGlobals(), targets}),
    )

  program
    .command("reconcile")
    .description("Fetch git updates and reconcile applications")
    .action((_, cmd) => reconcileCommand(cmd.optsWithGlobals()))

  program
    .command("reload-proxy")
    .description("Re-generate proxy configs and send HUP signal")
    .action((_, cmd) => reloadHaproxyCommand(cmd.optsWithGlobals()))

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
    .action((_, cmd) => loadSecretsCommand(cmd.optsWithGlobals()))

  program
    .command("self-update")
    .description("Update shoe-string to the latest version")
    .action((_, cmd) => selfUpdateCommand(cmd.optsWithGlobals()))

  return program
}

export async function main(args: string[] = process.argv): Promise<void> {
  const config = await resolveConfig(parseMinimalConfigArgs([...args])).catch(
    () => {
      /* we don't want to fail to provide completions if config isn't available */
      return undefined
    },
  )

  const program = createProgram()
  const completion = tab(program)

  await upCmd.registerCompletions(completion.commands.get("up"), config)

  await program.parseAsync([...args])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
