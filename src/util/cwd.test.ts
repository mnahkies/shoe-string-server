import os from "node:os"
import path from "node:path"
import {describe, expect, it} from "vitest"
import {useCwd, withCwd} from "./cwd.ts"

describe("cwd helpers", () => {
  it("changes directory within withCwd callback and restores original cwd", async () => {
    const originalCwd = process.cwd()
    const targetDir = os.tmpdir()

    const result = await withCwd(targetDir, async () => {
      expect(path.resolve(process.cwd())).toBe(path.resolve(targetDir))
      return "done"
    })

    expect(result).toBe("done")
    expect(path.resolve(process.cwd())).toBe(path.resolve(originalCwd))
  })

  it("restores original cwd when callback throws", async () => {
    const originalCwd = process.cwd()
    const targetDir = os.tmpdir()

    await expect(
      withCwd(targetDir, async () => {
        expect(path.resolve(process.cwd())).toBe(path.resolve(targetDir))
        throw new Error("boom")
      }),
    ).rejects.toThrow(/boom/)

    expect(path.resolve(process.cwd())).toBe(path.resolve(originalCwd))
  })

  it("works with synchronous callbacks in withCwd", async () => {
    const originalCwd = process.cwd()
    const targetDir = os.tmpdir()

    const result = await withCwd(targetDir, () => {
      expect(path.resolve(process.cwd())).toBe(path.resolve(targetDir))
      return 42
    })

    expect(result).toBe(42)
    expect(path.resolve(process.cwd())).toBe(path.resolve(originalCwd))
  })

  it("works with explicit resource management (using useCwd)", () => {
    const originalCwd = process.cwd()
    const targetDir = os.tmpdir()

    {
      using _ = useCwd(targetDir)
      expect(path.resolve(process.cwd())).toBe(path.resolve(targetDir))
    }

    expect(path.resolve(process.cwd())).toBe(path.resolve(originalCwd))
  })

  it("works with explicit resource management (using withCwd)", () => {
    const originalCwd = process.cwd()
    const targetDir = os.tmpdir()

    {
      using _ = withCwd(targetDir)
      expect(path.resolve(process.cwd())).toBe(path.resolve(targetDir))
    }

    expect(path.resolve(process.cwd())).toBe(path.resolve(originalCwd))
  })
})
