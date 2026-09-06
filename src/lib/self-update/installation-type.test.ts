import {afterEach, describe, expect, it} from "vitest"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {detectInstallationType} from "./installation-type.ts"

describe("detectInstallationType", () => {
  afterEach(() => {
    resetFsAdaptor()
  })

  it("detects git installation when .git directory is present", async () => {
    const fs = new InMemoryFsAdaptor({
      "/home/user/shoe-string-server/package.json": JSON.stringify({
        name: "shoe-string-server",
        version: "0.0.1",
      }),
      "/home/user/shoe-string-server/.git/config": "repository config",
      "/home/user/shoe-string-server/dist/cli.mjs": "// bundle",
    })
    setFsAdaptor(fs)

    const result = await detectInstallationType(
      "/home/user/shoe-string-server/dist/cli.mjs",
    )
    expect(result).toEqual({
      type: "git",
      dir: "/home/user/shoe-string-server",
      packageName: "shoe-string-server",
      currentVersion: "0.0.1",
    })
  })

  it("detects package installation when .git directory is absent", async () => {
    const fs = new InMemoryFsAdaptor({
      "/usr/local/lib/node_modules/shoe-string-server/package.json":
        JSON.stringify({
          name: "shoe-string-server",
          version: "1.2.3",
        }),
      "/usr/local/lib/node_modules/shoe-string-server/dist/cli.mjs":
        "// bundle",
    })
    setFsAdaptor(fs)

    const result = await detectInstallationType(
      "/usr/local/lib/node_modules/shoe-string-server/dist/cli.mjs",
    )
    expect(result).toEqual({
      type: "package",
      dir: "/usr/local/lib/node_modules/shoe-string-server",
      packageName: "shoe-string-server",
      currentVersion: "1.2.3",
    })
  })

  it("detects installation type directly when given a directory path", async () => {
    const fs = new InMemoryFsAdaptor({
      "/opt/shoe-string-server/package.json": JSON.stringify({
        name: "shoe-string-server",
        version: "0.5.0",
      }),
      "/opt/shoe-string-server/.git/HEAD": "ref: refs/heads/main",
    })
    setFsAdaptor(fs)

    const result = await detectInstallationType("/opt/shoe-string-server")
    expect(result).toEqual({
      type: "git",
      dir: "/opt/shoe-string-server",
      packageName: "shoe-string-server",
      currentVersion: "0.5.0",
    })
  })
})
