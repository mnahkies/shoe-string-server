import {getFsAdaptor} from "./fs-adaptor.ts"

export async function assertDirectoryEmptyOrMissing(
  dir: string,
): Promise<void> {
  const fs = getFsAdaptor()
  if (!(await fs.exists(dir))) {
    return
  }

  const entries = await fs.readdir(dir)

  if (entries.length > 0) {
    throw new Error(
      `require ${dir} to be empty, but it has '${entries.length}' entries.`,
    )
  }
}

export function resolveRootConfPath(path: string, rootConfDir: string) {
  return path.replace(`$\{DATA_BASE_PATH}`, rootConfDir)
}
