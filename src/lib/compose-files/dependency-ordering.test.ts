import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {sortByStartOrder, sortByStopOrder} from "./dependency-ordering.ts"

describe("dependency ordering", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const appsDir = "/test/apps"

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("starts dependencies before the applications that require them", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })

    const {startOrder, missing} = await sortByStartOrder([api, database])

    expect(startOrder).toEqual([database, api])
    expect(missing).toEqual([])
  })

  it("emits independent applications in sorted order", async () => {
    const zebra = await createTestComposeFile(path.join(appsDir, "zebra.yaml"))
    const mango = await createTestComposeFile(path.join(appsDir, "mango.yaml"))
    const apple = await createTestComposeFile(path.join(appsDir, "apple.yaml"))

    const {startOrder} = await sortByStartOrder([zebra, mango, apple])

    expect(startOrder).toEqual([apple, mango, zebra])
  })

  it("orders transitive dependencies before dependents", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const cache = await createTestComposeFile(path.join(appsDir, "cache.yaml"))
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [cache],
    })
    const worker = await createTestComposeFile(
      path.join(appsDir, "worker.yaml"),
      {"x-requires": [api, database]},
    )

    const {startOrder} = await sortByStartOrder([worker, api, cache, database])

    expect(startOrder.indexOf(database)).toBeLessThan(startOrder.indexOf(api))
    expect(startOrder.indexOf(cache)).toBeLessThan(startOrder.indexOf(api))
    expect(startOrder.indexOf(api)).toBeLessThan(startOrder.indexOf(worker))
  })

  it("treats missing dependencies as satisfied and reports them", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })

    const {startOrder, missing} = await sortByStartOrder([api])

    expect(startOrder).toEqual([api])
    expect(missing).toEqual([database])
  })

  it("reports shared missing dependencies once", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })
    const worker = await createTestComposeFile(
      path.join(appsDir, "worker.yaml"),
      {"x-requires": [database]},
    )

    const {startOrder, missing} = await sortByStartOrder([api, worker])

    expect(startOrder).toEqual([api, worker])
    expect(missing).toEqual([database])
  })

  it("throws on circular dependencies", async () => {
    const apiPath = path.join(appsDir, "api.yaml")
    const workerPath = path.join(appsDir, "worker.yaml")
    await createTestComposeFile(apiPath, {"x-requires": [workerPath]})
    await createTestComposeFile(workerPath, {"x-requires": [apiPath]})

    await expect(sortByStartOrder([apiPath, workerPath])).rejects.toThrow(
      new RegExp(`Circular dependencies found:.*${apiPath}.*${workerPath}`),
    )
  })

  it("treats a self-dependency as circular", async () => {
    const apiPath = path.join(appsDir, "api.yaml")
    await createTestComposeFile(apiPath, {"x-requires": [apiPath]})

    await expect(sortByStartOrder([apiPath])).rejects.toThrow(
      /Circular dependencies found/,
    )
  })

  it("stops applications in reverse start order", async () => {
    const database = await createTestComposeFile(
      path.join(appsDir, "database.yaml"),
    )
    const api = await createTestComposeFile(path.join(appsDir, "api.yaml"), {
      "x-requires": [database],
    })

    const {stopOrder, missing} = await sortByStopOrder([api, database])

    expect(stopOrder).toEqual([api, database])
    expect(missing).toEqual([])
  })
})
