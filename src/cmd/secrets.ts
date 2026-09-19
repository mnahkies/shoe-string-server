import {type GlobalOptions, resolveConfig} from "../config.ts"
import {decryptSecrets, loadSecrets} from "../lib/secrets.ts"

export function escapeShellValue(val: string): string {
  return `'${val.replace(/'/g, `'\\''`)}'`
}

export function formatExports(secrets: Record<string, string>): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(secrets)) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      lines.push(`export ${key}=${escapeShellValue(value)}`)
    }
  }
  return lines
}

export function formatKeys(secrets: Record<string, string>): string[] {
  return Object.keys(secrets)
}

export interface LoadSecretsCommandOptions extends GlobalOptions {
  filter?: string
  list?: boolean
  decrypt?: (filePath: string) => Promise<string>
}

export async function loadSecretsCommand(
  opts: LoadSecretsCommandOptions,
): Promise<void> {
  const config = await resolveConfig({
    ...opts,
    secretsFile: opts.secretsFile,
  })

  const secrets = await loadSecrets({
    file: config.secretsFile,
    filter: opts?.filter,
    decrypt: opts?.decrypt ?? decryptSecrets,
  })

  if (opts?.list) {
    for (const key of formatKeys(secrets)) {
      console.log(key)
    }
  } else {
    for (const line of formatExports(secrets)) {
      console.log(line)
    }
  }
}
