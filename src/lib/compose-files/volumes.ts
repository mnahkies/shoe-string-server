import path from "node:path"
import type {DeepReadonly} from "ts-essentials"
import {$} from "zx"
import type {ExtendedService} from "../../types/docker-compose-extensions.ts"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"
import {forEachComposeService} from "./compose-files.ts"

export interface BindMountSource {
  source: string
  target?: string
}

/** Type guard for a long-syntax volume with a source property. */
function volumeHasSource(it: unknown): it is BindMountSource {
  if (
    typeof it !== "object" ||
    it === null ||
    !("source" in it) ||
    typeof it.source !== "string"
  ) {
    return false
  }
  return !("target" in it) || typeof it.target === "string"
}

function volumeIsType(
  it: unknown,
  type: "conf" | "data",
): it is BindMountSource {
  return (
    volumeHasSource(it) && it.source.startsWith(`\${DATA_BASE_PATH}/${type}`)
  )
}

export function resolveVolumeSource(
  it: BindMountSource,
  rootConfDir: string,
): string {
  if (!volumeHasSource(it)) {
    throw new Error("volume missing source")
  }

  // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder in compose files
  return it.source.replace("${DATA_BASE_PATH}", rootConfDir)
}

export function getDataVolumes(
  service: DeepReadonly<ExtendedService>,
): BindMountSource[] {
  const result: BindMountSource[] = []

  for (const volume of service.volumes ?? []) {
    if (!volumeIsType(volume, "data")) {
      continue
    }

    result.push(volume)
  }
  return result
}

export function getConfVolumes(
  service: DeepReadonly<ExtendedService>,
): BindMountSource[] {
  const result: BindMountSource[] = []

  for (const volume of service.volumes ?? []) {
    if (!volumeIsType(volume, "conf")) {
      continue
    }

    result.push(volume)
  }
  return result
}

/**
 * Determines whether a bind mount source refers to a file (requiring parent dir creation)
 * or directory. Checks filesystem if source exists, otherwise applies convention
 * (trailing slash or file extension).
 */
export async function determineHostDirectoryToCreate(
  source: string,
  volume: BindMountSource,
): Promise<string> {
  const fs = getFsAdaptor()
  if (await fs.exists(source)) {
    const stat = await fs.stat(source)
    return stat.isFile() ? path.dirname(source) : source
  }

  const target = volume.target ?? volume.source
  if (source.endsWith("/") || target.endsWith("/")) {
    return source
  }

  const ext = path.extname(target)
  if (ext !== "") {
    return path.dirname(source)
  }

  return source
}

/**
 * Prepares the data directory tree:
 *  - creates missing directories
 *  - marks them no-COW on btrfs (chattr +C) to avoid copy-on-write doubling
 *    write amplification for databases and logs
 */
export async function ensureDataDirectories(
  rootConfDir: string,
  file: string,
): Promise<void> {
  const fs = getFsAdaptor()

  for await (const {service} of forEachComposeService(file)) {
    for (const volume of getDataVolumes(service)) {
      const source = resolveVolumeSource(volume, rootConfDir)
      const dir = await determineHostDirectoryToCreate(source, volume)

      if (!(await fs.exists(dir))) {
        console.info(`Creating data directory: ${dir}`)
        await fs.mkdir(dir, {recursive: true})

        // btrfs: disable copy-on-write for data dirs (no-op elsewhere)
        await $`chattr -R +C ${dir}`.quiet().nothrow()
      }
    }
  }
}
