import * as yaml from "js-yaml"
import {$} from "zx"

export async function decryptSecrets(filePath: string): Promise<string> {
  const result = await $`sops -d ${filePath}`.quiet()
  return result.stdout
}

export function flattenSecrets(
  obj: unknown,
  prefix = "",
  yamlPath = "",
  seenPaths: Map<string, string> = new Map(),
): Record<string, string> {
  const result: Record<string, string> = {}

  if (typeof obj !== "object" || obj === null) {
    return result
  }

  if (Array.isArray(obj)) {
    throw new Error(
      `Unsupported secret shape at '${yamlPath || "root"}': arrays are not supported in secrets`,
    )
  }

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = yamlPath ? `${yamlPath}.${key}` : key
    const fullKey = prefix ? `${prefix}_${key}` : key

    if (value === null || value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      throw new Error(
        `Unsupported secret shape at '${currentPath}': arrays are not supported in secrets`,
      )
    }

    if (typeof value === "object") {
      Object.assign(
        result,
        flattenSecrets(value, fullKey, currentPath, seenPaths),
      )
    } else {
      const targetKey = fullKey.toUpperCase()
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(targetKey)) {
        throw new Error(
          `Invalid secret key name '${targetKey}' at '${currentPath}'. Secret keys must contain only alphanumeric characters and underscores, and cannot start with a digit.`,
        )
      }

      const existingPath = seenPaths.get(targetKey)
      if (existingPath) {
        throw new Error(
          `Collision in secret keys: '${existingPath}' and '${currentPath}' both map to '${targetKey}'`,
        )
      }
      seenPaths.set(targetKey, currentPath)
      result[targetKey] = String(value)
    }
  }

  return result
}

export function filterSecrets(
  secrets: Record<string, string>,
  filter: string[] | string,
): Record<string, string> {
  const filterList = Array.isArray(filter)
    ? filter
    : filter
        .split(/[|,]/)
        .map((it) => it.trim())
        .filter(Boolean)

  const upperFilterList = filterList.map((f) => f.toUpperCase())

  return Object.fromEntries(
    Object.entries(secrets).filter(
      ([key]) =>
        filterList.includes(key) || upperFilterList.includes(key.toUpperCase()),
    ),
  )
}

export interface LoadSecretsOptions {
  file: string
  filter?: string | string[]
  decrypt?: (filePath: string) => Promise<string>
}

export async function loadSecrets({
  file,
  filter,
  decrypt = decryptSecrets,
}: LoadSecretsOptions): Promise<Record<string, string>> {
  const parsed = yaml.load(await decrypt(file))
  const flattened = flattenSecrets(parsed)
  return filter ? filterSecrets(flattened, filter) : flattened
}
