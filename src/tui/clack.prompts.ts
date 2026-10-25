import type {Readable, Writable} from "node:stream"
import type {ConfirmOptions, SelectOptions, TextOptions} from "@clack/prompts"
import * as rawP from "@clack/prompts"

type PromptIo = {
  input?: Readable
  output?: Writable
}

let promptIo: PromptIo = {}

export function setPromptIo(io: PromptIo): void {
  promptIo = io
}

export function resetPromptIo() {
  promptIo = {}
}

/**
 * Exits cleanly when a prompt result is a cancellation (ctrl-c / escape).
 */
export function unwrap<T>(value: T | symbol, opts?: {message?: string}): T {
  if (rawP.isCancel(value)) {
    rawP.cancel(opts?.message ?? "Cancelled", promptIo)
    process.exit(0)
  }
  return value as T
}

/**
 * Wraps the clack prompts interface to automatically inject test io as needed.
 * We should always use this interface rather than calling clacks directly.
 */
export const p = {
  intro: (message: string) => rawP.intro(message, promptIo),
  outro: (message: string) => rawP.outro(message, promptIo),
  note: (message: string, title: string) => rawP.note(message, title, promptIo),
  log: {
    info: (message: string) => rawP.log.info(message, promptIo),
    warn: (message: string) => rawP.log.warn(message, promptIo),
  },
  text: async (
    opts: Omit<TextOptions, "input" | "output">,
    cancelMessage = "Cancelled",
  ): Promise<string> => {
    const value = (
      unwrap(
        await rawP.text({
          ...opts,
          ...promptIo,
        }),
        {message: cancelMessage},
      ) ?? ""
    ).trim()
    // trim-based validation schemas accept whitespace-only input, which clack
    // treats as a real value and skips defaultValue substitution for
    return value === "" ? (opts.defaultValue ?? "") : value
  },
  confirm: async (
    opts: Omit<ConfirmOptions, "input" | "output">,
    cancelMessage = "Cancelled",
  ): Promise<boolean> => {
    return unwrap(
      await rawP.confirm({
        ...opts,
        ...promptIo,
      }),
      {message: cancelMessage},
    )
  },
  select: async <Value>(
    opts: Omit<SelectOptions<Value>, "input" | "output">,
    cancelMessage = "Cancelled",
  ): Promise<Value> => {
    return unwrap(
      await rawP.select({
        ...opts,
        ...promptIo,
      }),
      {message: cancelMessage},
    )
  },
}
