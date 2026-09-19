import {afterEach, describe, expect, it} from "vitest"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {findInstallationDir} from "./find-installation-dir.ts"

describe("findInstallationDir", () => {
  afterEach(() => {
    resetFsAdaptor()
  })

  it("locates repo root when starting from dist/cli.mjs", async () => {
    const fs = new InMemoryFsAdaptor({
      "/opt/shoe-string-server/package.json": JSON.stringify({
        name: "shoe-string-server",
      }),
      "/opt/shoe-string-server/dist/cli.mjs": "// bundle",
    })
    setFsAdaptor(fs)

    const result = await findInstallationDir(
      "/opt/shoe-string-server/dist/cli.mjs",
    )
    expect(result).toBe("/opt/shoe-string-server")
  })

  it("locates repo root when starting from src/lib/find-installation-dir.ts", async () => {
    const fs = new InMemoryFsAdaptor({
      "/home/user/shoe-string-server/package.json": JSON.stringify({
        name: "shoe-string-server",
      }),
      "/home/user/shoe-string-server/src/lib/find-installation-dir.ts":
        "// source",
    })
    setFsAdaptor(fs)

    const result = await findInstallationDir(
      "/home/user/shoe-string-server/src/lib/find-installation-dir.ts",
    )
    expect(result).toBe("/home/user/shoe-string-server")
  })

  it("throws if no package.json with name 'shoe-string-server' exists", async () => {
    const fs = new InMemoryFsAdaptor({
      "/opt/other-project/package.json": JSON.stringify({
        name: "other-project",
      }),
    })
    setFsAdaptor(fs)

    await expect(
      findInstallationDir("/opt/other-project/src/index.ts"),
    ).rejects.toThrow(
      "Unable to locate shoe-string-server installation directory",
    )
  })
})
