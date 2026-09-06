import path from "node:path"
import {fileURLToPath} from "node:url"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"

export const PACKAGE_NAME = "shoe-string-server"
/**
 * Locates the root directory of the shoe-string-server repository by walking upwards
 * from the starting path looking for a package.json identifying "shoe-string-server".
 */
export async function findInstallationDir(
  startPath: string = fileURLToPath(import.meta.url),
): Promise<string> {
  const fs = getFsAdaptor()
  let currentDir = path.resolve(startPath)

  if (await fs.exists(currentDir)) {
    const stat = await fs.stat(currentDir)
    if (stat.isFile()) {
      currentDir = path.dirname(currentDir)
    }
  } else {
    currentDir = path.dirname(currentDir)
  }

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json")
    if (await fs.exists(packageJsonPath)) {
      try {
        const content = await fs.readFile(packageJsonPath)
        const pkg = JSON.parse(content)
        if (pkg.name === PACKAGE_NAME) {
          return currentDir
        }
      } catch {
        // Continue searching parent directories if package.json cannot be parsed
      }
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  throw new Error(`Unable to locate ${PACKAGE_NAME} installation directory`)
}
