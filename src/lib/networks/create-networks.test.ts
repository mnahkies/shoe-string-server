import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {createNetworks} from "./create-networks.ts"

describe("createNetworks", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("creates missing networks and skips existing ones", async () => {
    const dir = "/test/apps"
    await createTestComposeFile(path.join(dir, "app.yaml"), {
      networks: {
        internal: {external: true},
        postgres: {external: true},
      },
      services: {
        app: {
          networks: ["internal", "postgres"],
        },
      },
    })
    const createdNetworks: string[] = []
    const existingNetworks = new Set(["internal"])

    const networks = await createNetworks(
      [dir],
      (net) => {
        createdNetworks.push(net)
      },
      (net) => existingNetworks.has(net),
    )

    expect(networks).toEqual(["internal", "postgres"])
    expect(createdNetworks).toEqual(["postgres"])
  })
})
