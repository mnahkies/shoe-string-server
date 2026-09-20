import type {Command} from "@bomb.sh/tab"
import semver from "semver"
import {$} from "zx"
import type {GlobalOptions, ServerConfig} from "../config.ts"
import {
  detectInstallationType,
  type InstallationTypeGit,
  type InstallationTypePackage,
} from "../lib/self-update/installation-type.ts"
import {
  fetchLatestNpmVersion,
  getUpgradeInstructions,
} from "../lib/self-update/registry-version.ts"
import {withCwd} from "../util/cwd.ts"
import type {Cmd} from "./types.ts"

export interface SelfUpdateOptions {
  installationDir?: string
  fetchFn?: typeof fetch
}

async function updateGitInstallation({dir}: InstallationTypeGit) {
  await withCwd(dir, async () => {
    console.log(`Checking git remote in ${dir}...`)
    const remoteRes = await $`git remote`.quiet().nothrow()
    if (remoteRes.exitCode !== 0 || !remoteRes.stdout.trim()) {
      throw new Error(
        `No git remote found in ${dir}: ${remoteRes.stderr.trim() || "no remotes configured"}`,
      )
    }

    console.log("Pulling latest changes...")
    const pullRes = await $`git pull`.nothrow()
    if (pullRes.exitCode !== 0) {
      throw new Error(
        `Git pull failed in ${dir}: ${pullRes.stderr.trim() || "unknown error"}`,
      )
    }

    console.log("Installing tools with mise...")
    const miseInstallRes = await $`mise install`.nothrow()
    if (miseInstallRes.exitCode !== 0) {
      throw new Error(
        `mise install failed: ${miseInstallRes.stderr.trim() || "unknown error"}`,
      )
    }

    console.log("Installing dependencies with pnpm...")
    const pnpmInstallRes = await $`mise exec -- pnpm install`.nothrow()
    if (pnpmInstallRes.exitCode !== 0) {
      throw new Error(
        `pnpm install failed: ${pnpmInstallRes.stderr.trim() || "unknown error"}`,
      )
    }

    console.log("Building shoe-string-server...")
    const buildRes = await $`mise exec -- pnpm run build`.nothrow()
    if (buildRes.exitCode !== 0) {
      throw new Error(
        `pnpm run build failed: ${buildRes.stderr.trim() || "unknown error"}`,
      )
    }

    console.log("Self-update completed successfully")
  })
}

async function updatePackageInstallation(
  {currentVersion, packageName}: InstallationTypePackage,
  fetchFn: typeof fetch = fetch,
) {
  console.log(`Current version: ${currentVersion}`)

  try {
    console.log(`Checking npm registry for latest ${packageName} version...`)

    const latestVersion = await fetchLatestNpmVersion(packageName, fetchFn)
    console.log(`Latest version:  ${latestVersion}`)

    if (semver.gt(latestVersion, currentVersion)) {
      console.log(`\nA new version of ${packageName} is available.`)
      console.log(getUpgradeInstructions(packageName))
    } else {
      console.log(`\n${packageName} is already up to date.`)
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.log(`Could not check latest version from npm registry (${errMsg}).`)
    console.log(`\n${getUpgradeInstructions(packageName)}`)
  }
  return
}

export async function selfUpdate(
  options: SelfUpdateOptions = {},
): Promise<void> {
  const installInfo = await detectInstallationType(options.installationDir)
  const installType = installInfo.type

  switch (installType) {
    case "git":
      await updateGitInstallation(installInfo)
      break
    case "package":
      await updatePackageInstallation(installInfo, options.fetchFn)
      break
    default:
      throw new Error(
        `Unsupported installation type: ${installType satisfies never}`,
      )
  }
}

export async function action(_opts: GlobalOptions = {}): Promise<void> {
  await selfUpdate()
}

export async function registerCompletions(
  _cmd: Command | undefined,
  _config: ServerConfig | undefined,
) {
  // none yet
  return
}

export const selfUpdateCmd = {
  action,
  registerCompletions,
} satisfies Cmd
