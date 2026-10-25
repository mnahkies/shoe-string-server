export function resolveRootConfPath(path: string, rootConfDir: string) {
  return path.replace(`$\{DATA_BASE_PATH}`, rootConfDir)
}
