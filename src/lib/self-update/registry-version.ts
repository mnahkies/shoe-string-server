export function getUpgradeInstructions(
  packageName: string = "shoe-string-server",
): string {
  return [
    `${packageName} was installed via a package manager. To upgrade, run the appropriate command for your environment:`,
    "",
    `  mise:   mise upgrade npm:${packageName}`,
    `  pnpm:   pnpm add -g ${packageName}@latest`,
    `  npm:    npm install -g ${packageName}@latest`,
    `  yarn:   yarn global add ${packageName}@latest`,
  ].join("\n")
}

export async function fetchLatestNpmVersion(
  packageName: string = "shoe-string-server",
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchFn(
    `https://registry.npmjs.org/${packageName}/latest`,
    {
      headers: {Accept: "application/json"},
      signal: AbortSignal.timeout(5000),
    },
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
  }

  const data = (await response.json()) as {version?: string}
  if (!data || typeof data.version !== "string") {
    throw new Error("Invalid response from npm registry: missing version")
  }
  return data.version
}
