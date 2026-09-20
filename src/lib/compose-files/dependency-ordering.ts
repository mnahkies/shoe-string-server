import path from "node:path"
import {z} from "zod"
import {loadComposeFile} from "./compose-files.ts"

/**
 * Returns files sorted by the order they should be started, based on their dependencies
 * @param files
 */
export async function sortByStartOrder(
  files: string[],
): Promise<{startOrder: string[]; missing: string[]}> {
  const result = await sortByDependencies(files)

  if (result.circular.length > 0) {
    throw new Error(
      `Circular dependencies found: ${result.circular.join(", ")}`,
    )
  }

  return {startOrder: result.sorted, missing: result.missing}
}

/**
 * Returns files sorted by the order they should be stopped, based on their dependencies
 * @param files
 */
export async function sortByStopOrder(
  files: string[],
): Promise<{stopOrder: string[]; missing: string[]}> {
  const result = await sortByDependencies(files)

  if (result.circular.length > 0) {
    throw new Error(
      `Circular dependencies found: ${result.circular.join(", ")}`,
    )
  }

  return {stopOrder: result.sorted.reverse(), missing: result.missing}
}

async function sortByDependencies(files: string[]): Promise<{
  sorted: string[]
  missing: string[]
  circular: string[]
}> {
  const filesSet = new Set(files)
  const remaining = new Map<string, Set<string>>()
  const missing = new Set<string>()

  for (const file of files) {
    const composeSpec = await loadComposeFile(file)
    const requires = z
      .array(z.string())
      .default([])
      .parse(composeSpec["x-requires"])
    // entries are resolved against the directory of the declaring compose
    // file, mirroring how Compose itself resolves relative paths
    const dependencies = requires.map((it) =>
      path.resolve(path.dirname(file), it),
    )
    remaining.set(file, new Set(dependencies.filter((it) => filesSet.has(it))))

    for (const dependency of dependencies) {
      if (!filesSet.has(dependency)) {
        missing.add(dependency)
      }
    }
  }

  const graph = topoSort(remaining)

  return {
    sorted: graph.order,
    missing: Array.from(missing),
    circular: Array.from(graph.circular),
  }
}

function remove(a: Set<unknown>, b: Set<unknown>) {
  for (const it of b) {
    a.delete(it)
  }
}

type DependencyGraph = {order: string[]; circular: Set<string>}

/**
 * Stable topological sort over a name -> direct-dependency-set graph.
 *
 * Names with no remaining dependencies are emitted in sorted order. Any names
 * left over participate in a dependency cycle and are reported as `circular`.
 */
function topoSort(remaining: Map<string, Set<string>>): DependencyGraph {
  const order: string[] = []

  while (remaining.size > 0) {
    const noDeps = []
    const noDepsSet = new Set()

    const hasDeps: [string, Set<string>][] = []

    for (const [name, deps] of remaining) {
      if (deps.size === 0) {
        noDeps.push(name)
        noDepsSet.add(name)
      } else {
        hasDeps.push([name, deps])
      }
    }

    noDeps.sort()

    order.push(...noDeps)

    if (noDepsSet.size === 0) {
      // remaining dependencies are inter-dependent
      break
    }

    for (const name of noDeps) {
      remaining.delete(name)
    }

    for (const [, deps] of hasDeps) {
      remove(deps, noDepsSet)
    }
  }

  return {order, circular: new Set(remaining.keys())}
}
