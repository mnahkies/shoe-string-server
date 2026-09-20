import {$} from "zx"

/**
 * Returns a list of running compose files (absolute paths),
 * as read from container labels using docker ps/inspect
 */
export async function getRunningComposeFiles(): Promise<string[]> {
  const runningComposeContainerIds = (
    await $`docker ps -q --filter label=com.docker.compose.project.config_files`
  ).stdout
    .split("\n")
    .filter(Boolean)

  if (!runningComposeContainerIds.length) {
    return []
  }

  const result =
    await $`docker inspect ${runningComposeContainerIds} --format '{{with .Config.Labels}}{{index . "com.docker.compose.project.config_files"}}{{end}}'`

  return result.stdout
    .split("\n")
    .flatMap((it) => it.split(","))
    .map((it) => it.trim())
    .filter(Boolean)
}
