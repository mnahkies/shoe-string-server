import path from "node:path"
import {dump, load} from "js-yaml"
import type {DeepReadonly} from "ts-essentials"
import type {ComposeSpecification} from "../../generated/types/docker-compose.ts"
import {
  type ExtendedComposeSpecification,
  type ExtendedService,
  minimalComposeSchema,
} from "../../types/docker-compose-extensions.ts"
import {deepFreeze} from "../../util/deepFreeze.ts"
import {getRunningComposeFiles} from "../docker-cli.ts"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"

/**
 * Loads a compose yaml file, returned as readonly to avoid manipulation that would
 * lose information such as comments.
 *
 * If we need to write the file back, preserving comments, we'd need to
 * switch to using an AST parser/manipulation.
 * @param filePath
 */
export async function loadComposeFile(
  filePath: string,
): Promise<DeepReadonly<ExtendedComposeSpecification>> {
  const fs = getFsAdaptor()
  const content = await fs.readFile(filePath)

  let rawParsed: unknown
  try {
    rawParsed = load(content)
  } catch (err) {
    throw new Error(
      `Failed to parse YAML in compose file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!rawParsed || typeof rawParsed !== "object") {
    throw new Error(`Failed to parse compose file at ${filePath}`)
  }

  const result = minimalComposeSchema.safeParse(rawParsed)

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")

    throw new Error(
      `Invalid compose file structure at ${filePath}:\n${errorDetails}`,
    )
  }

  return deepFreeze(rawParsed as ExtendedComposeSpecification)
}

/**
 * Serializes a compose file to yaml and writes it to disk atomically.
 */
export async function saveComposeFile<T extends ComposeSpecification>(
  filePath: string,
  composeFile: T,
): Promise<void> {
  const fs = getFsAdaptor()
  const directory = path.dirname(filePath)

  if (!(await fs.exists(directory))) {
    await fs.mkdir(directory, {recursive: true})
  }

  const content = dump(composeFile)
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`,
  )
  await fs.writeFile(tempPath, content)
  await fs.rename(tempPath, filePath)
}

/**
 * Discovers compose YAML files in a directory (recursively) or returns the file path directly.
 */
export async function getComposeFiles(
  paths: string | string[],
): Promise<string[]> {
  if (Array.isArray(paths)) {
    const results = await Promise.all(paths.map(getComposeFiles))
    return results.flat()
  }

  const fs = getFsAdaptor()

  if (!(await fs.exists(paths))) {
    return []
  }

  const stat = await fs.stat(paths)
  if (stat.isFile()) {
    return paths.endsWith(".yaml") || paths.endsWith(".yml") ? [paths] : []
  }

  const entries = await fs.readdir(paths)
  const results: string[] = []
  for (const entry of entries) {
    if (entry === "overlays") {
      continue
    }
    const full = path.join(paths, entry)
    const entryStat = await fs.stat(full)
    if (entryStat.isDirectory()) {
      results.push(...(await getComposeFiles(full)))
    } else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
      results.push(full)
    }
  }
  return results.sort()
}

export async function* forEachComposeFile(
  paths: string | string[],
): AsyncGenerator<{
  file: string
  spec: DeepReadonly<ExtendedComposeSpecification>
}> {
  const composeFiles = await getComposeFiles(paths)

  for (const file of composeFiles) {
    const composeFile = await loadComposeFile(file)
    yield {file, spec: composeFile}
  }
}

export async function* forEachComposeService(
  paths: string | string[],
): AsyncGenerator<{
  serviceName: string
  service: DeepReadonly<ExtendedService>
  file: string
}> {
  for await (const {file, spec} of forEachComposeFile(paths)) {
    for (const [serviceName, service] of Object.entries(spec?.services ?? {})) {
      yield {serviceName, service, file}
    }
  }
}

/**
 * Resolves `up`/`down` application targets into absolute compose file paths.
 *
 * Targets may be:
 *  - a path (absolute or relative to the apps dir) to a compose file
 *  - a file name, with or without the .yaml/.yml extension
 *  - a glob pattern relative to the apps dir
 * With no targets, every compose file in the apps dir is returned.
 */
export async function resolveAppTargets(
  appsDir: string,
  targets: string[],
): Promise<string[]> {
  const all = await getComposeFiles(appsDir)

  if (targets.length === 0) {
    return all
  }

  const resolved = new Set<string>()

  for (const target of targets) {
    const isGlob = target.includes("*") || target.includes("?")
    let candidates: string[] = []

    if (isGlob) {
      candidates = all.filter((it) => {
        const relative = path.relative(appsDir, it)
        const basename = path.basename(it)
        return (
          path.matchesGlob(relative, target) ||
          path.matchesGlob(it, target) ||
          path.matchesGlob(basename, target)
        )
      })
    } else {
      const normTarget = path.normalize(target)
      const absTarget = path.isAbsolute(target)
        ? normTarget
        : path.resolve(appsDir, target)

      candidates = all.filter((it) => {
        const basename = path.basename(it)
        const relFromApps = path.relative(appsDir, it)
        return (
          it === absTarget ||
          it === `${absTarget}.yaml` ||
          it === `${absTarget}.yml` ||
          it === target ||
          relFromApps === normTarget ||
          relFromApps === `${normTarget}.yaml` ||
          relFromApps === `${normTarget}.yml` ||
          basename === normTarget ||
          basename === `${normTarget}.yaml` ||
          basename === `${normTarget}.yml`
        )
      })
    }

    if (candidates.length === 0) {
      throw new Error(`No application matches target '${target}' in ${appsDir}`)
    }
    for (const candidate of candidates) {
      resolved.add(candidate)
    }
  }

  return Array.from(resolved).sort()
}

export async function resolveRunningAppTargets(
  appsDir: string,
  targets: string[],
): Promise<string[]> {
  const possibleTargets = await resolveAppTargets(appsDir, targets)
  const runningTargets = new Set(await getRunningComposeFiles())

  return possibleTargets.filter((it) => runningTargets.has(it))
}
