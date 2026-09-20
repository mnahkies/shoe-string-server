import path from "node:path"
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

export async function reconcile(opts: GlobalOptions = {}): Promise<boolean> {
  const rootConfDir = path.resolve(
    opts.dataDir || process.env.DATA_BASE_PATH || process.cwd(),
  )

  const hasChanges = await withCwd(rootConfDir, async () => {
    console.log(`Fetching git updates in ${rootConfDir}...`)

    const fetchRes = await $`git fetch`.nothrow()

    if (fetchRes.exitCode !== 0) {
      throw new Error(
        `Git fetch failed in ${rootConfDir}: ${fetchRes.stderr.trim() || "unknown error"}`,
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
    const config = await resolveConfig(opts)
    await up(config)
  }

  return hasChanges
}

export async function action(opts: GlobalOptions): Promise<void> {
  await reconcile(opts)
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
