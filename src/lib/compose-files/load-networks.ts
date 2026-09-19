import {forEachComposeFile} from "./compose-files.ts"

/**
 * Parses all YAML compose files in the provided directories (or files),
 * extracting all network names defined at top-level.
 * Returns a sorted list of unique network names excluding built-in docker networks.
 */
export async function loadNetworks(
  paths: string | string[],
): Promise<string[]> {
  const result = new Set<string>()

  for await (const {spec} of forEachComposeFile(paths)) {
    for (const [name, network] of Object.entries(spec.networks ?? {})) {
      if (!network?.external) {
        continue
      }

      const resolvedName =
        network.name ||
        (typeof network.external === "object" && network.external.name) ||
        name

      result.add(resolvedName)
    }
  }

  return Array.from(result).sort()
}
