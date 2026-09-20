import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {resolveConfig} from "./config.ts"
import {resetFsAdaptor, setFsAdaptor} from "./lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "./lib/file-system/in-memory.fs-adaptor.ts"

describe("resolveConfig", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("resolves config with default secretsFile location in dataDir", async () => {
    const dataDir = "/test/cluster"
    const secretsFile = "/test/cluster/secrets.encrypted.yaml"
    await fsAdaptor.writeFile(
      "/test/cluster/cluster.yaml",
      `
proxies:
  - name: internal
    containerName: haproxy-internal
    conf: conf/haproxy/internal
  - name: public
    containerName: haproxy-public
    conf: conf/haproxy/public
`,
    )
    await fsAdaptor.writeFile(secretsFile, "dummy")
    await fsAdaptor.mkdir("/test/cluster/applications", {recursive: true})
    await fsAdaptor.mkdir("/test/cluster/conf/haproxy/internal", {
      recursive: true,
    })
    await fsAdaptor.mkdir("/test/cluster/conf/haproxy/public", {
      recursive: true,
    })

    const config = await resolveConfig({dataDir, secretsFile: undefined})

    expect(config.rootConfDir).toBe(dataDir)
    expect(config.secretsFile).toBe(secretsFile)
    expect(config.appsDir).toBe("/test/cluster/applications")
    expect(config.proxies.map((it) => it.name)).toEqual(["internal", "public"])
    const [internal] = config.proxies
    expect(internal?.containerName).toBe("haproxy-internal")
    expect(internal?.conf).toBe("/test/cluster/conf/haproxy/internal")
    expect(config.proxies[1]?.conf).toBe("/test/cluster/conf/haproxy/public")
  })

  it("resolves custom secretsFile location", async () => {
    const dataDir = "/test/cluster"
    const customSecrets = "/test/custom/my-secrets.enc.yaml"
    await fsAdaptor.writeFile("/test/cluster/cluster.yaml", "{}\n")
    await fsAdaptor.mkdir("/test/cluster/applications")
    await fsAdaptor.writeFile(customSecrets, "dummy")

    const config = await resolveConfig({
      dataDir,
      secretsFile: customSecrets,
    })

    expect(config.rootConfDir).toBe(dataDir)
    expect(config.secretsFile).toBe(customSecrets)
  })

  it("throws error when cluster.yaml does not exist", async () => {
    const dataDir = "/test/nonexistent"

    await expect(
      resolveConfig({dataDir, secretsFile: undefined}),
    ).rejects.toThrow(
      `cluster.yaml not found in ${path.resolve(dataDir, "cluster.yaml")}`,
    )
  })

  it("throws error when secretsFile does not exist", async () => {
    const dataDir = "/test/cluster"
    await fsAdaptor.writeFile("/test/cluster/cluster.yaml", "{}\n")
    await fsAdaptor.mkdir("/test/cluster/applications")

    await expect(
      resolveConfig({dataDir, secretsFile: undefined}),
    ).rejects.toThrow(
      `secretsFile must exist, got: ${path.resolve(dataDir, "secrets.encrypted.yaml")}`,
    )
  })

  it("throws error when explicit secretsFile does not exist", async () => {
    const customSecrets = "/nonexistent/secrets.enc.yaml"
    await fsAdaptor.writeFile("/test/cluster/cluster.yaml", "{}\n")
    await fsAdaptor.mkdir("/test/cluster/applications")

    await expect(
      resolveConfig({
        dataDir: "/test/cluster",
        secretsFile: customSecrets,
      }),
    ).rejects.toThrow(
      `secretsFile must exist, got: ${path.resolve(customSecrets)}`,
    )
  })

  it("throws error when appsDir does not exist", async () => {
    const dataDir = "/test/cluster"
    await fsAdaptor.writeFile("/test/cluster/cluster.yaml", "{}\n")
    await fsAdaptor.writeFile(
      path.join(dataDir, "secrets.encrypted.yaml"),
      "dummy",
    )

    await expect(
      resolveConfig({dataDir, secretsFile: undefined}),
    ).rejects.toThrow(
      `appsDir must exist, got: ${path.resolve(dataDir, "applications")}`,
    )
  })

  it("throws error when proxy.conf does not exist", async () => {
    const dataDir = "/test/cluster"
    await fsAdaptor.writeFile(
      "/test/cluster/cluster.yaml",
      `
proxies:
  - name: public
    containerName: haproxy
    conf: conf/haproxy
`,
    )
    await fsAdaptor.writeFile(
      path.join(dataDir, "secrets.encrypted.yaml"),
      "dummy",
    )
    await fsAdaptor.mkdir("/test/cluster/applications")

    await expect(
      resolveConfig({dataDir, secretsFile: undefined}),
    ).rejects.toThrow(
      `proxy.conf must exist, got: ${path.resolve(dataDir, "conf/haproxy")}`,
    )
  })

  it("rejects unknown cluster.yaml keys instead of silently defaulting", async () => {
    const dataDir = "/test/cluster"
    await fsAdaptor.writeFile(
      path.join(dataDir, "secrets.encrypted.yaml"),
      "dummy",
    )
    await fsAdaptor.writeFile(
      path.join(dataDir, "cluster.yaml"),
      "appDir: applications\n",
    )

    await expect(
      resolveConfig({dataDir, secretsFile: undefined}),
    ).rejects.toThrow(/Unrecognized key/)
  })
})
