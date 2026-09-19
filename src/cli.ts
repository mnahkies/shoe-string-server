#!/usr/bin/env node
import {fileURLToPath} from "node:url"
import {Command} from "@commander-js/extra-typings"
import packageJson from "../package.json" with {type: "json"}
import {downCommand} from "./cmd/down.ts"
import {reconcileCommand} from "./cmd/reconcile.ts"
import {reloadHaproxyCommand} from "./cmd/reload-haproxy.ts"
import {loadSecretsCommand} from "./cmd/secrets.ts"
import {selfUpdateCommand} from "./cmd/self-update.ts"
import {upCommand} from "./cmd/up.ts"

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
    .action((targets, opts, cmd) =>
      upCommand({...opts, ...cmd.optsWithGlobals(), targets}),
    )

  program
    .command("down")
    .description(
      "Stop applications and prune unused networks (targeted by default)",
    )
    .argument("[targets...]", "Application(s) to stop; defaults to all")
    .action((targets, opts, cmd) =>
      downCommand({...opts, ...cmd.optsWithGlobals(), targets}),
    )

  program
    .command("reconcile")
    .description("Fetch git updates and reconcile applications")
    .action((_opts, cmd) => reconcileCommand(cmd.optsWithGlobals()))

  program
    .command("reload-proxy")
    .description("Re-generate proxy configs and send HUP signal")
    .action((_opts, cmd) => reloadHaproxyCommand(cmd.optsWithGlobals()))

  program
    .command("secrets")
    .description(
      `Decrypt and export secrets from secrets.encrypted.yaml as environment variables. Example usage:
              eval "$(shoe-string secrets --filter 'DOCKER_HUB_USERNAME|DOCKER_HUB_TOKEN')"`,
    )
    .option("-l, --list", "List secret keys without printing values")
    .option(
      "-f, --filter <filter>",
      "Filter secret keys (separated by | or comma)",
    )
    .action((opts, cmd) =>
      loadSecretsCommand({
        ...opts,
        ...cmd.optsWithGlobals(),
      }),
    )

  program
    .command("self-update")
    .description("Update shoe-string to the latest version")
    .action((_opts, cmd) => selfUpdateCommand(cmd.optsWithGlobals()))

  return program
}

export async function main(args: string[] = process.argv): Promise<void> {
  const program = createProgram()
  await program.parseAsync(args)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
