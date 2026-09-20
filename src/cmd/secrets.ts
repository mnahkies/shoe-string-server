import type {Command} from "@bomb.sh/tab"
import type {ServerConfig} from "../config.ts"
import {decryptSecrets, loadSecrets} from "../lib/secrets.ts"
import type {Cmd} from "./types.ts"

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

export interface LoadSecretsCommandOptions {
  filter?: string
  list?: boolean
}

export async function action(
  config: ServerConfig,
  opts: LoadSecretsCommandOptions = {},
  _globalOpts: unknown = undefined,
  {
    decrypt = decryptSecrets,
  }: {decrypt?: (filePath: string) => Promise<string>} = {},
): Promise<void> {
  const secrets = await loadSecrets({
    file: config.secretsFile,
    filter: opts.filter,
    decrypt,
  })

  if (opts.list) {
    for (const key of formatKeys(secrets)) {
      console.log(key)
    }
  } else {
    for (const line of formatExports(secrets)) {
      console.log(line)
    }
  }
}

export async function registerCompletions(
  _cmd: Command | undefined,
  _config: ServerConfig | undefined,
) {
  // none yet
  return
}

export const secretsCmd = {
  action,
  registerCompletions,
} satisfies Cmd<LoadSecretsCommandOptions>
