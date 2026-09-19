import path from "node:path"
import {load} from "js-yaml"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {
  getComposeFiles,
  loadComposeFile,
  resolveAppTargets,
} from "./compose-files.ts"
import {
  generateOverlayFileForComposeFile,
  getOverlayFilePathForComposeFile,
} from "./generated-overlay.ts"

describe("getComposeApps", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("returns empty list for non-existent directory", async () => {
    expect(await getComposeFiles("/non/existent/path")).toEqual([])
  })

  it("finds and sorts compose files alphabetically", async () => {
    const dir = "/test/apps"
    await fsAdaptor.writeFile(path.join(dir, "b-test-app.yaml"), "")
    await fsAdaptor.writeFile(path.join(dir, "a-test-app.yml"), "")
    await fsAdaptor.writeFile(path.join(dir, "haproxy.yaml"), "")
    await fsAdaptor.writeFile(path.join(dir, "ignored.txt"), "")

    const apps = await getComposeFiles(dir)
    expect(apps).toEqual([
      path.join(dir, "a-test-app.yml"),
      path.join(dir, "b-test-app.yaml"),
      path.join(dir, "haproxy.yaml"),
    ])
  })

  it("handles single file paths and arrays of files", async () => {
    const dir = "/test/apps"
    const file1 = path.join(dir, "app1.yaml")
    const file2 = path.join(dir, "app2.yml")
    const nonYaml = path.join(dir, "app3.txt")
    await fsAdaptor.writeFile(file1, "")
    await fsAdaptor.writeFile(file2, "")
    await fsAdaptor.writeFile(nonYaml, "")

    expect(await getComposeFiles(file1)).toEqual([file1])
    expect(await getComposeFiles(nonYaml)).toEqual([])
    expect(await getComposeFiles([file1, file2])).toEqual([file1, file2])
  })
})

describe("resolveAppTargets", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const appsDir = "/test/apps"

  beforeEach(async () => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)

    await fsAdaptor.mkdir(path.join(appsDir, "subdir"), {recursive: true})
    await fsAdaptor.writeFile(path.join(appsDir, "app1.yaml"), "")
    await fsAdaptor.writeFile(path.join(appsDir, "app2.yml"), "")
    await fsAdaptor.writeFile(path.join(appsDir, "subdir", "app3.yaml"), "")
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("returns all compose files when no targets are provided", async () => {
    const targets = await resolveAppTargets(appsDir, [])
    expect(targets).toEqual([
      path.join(appsDir, "app1.yaml"),
      path.join(appsDir, "app2.yml"),
      path.join(appsDir, "subdir", "app3.yaml"),
    ])
  })

  it("resolves targets by basename with or without extension", async () => {
    expect(await resolveAppTargets(appsDir, ["app1"])).toEqual([
      path.join(appsDir, "app1.yaml"),
    ])
    expect(await resolveAppTargets(appsDir, ["app2"])).toEqual([
      path.join(appsDir, "app2.yml"),
    ])
    expect(await resolveAppTargets(appsDir, ["app1.yaml"])).toEqual([
      path.join(appsDir, "app1.yaml"),
    ])
  })

  it("resolves targets by relative path and absolute path", async () => {
    expect(await resolveAppTargets(appsDir, ["subdir/app3.yaml"])).toEqual([
      path.join(appsDir, "subdir", "app3.yaml"),
    ])
    expect(
      await resolveAppTargets(appsDir, [path.join(appsDir, "app1.yaml")]),
    ).toEqual([path.join(appsDir, "app1.yaml")])
  })

  it("resolves glob targets and deduplicates", async () => {
    const results = await resolveAppTargets(appsDir, ["app1*", "app1"])
    expect(results).toEqual([path.join(appsDir, "app1.yaml")])

    const allYaml = await resolveAppTargets(appsDir, ["*.yaml"])
    expect(allYaml).toEqual([
      path.join(appsDir, "app1.yaml"),
      path.join(appsDir, "subdir", "app3.yaml"),
    ])
  })

  it("throws error for non-matching target", async () => {
    await expect(resolveAppTargets(appsDir, ["nonexistent"])).rejects.toThrow(
      /No application matches target 'nonexistent' in \/test\/apps/,
    )
  })
})

describe("loadComposeFile validation", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("throws validation error for malformed compose structure", async () => {
    await fsAdaptor.writeFile(
      "/test/invalid.yaml",
      "services:\n  web:\n    security_opt: 'invalid-should-be-array'\n",
    )

    await expect(loadComposeFile("/test/invalid.yaml")).rejects.toThrow(
      /Invalid compose file structure at \/test\/invalid.yaml/,
    )
  })
})

describe("getOverlayFilePath", () => {
  it("returns overlay path inside overlays directory", () => {
    const filePath = "/path/to/apps/service.yaml"
    expect(getOverlayFilePathForComposeFile(filePath)).toBe(
      "/path/to/apps/overlays/service.yaml.overlay.yaml",
    )
  })
})

describe("updateComposeAppLabels", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("adds sha256 labels for conf volumes to services in overlay file", async () => {
    const rootDir = "/test/cluster"
    const confDir = path.join(rootDir, "conf", "my-service", "bla")
    await fsAdaptor.mkdir(confDir, {recursive: true})
    await fsAdaptor.writeFile(
      path.join(confDir, "config.json"),
      '{"key":"value"}',
    )

    const composeFile = await createTestComposeFile(
      path.join(rootDir, "service.yaml"),
      {
        services: {
          "my-service": {
            image: "my-image:latest",
            volumes: [
              {
                type: "bind",
                source: "${" + "DATA_BASE_PATH}/conf/my-service",
                target: "/etc/config",
              },
            ],
          },
        },
      },
    )

    await generateOverlayFileForComposeFile(rootDir, composeFile)

    const overlayFile = getOverlayFilePathForComposeFile(composeFile)
    expect(await fsAdaptor.exists(overlayFile)).toBe(true)

    // biome-ignore lint/suspicious/noExplicitAny: tests
    const overlay = load(await fsAdaptor.readFile(overlayFile)) as any
    expect(overlay.services["my-service"].labels).toBeDefined()
    expect(
      overlay.services["my-service"].labels["hash.my-service"],
    ).toBeDefined()
    expect(overlay.services["my-service"].labels["hash.my-service"]).toMatch(
      /^[a-f0-9]{64}$/,
    )
  })
})
