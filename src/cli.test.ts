import {describe, expect, it, vi} from "vitest"
import {createProgram, main} from "./cli.ts"
import * as downModule from "./cmd/down.ts"
import * as reconcileModule from "./cmd/reconcile.ts"
import * as reloadHaproxyModule from "./cmd/reload-haproxy.ts"
import * as loadSecretsModule from "./cmd/secrets.ts"
import * as upModule from "./cmd/up.ts"

async function getCompletionOutput(args: string[]): Promise<string> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

  try {
    await createProgram().parseAsync([
      "node",
      "cli.ts",
      "complete",
      "--",
      ...args,
    ])

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
  })

  it("configures global options", () => {
    const program = createProgram()
    const optionNames = program.options.map((opt) => opt.long)
    expect(optionNames).toContain("--data-dir")
    expect(optionNames).toContain("--secrets-file")
  })

  it("registers shell completion commands", () => {
    const program = createProgram()

    expect(program.commands.map((cmd) => cmd.name())).toContain("complete")
  })

  it("completes top-level commands", async () => {
    const output = await getCompletionOutput([])

    expect(output).toContain(
      "up\tProvision networks, start applications, and reload proxies",
    )
    expect(output).toContain(
      "down\tStop applications and prune unused networks (targeted by default)",
    )
    expect(output).toContain("complete\tGenerate shell completion scripts")
    expect(await getCompletionOutput(["up"])).toBe(
      "up\tProvision networks, start applications, and reload proxies\n:4",
    )
  })

  it("completes options for the up command", async () => {
    expect(await getCompletionOutput(["up", "-"])).toBe(
      "-h\tdisplay help for command\n:4",
    )
    expect(await getCompletionOutput(["up", "--"])).toContain(
      "--force-recreate\tForce recreation of containers, even if nothing changed",
    )
    expect(await getCompletionOutput(["up", "--"])).toContain(
      "--build\tBuild images before starting containers.",
    )
  })

  it("does not execute commands while completing", async () => {
    const secretsSpy = vi
      .spyOn(loadSecretsModule, "loadSecretsCommand")
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
    const spy = vi.spyOn(upModule, "upCommand").mockResolvedValue(undefined)
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
    const spy = vi.spyOn(downModule, "downCommand").mockResolvedValue(undefined)
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
    const spy = vi
      .spyOn(loadSecretsModule, "loadSecretsCommand")
      .mockResolvedValue(undefined)
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
    const spy = vi
      .spyOn(reconcileModule, "reconcileCommand")
      .mockResolvedValue(undefined)
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
      .spyOn(reloadHaproxyModule, "reloadHaproxyCommand")
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
})
