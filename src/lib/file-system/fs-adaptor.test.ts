import os from "node:os"
import path from "node:path"
import {afterEach, describe, expect, it} from "vitest"
import {getFsAdaptor, resetFsAdaptor, setFsAdaptor} from "./fs-adaptor.ts"
import {InMemoryFsAdaptor} from "./in-memory.fs-adaptor.ts"
import {NodeFsAdaptor} from "./node.fs-adaptor.ts"
import type {FsAdaptor} from "./types.ts"

function runFsAdaptorTestSuite(
  suiteName: string,
  createAdaptor: () => Promise<{
    adaptor: FsAdaptor
    baseDir: string
    cleanup: () => Promise<void>
  }>,
) {
  describe(suiteName, () => {
    it("reads and writes files", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const filePath = path.join(baseDir, "test.txt")
        expect(await adaptor.exists(filePath)).toBe(false)

        await adaptor.writeFile(filePath, "hello world")
        expect(await adaptor.exists(filePath)).toBe(true)
        expect(await adaptor.readFile(filePath)).toBe("hello world")
      } finally {
        await cleanup()
      }
    })

    it("throws error when reading non-existent file", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const filePath = path.join(baseDir, "missing.txt")
        await expect(adaptor.readFile(filePath)).rejects.toThrow(/ENOENT/)
      } finally {
        await cleanup()
      }
    })

    it("handles mkdir and readdir", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const subDir = path.join(baseDir, "a", "b", "c")
        await adaptor.mkdir(subDir, {recursive: true})
        expect(await adaptor.exists(subDir)).toBe(true)

        await adaptor.writeFile(path.join(subDir, "file1.txt"), "1")
        await adaptor.writeFile(path.join(subDir, "file2.txt"), "2")

        const entries = await adaptor.readdir(subDir)
        expect(entries).toEqual(["file1.txt", "file2.txt"])
      } finally {
        await cleanup()
      }
    })

    it("handles cp for files and directories", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const srcDir = path.join(baseDir, "src")
        const destDir = path.join(baseDir, "dest")

        await adaptor.mkdir(srcDir, {recursive: true})
        await adaptor.writeFile(path.join(srcDir, "hello.txt"), "content")

        await adaptor.cp(srcDir, destDir, {recursive: true})
        expect(await adaptor.exists(path.join(destDir, "hello.txt"))).toBe(true)
        expect(await adaptor.readFile(path.join(destDir, "hello.txt"))).toBe(
          "content",
        )
      } finally {
        await cleanup()
      }
    })

    it("handles rename for files and directories", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const oldFile = path.join(baseDir, "old.txt")
        const newFile = path.join(baseDir, "new.txt")

        await adaptor.writeFile(oldFile, "rename e2e")
        await adaptor.rename(oldFile, newFile)

        expect(await adaptor.exists(oldFile)).toBe(false)
        expect(await adaptor.exists(newFile)).toBe(true)
        expect(await adaptor.readFile(newFile)).toBe("rename e2e")
      } finally {
        await cleanup()
      }
    })

    it("handles rm with recursive and force options", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const targetDir = path.join(baseDir, "delete-me", "nested")
        await adaptor.mkdir(targetDir, {recursive: true})
        await adaptor.writeFile(path.join(targetDir, "file.txt"), "data")

        await adaptor.rm(path.join(baseDir, "delete-me"), {recursive: true})
        expect(await adaptor.exists(path.join(baseDir, "delete-me"))).toBe(
          false,
        )

        // Force remove non-existent should not throw
        await adaptor.rm(path.join(baseDir, "delete-me"), {force: true})
      } finally {
        await cleanup()
      }
    })

    it("checks stat for files and directories", async () => {
      const {adaptor, baseDir, cleanup} = await createAdaptor()
      try {
        const dir = path.join(baseDir, "stat-dir")
        const file = path.join(dir, "stat-file.txt")

        await adaptor.mkdir(dir, {recursive: true})
        await adaptor.writeFile(file, "stat content")

        const dirStat = await adaptor.stat(dir)
        expect(dirStat.isDirectory()).toBe(true)
        expect(dirStat.isFile()).toBe(false)

        const fileStat = await adaptor.stat(file)
        expect(fileStat.isDirectory()).toBe(false)
        expect(fileStat.isFile()).toBe(true)
      } finally {
        await cleanup()
      }
    })
  })
}

runFsAdaptorTestSuite("NodeFsAdaptor", async () => {
  const nodeFs = new NodeFsAdaptor()
  const baseDir = path.join(
    os.tmpdir(),
    `node-fs-test-${Date.now()}-${Math.random()}`,
  )
  await nodeFs.mkdir(baseDir, {recursive: true})
  return {
    adaptor: nodeFs,
    baseDir,
    cleanup: async () => {
      await nodeFs.rm(baseDir, {recursive: true, force: true})
    },
  }
})

runFsAdaptorTestSuite("InMemoryFsAdaptor", async () => {
  const memFs = new InMemoryFsAdaptor()
  const baseDir = "/virtual/e2e-dir"
  await memFs.mkdir(baseDir, {recursive: true})
  return {
    adaptor: memFs,
    baseDir,
    cleanup: async () => {
      await memFs.rm(baseDir, {recursive: true, force: true})
    },
  }
})

describe("fs-adaptor factory and global state", () => {
  afterEach(() => {
    resetFsAdaptor()
  })

  it("allows setting and getting custom adaptor", () => {
    const custom = new InMemoryFsAdaptor({"/virtual/a.txt": "custom"})
    setFsAdaptor(custom)
    expect(getFsAdaptor()).toBe(custom)
  })

  it("returns NodeFsAdaptor regardless of NODE_ENV; e2e code opts into in-memory explicitly", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "test"
    try {
      resetFsAdaptor()
      const adaptor = getFsAdaptor()
      expect(adaptor).toBeInstanceOf(NodeFsAdaptor)
    } finally {
      process.env.NODE_ENV = prev
      resetFsAdaptor()
    }
  })
})
