import {cd} from "zx"

export interface CwdDisposable extends Disposable {
  [Symbol.dispose](): void
}

/**
 * Change the working directory and return a Disposable that restores the previous cwd on disposal.
 *
 * Usage with `using`:
 * ```ts
 * {
 *   using _ = useCwd(targetDir)
 *   // do work in targetDir
 * } // restores previous cwd automatically on scope exit
 * ```
 */
export function useCwd(dir: string): CwdDisposable {
  const prevCwd = process.cwd()
  cd(dir)

  let disposed = false
  return {
    [Symbol.dispose]() {
      if (!disposed) {
        disposed = true
        cd(prevCwd)
      }
    },
  }
}

/**
 * Execute a function within a temporary working directory and restore the previous cwd when completed.
 * Can also be used directly as a resource declaration with `using`.
 *
 * Usage:
 * ```ts
 * await withCwd(targetDir, async () => {
 *   // do work in targetDir
 * })
 * ```
 * Or:
 * ```ts
 * using _ = withCwd(targetDir)
 * ```
 */
export function withCwd(dir: string): CwdDisposable
export function withCwd<T>(dir: string, fn: () => Promise<T> | T): Promise<T>
export function withCwd<T>(
  dir: string,
  fn?: () => Promise<T> | T,
): CwdDisposable | Promise<T> {
  const scope = useCwd(dir)
  if (!fn) {
    return scope
  }

  return (async () => {
    try {
      return await fn()
    } finally {
      scope[Symbol.dispose]()
    }
  })()
}
