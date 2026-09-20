import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {createProgram, createProgramWithCompletions, main} from "./cli.ts"
import {cmds} from "./cmd/index.ts"
import type {ServerConfig} from "./config.ts"
import {getRunningComposeFiles} from "./lib/docker-cli.ts"
import {resetFsAdaptor, setFsAdaptor} from "./lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "./lib/file-system/in-memory.fs-adaptor.ts"

vi.mock("./lib/docker-cli.ts", () => ({
  getRunningComposeFiles: vi.fn(),
}))

const mockConfig: ServerConfig = {
  rootConfDir: "/dummy",
  secretsFile: "/dummy/secrets.yaml",
  appsDir: "/dummy/applications",
  proxies: [],
  environment: {},
}

async function getCompletionOutput(
  args: string[],
  config: ServerConfig | undefined,
): Promise<string> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

  try {
    const program = await createProgramWithCompletions(config)
    await program.parseAsync(["node", "cli.ts", "complete", "--", ...args])

    return logSpy.mock.calls.map((args) => args.join(" ")).join("\n")
  } finally {
    logSpy.mockRestore()
  }
}

describe("CLI Program", () => {
  it("registers all expected cmd and aliases", () => {
    const program = createProgram()
    const commandNames = program.commands.map((cmd) => cmd.name())

    expect(commandNames).toContain("up")
    expect(commandNames).toContain("down")
    expect(commandNames).toContain("reconcile")
    expect(commandNames).toContain("reload-proxy")
    expect(commandNames).toContain("secrets")
    expect(commandNames).toContain("self-update")
  })

  it("configures global options", () => {
    const program = createProgram()
    const optionNames = program.options.map((opt) => opt.long)
    expect(optionNames).toContain("--data-dir")
    expect(optionNames).toContain("--secrets-file")
  })

  it("registers shell completion commands", async () => {
    const program = await createProgramWithCompletions(undefined)

    expect(program.commands.map((cmd) => cmd.name())).toContain("complete")
  })

  it("completes top-level commands", async () => {
    const output = await getCompletionOutput([], undefined)

    expect(output).toContain(
      "up\tProvision networks, start applications, and reload proxies",
    )
    expect(output).toContain(
      "down\tStop applications and prune unused networks (targeted by default)",
    )
    expect(output).toContain("complete\tGenerate shell completion scripts")
    expect(await getCompletionOutput(["up"], mockConfig)).toBe(
      "up\tProvision networks, start applications, and reload proxies\n:4",
    )
  })

  it("completes options for the up command", async () => {
    expect(await getCompletionOutput(["up", "-"], mockConfig)).toBe(
      "-h\tdisplay help for command\n:4",
    )
    expect(await getCompletionOutput(["up", "--"], mockConfig)).toContain(
      "--force-recreate\tForce recreation of containers, even if nothing changed",
    )
    expect(await getCompletionOutput(["up", "--"], mockConfig)).toContain(
      "--build\tBuild images before starting containers.",
    )
    expect(await getCompletionOutput(["up", "--"], mockConfig)).toContain(
      "--debug\tEnable debug logging",
    )
  })

  it("completes options for the down command", async () => {
    expect(await getCompletionOutput(["down", "-"], mockConfig)).toBe(
      "-h\tdisplay help for command\n:4",
    )
    expect(await getCompletionOutput(["down", "--"], mockConfig)).toContain(
      "--help\tdisplay help for command",
    )
  })

  it("completes options for the secrets command", async () => {
    expect(await getCompletionOutput(["secrets", "-"], mockConfig)).toContain(
      "-l\tList secret keys without printing values",
    )
    expect(await getCompletionOutput(["secrets", "-"], mockConfig)).toContain(
      "-f\tFilter secret keys (separated by | or comma)",
    )
    expect(await getCompletionOutput(["secrets", "--"], mockConfig)).toContain(
      "--list\tList secret keys without printing values",
    )
    expect(await getCompletionOutput(["secrets", "--"], mockConfig)).toContain(
      "--filter\tFilter secret keys (separated by | or comma)",
    )
  })

  it("completes options for the reconcile command", async () => {
    expect(await getCompletionOutput(["reconcile", "-"], mockConfig)).toBe(
      "-h\tdisplay help for command\n:4",
    )
    expect(
      await getCompletionOutput(["reconcile", "--"], mockConfig),
    ).toContain("--help\tdisplay help for command")
  })

  it("completes options for the reload-proxy command", async () => {
    expect(await getCompletionOutput(["reload-proxy", "-"], mockConfig)).toBe(
      "-h\tdisplay help for command\n:4",
    )
    expect(
      await getCompletionOutput(["reload-proxy", "--"], mockConfig),
    ).toContain("--help\tdisplay help for command")
  })

  it("completes options for the self-update command", async () => {
    expect(await getCompletionOutput(["self-update", "-"], mockConfig)).toBe(
      "-h\tdisplay help for command\n:4",
    )
    expect(
      await getCompletionOutput(["self-update", "--"], mockConfig),
    ).toContain("--help\tdisplay help for command")
  })

  describe("dynamic completions", () => {
    let fsAdaptor: InMemoryFsAdaptor

    beforeEach(async () => {
      fsAdaptor = new InMemoryFsAdaptor()
      setFsAdaptor(fsAdaptor)

      vi.mocked(getRunningComposeFiles).mockResolvedValue([
        "/dummy/applications/app1.yaml",
        "/dummy/applications/app2.yaml",
        "/dummy/applications/database.yaml",
      ])

      await fsAdaptor.writeFile("/dummy/applications/app1.yaml", "")
      await fsAdaptor.writeFile("/dummy/applications/app2.yaml", "")
      await fsAdaptor.writeFile("/dummy/applications/database.yaml", "")
    })

    afterEach(() => {
      resetFsAdaptor()
    })

    it("completes application targets dynamically for 'up'", async () => {
      const output = await getCompletionOutput(["up", ""], mockConfig)

      expect(output).toContain("app1.yaml")
      expect(output).toContain("app2.yaml")
      expect(output).toContain("database.yaml")
    })

    it("completes only running application targets dynamically for 'down'", async () => {
      vi.mocked(getRunningComposeFiles).mockResolvedValue([
        "/dummy/applications/app1.yaml",
        "/dummy/applications/database.yaml",
      ])

      const output = await getCompletionOutput(["down", ""], mockConfig)

      expect(output).toContain("app1.yaml")
      expect(output).not.toContain("app2.yaml")
      expect(output).toContain("database.yaml")
    })

    it("completes multiple application targets dynamically for 'up' and 'down'", async () => {
      const upOutput = await getCompletionOutput(
        ["up", "app1.yaml", ""],
        mockConfig,
      )
      expect(upOutput).toContain("app1.yaml")
      expect(upOutput).toContain("app2.yaml")
      expect(upOutput).toContain("database.yaml")

      vi.mocked(getRunningComposeFiles).mockResolvedValue([
        "/dummy/applications/app1.yaml",
        "/dummy/applications/app2.yaml",
      ])

      const downOutput = await getCompletionOutput(
        ["down", "app1.yaml", ""],
        mockConfig,
      )
      expect(downOutput).toContain("app1.yaml")
      expect(downOutput).toContain("app2.yaml")
      expect(downOutput).not.toContain("database.yaml")
    })

    it("doesn't crash when config is undefined or applications directory is empty", async () => {
      expect(await getCompletionOutput(["up", ""], undefined)).toBe(":4")
      expect(await getCompletionOutput(["down", ""], undefined)).toBe(":4")

      const emptyConfig: ServerConfig = {
        ...mockConfig,
        appsDir: "/dummy/empty-applications",
      }

      expect(await getCompletionOutput(["up", ""], emptyConfig)).toBe(":4")
      expect(await getCompletionOutput(["down", ""], emptyConfig)).toBe(":4")
    })

    it("returns no completions for 'down' when no containers are running", async () => {
      vi.mocked(getRunningComposeFiles).mockResolvedValue([])

      expect(await getCompletionOutput(["down", ""], mockConfig)).toBe(":4")
    })

    it("throws an error if command is missing when registering completions", async () => {
      await expect(
        cmds.up.registerCompletions?.(undefined, mockConfig),
      ).rejects.toThrow("couldn't find command")
      await expect(
        cmds.down.registerCompletions?.(undefined, mockConfig),
      ).rejects.toThrow("couldn't find command")
    })
  })

  it("does not execute commands while completing", async () => {
    const secretsSpy = vi
      .spyOn(cmds.secrets, "action")
      .mockResolvedValue(undefined)
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    try {
      await main(["node", "cli.ts", "complete", "--", "secrets", "--"])

      expect(secretsSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      secretsSpy.mockRestore()
    }
  })

  it("parses and propagates options for 'up' command", async () => {
    const spy = vi.spyOn(cmds.up, "action").mockResolvedValue(undefined)
    const program = createProgram()

    await program.parseAsync([
      "node",
      "cli.js",
      "--data-dir",
      "/custom/data",
      "--secrets-file",
      "/custom/secrets.yaml",
      "up",
      "app1",
      "app2",
      "--force-recreate",
      "--build",
    ])

    expect(spy).toHaveBeenCalledWith({
      dataDir: "/custom/data",
      secretsFile: "/custom/secrets.yaml",
      targets: ["app1", "app2"],
      forceRecreate: true,
      build: true,
    })
    spy.mockRestore()
  })

  it("parses and propagates options for 'down' command", async () => {
    const spy = vi.spyOn(cmds.down, "action").mockResolvedValue(undefined)
    const program = createProgram()

    await program.parseAsync([
      "node",
      "cli.js",
      "--data-dir",
      "/custom/data",
      "down",
      "app1",
    ])

    expect(spy).toHaveBeenCalledWith({
      dataDir: "/custom/data",
      targets: ["app1"],
    })
    spy.mockRestore()
  })

  it("parses and propagates options for 'secrets'", async () => {
    const spy = vi.spyOn(cmds.secrets, "action").mockResolvedValue(undefined)
    const program = createProgram()

    await program.parseAsync([
      "node",
      "cli.js",
      "--data-dir",
      "/custom/data",
      "--secrets-file",
      "/global/secrets.yaml",
      "secrets",
      "--filter",
      "FOO|BAR",
      "--list",
    ])

    expect(spy).toHaveBeenCalledWith({
      dataDir: "/custom/data",
      secretsFile: "/global/secrets.yaml",
      filter: "FOO|BAR",
      list: true,
    })
    spy.mockRestore()
  })

  it("parses and propagates options for 'reconcile' command", async () => {
    const spy = vi.spyOn(cmds.reconcile, "action").mockResolvedValue(undefined)
    const program = createProgram()

    await program.parseAsync([
      "node",
      "cli.js",
      "--data-dir",
      "/custom/data",
      "reconcile",
    ])

    expect(spy).toHaveBeenCalledWith({
      dataDir: "/custom/data",
    })
    spy.mockRestore()
  })

  it("parses and propagates options for 'reload-proxy' command", async () => {
    const spy = vi
      .spyOn(cmds.reloadProxy, "action")
      .mockResolvedValue(undefined)
    const program = createProgram()

    await program.parseAsync([
      "node",
      "cli.js",
      "--data-dir",
      "/custom/data",
      "reload-proxy",
    ])

    expect(spy).toHaveBeenCalledWith({
      dataDir: "/custom/data",
    })
    spy.mockRestore()
  })

  it("parses and propagates options for 'self-update' command", async () => {
    const spy = vi.spyOn(cmds.selfUpdate, "action").mockResolvedValue(undefined)
    const program = createProgram()

    await program.parseAsync([
      "node",
      "cli.js",
      "--data-dir",
      "/custom/data",
      "self-update",
    ])

    expect(spy).toHaveBeenCalledWith({
      dataDir: "/custom/data",
    })
    spy.mockRestore()
  })
})
