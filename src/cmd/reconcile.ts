import type {Command} from "@bomb.sh/tab"
import {$} from "zx"
import {
  type GlobalOptions,
  resolveConfig,
  type ServerConfig,
} from "../config.ts"
import {withCwd} from "../util/cwd.ts"
import type {Cmd} from "./types.ts"
import {up} from "./up.ts"

export async function reconcile(
  config: ServerConfig,
  globalOpts: GlobalOptions,
): Promise<boolean> {
  const hasChanges = await withCwd(config.rootConfDir, async () => {
    console.log(`Fetching git updates in ${config.rootConfDir}...`)

    const fetchRes = await $`git fetch`.nothrow()

    if (fetchRes.exitCode !== 0) {
      throw new Error(
        `Git fetch failed in ${config.rootConfDir}: ${fetchRes.stderr.trim() || "unknown error"}`,
      )
    }

    const headRes = await $`git rev-parse HEAD`.quiet().nothrow()
    const upstreamRes = await $`git rev-parse @{u}`.quiet().nothrow()

    if (headRes.exitCode !== 0 || upstreamRes.exitCode !== 0) {
      throw new Error(
        "Unable to determine git HEAD or upstream tracking branch",
      )
    }

    const head = headRes.stdout.trim()
    const upstream = upstreamRes.stdout.trim()

    if (head === upstream) {
      console.log("Up to date - no changes to reconcile")
      return false
    }

    console.log("Not up to date - running reconcile")

    const pullRes = await $`git pull --ff-only`.nothrow()

    if (pullRes.exitCode !== 0) {
      throw new Error(
        `Git pull failed: ${pullRes.stderr.trim() || "fast-forward failed"}`,
      )
    }

    return true
  })

  if (hasChanges) {
    // cluster config may have changed on disk after the pull
    const freshConfig = await resolveConfig(globalOpts)
    await up(freshConfig)
  }

  return hasChanges
}

export async function action(
  config: ServerConfig,
  _: unknown,
  globalOpts: GlobalOptions,
): Promise<void> {
  await reconcile(config, globalOpts)
}

export async function registerCompletions(
  _cmd: Command | undefined,
  _config: ServerConfig | undefined,
) {
  // todo
  return
}

export const reconcileCmd = {
  action,
  registerCompletions,
} satisfies Cmd
