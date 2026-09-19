import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {loadNetworks} from "./load-networks.ts"

describe("loadNetworks", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("extracts top-level external networks", async () => {
    const dir = "/test/apps"
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      networks: {
        internal: {external: true},
        postgres: {external: true},
      },
    })
    const networks = await loadNetworks(dir)
    expect(networks).toEqual(["internal", "postgres"])
  })

  it("resolves custom network name when specified with name property", async () => {
    const dir = "/test/apps"
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      networks: {
        custom_key: {
          name: "real_custom_network",
          external: true,
        },
      },
    })
    const networks = await loadNetworks(dir)
    expect(networks).toEqual(["real_custom_network"])
  })

  it("resolves custom network name when specified in external object", async () => {
    const dir = "/test/apps"
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      networks: {
        custom_key: {
          external: {
            name: "object_custom_network",
          },
        },
      },
    })
    const networks = await loadNetworks(dir)
    expect(networks).toEqual(["object_custom_network"])
  })

  it("ignores non-external networks", async () => {
    const dir = "/test/apps"
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      networks: {
        internal: {external: true},
        local_net: {driver: "bridge"},
      },
    })
    const networks = await loadNetworks(dir)
    expect(networks).toEqual(["internal"])
  })

  it("loads and deduplicates networks across multiple files and directories", async () => {
    const dir1 = "/test/apps1"
    const dir2 = "/test/apps2"
    await createTestComposeFile(path.join(dir1, "internal-app1.yaml"), {
      networks: {
        internal: {external: true},
        postgres: {external: true},
      },
    })
    await createTestComposeFile(path.join(dir1, "internal-app2.yaml"), {
      networks: {
        internal: {external: true},
      },
    })
    await createTestComposeFile(path.join(dir2, "public-test-app.yaml"), {
      networks: {
        main: {external: true},
        postgres: {external: true},
      },
    })
    const networks = await loadNetworks([dir1, dir2])
    expect(networks).toEqual(["internal", "main", "postgres"])
  })

  it("handles non-existent or empty directories and non-yaml files gracefully", async () => {
    const dir = "/test/apps"
    await fsAdaptor.writeFile(path.join(dir, "README.md"), "not yaml")
    await fsAdaptor.writeFile(path.join(dir, "empty.txt"), "")
    const networks = await loadNetworks([dir, "/path/does/not/exist"])
    expect(networks).toEqual([])
  })
})
