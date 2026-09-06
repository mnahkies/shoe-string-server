import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {createTestComposeFile} from "../testing/compose-fixture.ts"
import {reloadHaproxy, reloadHaproxyCommand} from "./reload-haproxy.ts"

interface ExecutedCommand {
  cmd: string
}

const executedCommands: ExecutedCommand[] = []
let dockerPsOutput = ""

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
    executedCommands.push({cmd})

    if (cmd.startsWith("docker ps")) {
      return {
        quiet: () => ({
          nothrow: () =>
            Promise.resolve({
              stdout: dockerPsOutput,
              stderr: "",
              exitCode: 0,
            }),
        }),
      }
    }

    return Promise.resolve({stdout: "", stderr: "", exitCode: 0})
  }

  return {$}
})

describe("reload-haproxy command", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const appsDir = "/test/cluster/apps"
  const proxyConfDir = "/test/cluster/conf/haproxy"

  const templateContent = [
    "global",
    "{{TCP_LISTEN}}",
    "{{USE_BACKENDS}}",
    "{{AUTH_FRONTENDS}}",
    "{{BACKENDS}}",
  ].join("\n")

  beforeEach(async () => {
    executedCommands.length = 0
    dockerPsOutput = ""
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

  it("generates config and sends HUP when proxy container is running", async () => {
    dockerPsOutput = "container_123"

    await createTestComposeFile(path.join(appsDir, "haproxy.yaml"), {
      services: {
        haproxy: {
          container_name: "haproxy",
          "x-ext-proxy": {name: "public"},
        },
      },
    })

    await reloadHaproxy(appsDir, {
      name: "public",
      containerName: "haproxy",
      conf: proxyConfDir,
    })

    expect(await fsAdaptor.exists(path.join(proxyConfDir, "haproxy.cfg"))).toBe(
      true,
    )

    const killCommand = executedCommands.find((c) =>
      c.cmd.startsWith("docker kill -s HUP haproxy"),
    )
    expect(killCommand).toBeDefined()
  })

  it("generates config and does not send HUP when proxy container is stopped", async () => {
    dockerPsOutput = ""

    await createTestComposeFile(path.join(appsDir, "haproxy.yaml"), {
      services: {
        haproxy: {
          container_name: "haproxy",
          "x-ext-proxy": {name: "public"},
        },
      },
    })

    await reloadHaproxy(appsDir, {
      name: "public",
      containerName: "haproxy",
      conf: proxyConfDir,
    })

    expect(await fsAdaptor.exists(path.join(proxyConfDir, "haproxy.cfg"))).toBe(
      true,
    )

    const killCommand = executedCommands.find((c) =>
      c.cmd.startsWith("docker kill -s HUP"),
    )
    expect(killCommand).toBeUndefined()
  })

  it("throws error when proxy discovered in apps is missing in cluster.yaml", async () => {
    await fsAdaptor.writeFile(
      "/test/cluster/cluster.yaml",
      "appsDir: ./apps\nproxies: []\n",
    )
    await fsAdaptor.writeFile("/test/cluster/secrets.encrypted.yaml", "dummy")

    await createTestComposeFile(path.join(appsDir, "haproxy.yaml"), {
      services: {
        haproxy: {
          container_name: "haproxy",
          "x-ext-proxy": {name: "unknown_proxy"},
        },
      },
    })

    await expect(
      reloadHaproxyCommand({dataDir: "/test/cluster"}),
    ).rejects.toThrow(
      /Proxy unknown_proxy missing configuration in cluster.yaml/,
    )
  })
})
