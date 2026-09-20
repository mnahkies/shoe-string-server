import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {ServerConfig} from "../config.ts"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {createTestComposeFile} from "../testing/compose-fixture.ts"
import {up} from "./up.ts"

interface ExecutedCommand {
  cmd: string
  env: Record<string, string | undefined> | undefined
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
    executedCommands.push({cmd: full.trim(), env: undefined})
    return {
      verbose: () => Promise.resolve({stdout: "", stderr: "", exitCode: 0}),
      quiet: () => ({
        nothrow: () =>
          Promise.resolve({
            stdout: "proxy_container_id\n",
            stderr: "",
            exitCode: 0,
          }),
      }),
      nothrow: () => Promise.resolve({stdout: "", stderr: "", exitCode: 0}),
    }
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
        return {
          verbose: () => Promise.resolve({stdout: "", stderr: "", exitCode: 0}),
          quiet: () => ({
            nothrow: () =>
              Promise.resolve({
                stdout: "proxy_container_id\n",
                stderr: "",
                exitCode: 0,
              }),
          }),
          nothrow: () => Promise.resolve({stdout: "", stderr: "", exitCode: 0}),
        }
      }
    }
    return custom$(optsOrPieces as TemplateStringsArray, ...args)
  }

  return {$, cd: vi.fn()}
})

vi.mock("../lib/secrets.ts", () => ({
  loadSecrets: vi.fn(async () => ({SECRET_FOO: "bar"})),
}))

vi.mock("../lib/networks/create-networks.ts", () => ({
  createNetworks: vi.fn(async () => {}),
}))

describe("up command", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const rootConfDir = "/test/cluster"
  const appsDir = "/test/cluster/apps"
  const proxyConfDir = "/test/cluster/conf/haproxy"

  const templateContent = [
    "global",
    "{{TCP_LISTEN}}",
    "{{USE_BACKENDS}}",
    "{{FORWARD_AUTH_ACL}}",
    "{{BACKENDS}}",
  ].join("\n")

  const baseConfig: ServerConfig = {
    rootConfDir,
    secretsFile: path.join(rootConfDir, "secrets.yaml"),
    appsDir,
    proxies: [
      {
        name: "public",
        containerName: "haproxy",
        conf: proxyConfDir,
      },
    ],
    environment: {CUSTOM_VAR: "cluster_val"},
  }

  beforeEach(async () => {
    executedCommands.length = 0
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)

    await fsAdaptor.mkdir(appsDir, {recursive: true})
    await fsAdaptor.mkdir(proxyConfDir, {recursive: true})
    await fsAdaptor.writeFile(
      path.join(proxyConfDir, "haproxy.cfg.template"),
      templateContent,
    )
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("pre-generates proxy configs before compose calls and starts all applications", async () => {
    const proxyFile = await createTestComposeFile(
      path.join(appsDir, "haproxy.yaml"),
      {
        services: {
          haproxy: {
            container_name: "haproxy",
            "x-ext-proxy": {name: "public"},
          },
        },
      },
    )

    const appFile = await createTestComposeFile(
      path.join(appsDir, "app.yaml"),
      {
        services: {
          web: {
            hostname: "web",
            "x-ext-hostnames": [
              {
                name: "app.example.com",
                "container-port": 80,
                "proxy-name": "public",
              },
            ],
          },
        },
      },
    )

    await up(baseConfig)

    // Config must exist before containers start
    expect(await fsAdaptor.exists(path.join(proxyConfDir, "haproxy.cfg"))).toBe(
      true,
    )

    // Two compose calls (one for each file)
    const composeCommands = executedCommands.filter((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(composeCommands).toHaveLength(2)

    expect(composeCommands[0]?.cmd).toContain(`-f ${appFile}`)
    expect(composeCommands[0]?.cmd).toContain("up -d --remove-orphans")
    expect(composeCommands[1]?.cmd).toContain(`-f ${proxyFile}`)

    // Verify proxy was reloaded with HUP because proxy stack was started
    const hupCommands = executedCommands.filter((c) =>
      c.cmd.includes("kill -s HUP haproxy"),
    )
    expect(hupCommands).toHaveLength(1)
  })

  it("does not send HUP to proxies when only an application stack is targeted", async () => {
    await createTestComposeFile(path.join(appsDir, "haproxy.yaml"), {
      services: {
        haproxy: {
          container_name: "haproxy",
          "x-ext-proxy": {name: "public"},
        },
      },
    })

    const appFile = await createTestComposeFile(
      path.join(appsDir, "app.yaml"),
      {
        services: {
          web: {
            hostname: "web",
            "x-ext-hostnames": [
              {
                name: "app.example.com",
                "container-port": 80,
                "proxy-name": "public",
              },
            ],
          },
        },
      },
    )

    await up(baseConfig, {targets: ["app"]})

    const composeCommands = executedCommands.filter((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(composeCommands).toHaveLength(1)
    expect(composeCommands[0]?.cmd).toContain(`-f ${appFile}`)

    // No HUP command should be sent because haproxy.yaml was not started
    const hupCommands = executedCommands.filter((c) =>
      c.cmd.includes("kill -s HUP"),
    )
    expect(hupCommands).toHaveLength(0)
  })

  it("passes --force-recreate and --build flags to docker compose", async () => {
    await createTestComposeFile(path.join(appsDir, "app.yaml"), {
      services: {
        web: {
          hostname: "web",
        },
      },
    })

    await up(baseConfig, {forceRecreate: true, build: true})

    const composeCommand = executedCommands.find((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(composeCommand?.cmd).toContain("--force-recreate")
    expect(composeCommand?.cmd).toContain("--build")
  })

  it("respects environment precedence in up command", async () => {
    vi.stubEnv("AMBIENT_VAR", "ambient_val")
    vi.stubEnv("CUSTOM_VAR", "ambient_custom")
    vi.stubEnv("SECRET_FOO", "ambient_secret")

    await createTestComposeFile(path.join(appsDir, "app.yaml"), {
      services: {
        web: {
          hostname: "web",
        },
      },
    })

    await up(baseConfig)

    const composeCommand = executedCommands.find((c) =>
      c.cmd.startsWith("docker compose"),
    )
    expect(composeCommand?.env?.["AMBIENT_VAR"]).toBe("ambient_val")
    expect(composeCommand?.env?.["CUSTOM_VAR"]).toBe("ambient_custom")
    expect(composeCommand?.env?.["SECRET_FOO"]).toBe("ambient_secret")
  })
})
