import {createHash} from "node:crypto"
import path from "node:path"
import type {
  ExtendedComposeSpecification,
  ExtendedService,
} from "../../types/docker-compose-extensions.ts"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"
import type {FsAdaptor} from "../file-system/types.ts"
import {loadComposeFile, saveComposeFile} from "./compose-files.ts"
import {getConfVolumes, resolveVolumeSource} from "./volumes.ts"

/**
 * Returns the path to the generated overlay file for a given compose file.
 */
export function getOverlayFilePathForComposeFile(file: string): string {
  const directory = path.dirname(file)
  const basename = path.basename(file)
  return path.join(directory, `overlays`, `${basename}.overlay.yaml`)
}

async function listAllFiles(fs: FsAdaptor, dir: string): Promise<string[]> {
  if (!(await fs.exists(dir))) {
    return []
  }
  const stat = await fs.stat(dir)
  if (stat.isFile()) {
    return [dir]
  }
  const entries = await fs.readdir(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const entryStat = await fs.stat(full)
    if (entryStat.isDirectory()) {
      files.push(...(await listAllFiles(fs, full)))
    } else {
      files.push(full)
    }
  }
  return files.sort()
}

async function hashPath(fs: FsAdaptor, targetPath: string): Promise<string> {
  const files = await listAllFiles(fs, targetPath)
  const hash = createHash("sha256")
  for (const file of files) {
    const content = await fs.readFile(file)
    const fileHash = createHash("sha256").update(content).digest("hex")
    hash.update(`${fileHash}  ${file}\n`)
  }
  return hash.digest("hex")
}

/**
 * Generates an overlay file with labels hashing conf volume mounts,
 * this then allows docker compose to know when to recreate containers based on conf changes.
 *
 * Also manages `userns_mode` mapping based on `user`
 */
export async function generateOverlayFileForComposeFile(
  rootConfDir: string,
  file: string,
) {
  const composeFile = await loadComposeFile(file)
  const overlay: ExtendedComposeSpecification = {}

  if (!composeFile["x-podman"]?.in_pod) {
    overlay["x-podman"] = {in_pod: false}
  }

  const fs = getFsAdaptor()

  for (const [serviceName, service] of Object.entries(
    composeFile?.services ?? {},
  )) {
    const configLabels: Record<string, string> = {}

    for (const volume of getConfVolumes(service)) {
      const label = volume.source
        .replace(`$\{DATA_BASE_PATH}/conf/`, "")
        .replaceAll("/", ".")

      const dir = resolveVolumeSource(volume, rootConfDir)
      configLabels[`hash.${label}`] = await hashPath(fs, dir)
    }

    let hasFragment = false
    const fragment: ExtendedService = {}

    if (Object.keys(configLabels).length > 0) {
      fragment.labels = configLabels
      hasFragment = true
    }

    if (service.user) {
      const user =
        service.user.indexOf(":") > -1
          ? service.user.split(":")
          : [service.user, service.user]

      fragment.userns_mode = `keep-id:uid=${user[0]},gid=${user[1]}`
      hasFragment = true
    } else {
      console.warn(
        `No user defined for service ${serviceName}, volume mounts may have incorrect permissions`,
      )
    }

    if (
      !service.security_opt?.length ||
      !service.security_opt.find((opt) => opt.startsWith("label="))
    ) {
      console.warn(
        `No SELinux label defined for service ${serviceName}, volume mounts may have incorrect permissions`,
      )
    }

    if (hasFragment) {
      overlay.services ??= {}
      overlay.services[serviceName] = fragment
    }
  }

  const overlayPath = getOverlayFilePathForComposeFile(file)
  await saveComposeFile(overlayPath, overlay)
}
