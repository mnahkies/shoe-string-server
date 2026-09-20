import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {
  generateOverlayFileForComposeFile,
  getOverlayFilePathForComposeFile,
} from "../lib/compose-files/generated-overlay.ts"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {createTestComposeFile} from "../testing/compose-fixture.ts"
import {down} from "./down.ts"

interface ExecutedCommand {
  cmd: string
  env?: Record<string, string | undefined> | undefined
}

const executedCommands: ExecutedCommand[] = []

vi.mock("zx", () => {
  const formatArg = (arg: unknown): string =>
    Array.isArray(arg) ? arg.join(" ") : String(arg)

  const custom$ = vi.fn((pieces: TemplateStringsArray, ...args: unknown[]) => {
    let full = ""
    pieces.forEach((piece, i) => {
      full += piece
      if (i < args.length) {
        full += formatArg(args[i])
      }
    })
    executedCommands.push({cmd: full.trim()})
    return Promise.resolve({stdout: "", stderr: "", exitCode: 0})
  })

  const $ = (
    optsOrPieces:
      | TemplateStringsArray
      | {env?: Record<string, string | undefined>},
    ...args: unknown[]
  ) => {
    if (
      optsOrPieces &&
      !Array.isArray(optsOrPieces) &&
      typeof optsOrPieces === "object"
    ) {
      const opts = optsOrPieces as {env?: Record<string, string | undefined>}
      return (pieces: TemplateStringsArray, ...innerArgs: unknown[]) => {
        let full = ""
        pieces.forEach((piece, i) => {
          full += piece
          if (i < innerArgs.length) {
            full += formatArg(innerArgs[i])
          }
        })
        executedCommands.push({cmd: full.trim(), env: opts.env})
        return Promise.resolve({stdout: "", stderr: "", exitCode: 0})
      }
    }
    return custom$(optsOrPieces as TemplateStringsArray, ...args)
  }

  return {$}
})

vi.mock("../lib/secrets.ts", () => ({
  loadSecrets: vi.fn(async () => ({SECRET_FOO: "bar"})),
}))

describe("down command", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const appsDir = "/test/apps"

  beforeEach(() => {
    executedCommands.length = 0
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("stops all applications and prunes networks when no targets are specified", async () => {
    const file1 = await createTestComposeFile(path.join(appsDir, "app1.yaml"))
    const file2 = await createTestComposeFile(path.join(appsDir, "app2.yaml"))

    await down({
      rootConfDir: "/dummy",
      secretsFile: "/dummy/secrets.yaml",
      appsDir,
      proxies: [],
      environment: {CUSTOM_ENV: "hello"},
    })

    expect(executedCommands).toHaveLength(3)

    expect(executedCommands[0]?.cmd).toBe(
      `docker compose --file ${file2} down --remove-orphans`,
    )
    expect(executedCommands[0]?.env?.["SECRET_FOO"]).toBe("bar")
    expect(executedCommands[0]?.env?.["CUSTOM_ENV"]).toBe("hello")

    expect(executedCommands[1]?.cmd).toBe(
      `docker compose --file ${file1} down --remove-orphans`,
    )
    expect(executedCommands[1]?.env?.["SECRET_FOO"]).toBe("bar")
    expect(executedCommands[1]?.env?.["CUSTOM_ENV"]).toBe("hello")

    expect(executedCommands[2]?.cmd).toBe("docker network prune -f")
  })

  it("stops only specified target applications and does not prune networks", async () => {
    const file1 = await createTestComposeFile(path.join(appsDir, "app1.yaml"))
    await createTestComposeFile(path.join(appsDir, "app2.yaml"))
    const file3 = await createTestComposeFile(path.join(appsDir, "app3.yaml"))

    await down(
      {
        rootConfDir: "/dummy",
        secretsFile: "/dummy/secrets.yaml",
        appsDir,
        proxies: [],
        environment: {},
      },
      {
        targets: ["app1", "app3.yaml"],
      },
    )

    expect(executedCommands).toHaveLength(2)

    expect(executedCommands[0]?.cmd).toBe(
      `docker compose --file ${file3} down --remove-orphans`,
    )
    expect(executedCommands[1]?.cmd).toBe(
      `docker compose --file ${file1} down --remove-orphans`,
    )
    expect(executedCommands.some((c) => c.cmd.includes("network prune"))).toBe(
      false,
    )
  })

  it("throws when targeting non-existent application", async () => {
    await createTestComposeFile(path.join(appsDir, "app1.yaml"))

    await expect(
      down(
        {
          rootConfDir: "/dummy",
          secretsFile: "/dummy/secrets.yaml",
          appsDir,
          proxies: [],
          environment: {},
        },
        {targets: ["nonexistent"]},
      ),
    ).rejects.toThrow(/No application matches target 'nonexistent'/)
  })

  it("stops dependents before their dependencies", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })

    await down({
      rootConfDir: "/dummy",
      secretsFile: "/dummy/secrets.yaml",
      appsDir,
      proxies: [],
      environment: {},
    })

    const downCommands = executedCommands.filter((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(downCommands.map((c) => c.cmd)).toEqual([
      `docker compose --file ${api} down --remove-orphans`,
      `docker compose --file ${database} down --remove-orphans`,
    ])
  })

  it("doesn't stop dependencies outside the targeted selection", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })

    await down(
      {
        rootConfDir: "/dummy",
        secretsFile: "/dummy/secrets.yaml",
        appsDir,
        proxies: [],
        environment: {},
      },
      {targets: ["api"]},
    )

    const downCommands = executedCommands.filter((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(downCommands.map((c) => c.cmd)).toEqual([
      `docker compose --file ${api} down --remove-orphans`,
    ])
  })

  it("passes generated overlay files to down commands", async () => {
    const rootConfDir = "/test/cluster"
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })
    await generateOverlayFileForComposeFile(rootConfDir, api)

    await down({
      rootConfDir,
      secretsFile: path.join(rootConfDir, "secrets.yaml"),
      appsDir,
      proxies: [],
      environment: {},
    })

    const downCommands = executedCommands.filter((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(downCommands.map((c) => c.cmd)).toEqual([
      `docker compose --file ${api} --file ${getOverlayFilePathForComposeFile(api)} down --remove-orphans`,
      `docker compose --file ${database} down --remove-orphans`,
    ])
  })
})
