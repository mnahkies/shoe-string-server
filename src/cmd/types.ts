import type {Command} from "@bomb.sh/tab"
import type {ServerConfig} from "../config.ts"

export type Cmd<T extends Record<string, unknown> = Record<string, unknown>> = {
  action: (opts: T) => Promise<void>
  registerCompletions?: (cmd: Command, config: ServerConfig | undefined) => void
}
