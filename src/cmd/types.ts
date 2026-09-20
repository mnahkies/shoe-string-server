import type {Command} from "@bomb.sh/tab"
import type {GlobalOptions, ServerConfig} from "../config.ts"

export type Cmd<T extends object = Record<string, unknown>> = {
  action: (
    config: ServerConfig,
    opts: T,
    globalOpts: GlobalOptions,
  ) => Promise<void>
  registerCompletions?: (
    cmd: Command | undefined,
    config: ServerConfig | undefined,
  ) => void | Promise<void>
}
