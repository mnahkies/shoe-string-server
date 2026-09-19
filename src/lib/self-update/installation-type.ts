import path from "node:path"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"
import {findInstallationDir, PACKAGE_NAME} from "./find-installation-dir.ts"

export type InstallationTypeGit = {
  type: "git"
  dir: string
  packageName: string
  currentVersion: string
}
export type InstallationTypePackage = {
  type: "package"
  dir: string
  packageName: string
  currentVersion: string
}

export type InstallationType = InstallationTypeGit | InstallationTypePackage

export async function detectInstallationType(
  startPathOrDir?: string,
): Promise<InstallationType> {
  const fs = getFsAdaptor()
  const dir = await findInstallationDir(startPathOrDir)
  const packageJsonPath = path.join(dir, "package.json")

  const content = await fs.readFile(packageJsonPath)
  const pkg = JSON.parse(content)
  const currentVersion = pkg.version

  const isGit = await fs.exists(path.join(dir, ".git"))

  if (isGit) {
    return {type: "git", dir, packageName: PACKAGE_NAME, currentVersion}
  }

  return {type: "package", dir, packageName: PACKAGE_NAME, currentVersion}
}
