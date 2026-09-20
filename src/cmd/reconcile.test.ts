import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {GlobalOptions, ServerConfig} from "../config.ts"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {reconcile} from "./reconcile.ts"

const mockUp = vi.fn(async (_config?: unknown) => {})
vi.mock("./up.ts", () => ({
  up: (config: unknown) => mockUp(config),
}))

let fetchExitCode = 0
let headRev = "commit1"
let upstreamRev = "commit1"
let pullExitCode = 0
let revParseExitCode = 0

vi.mock("zx", () => {
  const $ = (pieces: TemplateStringsArray, ...args: unknown[]) => {
    let full = ""
    pieces.forEach((piece, i) => {
      full += piece
      if (i < args.length) {
        full += String(args[i])
      }
    })
    const cmd = full.trim()

    if (cmd.startsWith("git fetch")) {
      return {
        nothrow: () =>
          Promise.resolve({
            stdout: "",
            stderr: fetchExitCode !== 0 ? "fetch network error" : "",
            exitCode: fetchExitCode,
          }),
      }
    }

    if (cmd.startsWith("git rev-parse HEAD")) {
      return {
        quiet: () => ({
          nothrow: () =>
            Promise.resolve({
              stdout: headRev,
              stderr: revParseExitCode !== 0 ? "error" : "",
              exitCode: revParseExitCode,
            }),
        }),
      }
    }

    if (cmd.startsWith("git rev-parse @{u}")) {
      return {
        quiet: () => ({
          nothrow: () =>
            Promise.resolve({
              stdout: upstreamRev,
              stderr: revParseExitCode !== 0 ? "no upstream" : "",
              exitCode: revParseExitCode,
            }),
        }),
      }
    }

    if (cmd.startsWith("git pull")) {
      return {
        nothrow: () =>
          Promise.resolve({
            stdout: "",
            stderr: pullExitCode !== 0 ? "merge conflict" : "",
            exitCode: pullExitCode,
          }),
      }
    }

    return Promise.resolve({stdout: "", stderr: "", exitCode: 0})
  }

  return {$, cd: vi.fn()}
})

describe("reconcile command", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const rootConfDir = "/test/cluster"

  const globalOpts: GlobalOptions = {dataDir: rootConfDir}

  const baseConfig: ServerConfig = {
    rootConfDir,
    secretsFile: path.join(rootConfDir, "secrets.encrypted.yaml"),
    appsDir: path.join(rootConfDir, "applications"),
    proxies: [],
    environment: {},
  }

  beforeEach(async () => {
    mockUp.mockClear()
    fetchExitCode = 0
    headRev = "commit1"
    upstreamRev = "commit1"
    pullExitCode = 0
    revParseExitCode = 0

    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)

    await fsAdaptor.mkdir(rootConfDir, {recursive: true})
    await fsAdaptor.writeFile(path.join(rootConfDir, "cluster.yaml"), "{}\n")
    await fsAdaptor.writeFile(
      path.join(rootConfDir, "secrets.encrypted.yaml"),
      "dummy",
    )
    await fsAdaptor.mkdir(path.join(rootConfDir, "applications"), {
      recursive: true,
    })
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("does nothing when local branch is up to date with upstream", async () => {
    headRev = "abc"
    upstreamRev = "abc"

    const changed = await reconcile(baseConfig, globalOpts)

    expect(changed).toBe(false)
    expect(mockUp).not.toHaveBeenCalled()
  })

  it("pulls changes and resolves config fresh when behind upstream", async () => {
    headRev = "abc"
    upstreamRev = "def"

    const changed = await reconcile(baseConfig, globalOpts)

    expect(changed).toBe(true)
    expect(mockUp).toHaveBeenCalledTimes(1)
    expect(mockUp).toHaveBeenCalledWith(
      expect.objectContaining({
        rootConfDir,
      }),
    )
  })

  it("preserves explicit secrets-file override when resolving config fresh after pull", async () => {
    headRev = "abc"
    upstreamRev = "def"
    const overrideSecretsFile = "/test/cluster/custom-secrets.yaml"
    await fsAdaptor.writeFile(overrideSecretsFile, "dummy")

    await reconcile(baseConfig, {
      dataDir: rootConfDir,
      secretsFile: overrideSecretsFile,
    })

    expect(mockUp).toHaveBeenCalledTimes(1)
    expect(mockUp).toHaveBeenCalledWith(
      expect.objectContaining({
        secretsFile: overrideSecretsFile,
      }),
    )
  })

  it("throws error when git fetch fails", async () => {
    fetchExitCode = 1

    await expect(reconcile(baseConfig, globalOpts)).rejects.toThrow(
      /Git fetch failed in \/test\/cluster/,
    )
    expect(mockUp).not.toHaveBeenCalled()
  })

  it("throws error when upstream branch is missing", async () => {
    revParseExitCode = 1

    await expect(reconcile(baseConfig, globalOpts)).rejects.toThrow(
      /Unable to determine git HEAD or upstream tracking branch/,
    )
    expect(mockUp).not.toHaveBeenCalled()
  })

  it("throws error when git pull fails", async () => {
    headRev = "abc"
    upstreamRev = "def"
    pullExitCode = 1

    await expect(reconcile(baseConfig, globalOpts)).rejects.toThrow(
      /Git pull failed/,
    )
    expect(mockUp).not.toHaveBeenCalled()
  })
})
