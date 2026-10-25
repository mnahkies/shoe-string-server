import {Readable, Writable} from "node:stream"

/**
 * Writable collecting everything written as frames, for asserting on prompt
 * output. Adapted from clack's own test utilities.
 */
export class MockWritable extends Writable {
  readonly buffer: string[] = []
  isTTY = false
  columns = 80
  rows = 20

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.buffer.push(chunk.toString())
    callback()
  }
}

/**
 * Readable that never ends; keystrokes are delivered via emit("keypress", ...)
 * like clack's own tests do (readline runs with terminal: true).
 */
export class MockReadable extends Readable {
  override _read(): void {
    // stay open for the whole wizard; prompts observe EOF otherwise
  }
}

export interface PromptTestIo {
  input: MockReadable
  output: MockWritable
  pressEnter(): void
  pressEscape(): void
  pressDown(): void
  type(value: string): void
  /** All written frames, joined. */
  frames(): string
  /** Resolves once a prompt rendering the given message has appeared. */
  waitForPrompt(message: string): Promise<void>
}

const POLL_INTERVAL_MS = 20
const PROMPT_TIMEOUT_MS = 1000

function sleep(ms: number): Promise<void> {
  const {promise, resolve} = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

export function createPromptIo(): PromptTestIo {
  const input = new MockReadable()
  const output = new MockWritable()
  let cursor = 0

  return {
    input,
    output,
    pressEnter: () => input.emit("keypress", "", {name: "return"}),
    pressEscape: () => input.emit("keypress", "", {name: "escape"}),
    pressDown: () => input.emit("keypress", "", {name: "down"}),
    type: (value) => {
      for (const char of value) {
        input.emit("keypress", char, {name: char})
      }
    },
    frames: () => output.buffer.join(""),
    waitForPrompt: async (message) => {
      const deadline = Date.now() + PROMPT_TIMEOUT_MS
      while (true) {
        const full = output.buffer.join("")
        const unread = full.slice(cursor)
        const matchIdx = unread.indexOf(message)
        if (matchIdx !== -1) {
          cursor += matchIdx + message.length
          return
        }
        if (Date.now() > deadline) {
          throw new Error(
            `timed out waiting for prompt: ${message}. Output: ${full}`,
          )
        }
        await sleep(POLL_INTERVAL_MS)
      }
    },
  }
}
