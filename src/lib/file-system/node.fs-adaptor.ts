import fs from "node:fs/promises"
import type {FsAdaptor} from "./types.ts"

export class NodeFsAdaptor implements FsAdaptor {
  async readFile(
    filePath: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<string> {
    return await fs.readFile(filePath, encoding)
  }

  async writeFile(
    filePath: string,
    content: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<void> {
    return await fs.writeFile(filePath, content, encoding)
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async mkdir(
    filePath: string,
    options?: {recursive?: boolean},
  ): Promise<void> {
    await fs.mkdir(filePath, options)
  }

  async readdir(filePath: string): Promise<string[]> {
    return await fs.readdir(filePath)
  }

  async rm(
    filePath: string,
    options?: {recursive?: boolean; force?: boolean},
  ): Promise<void> {
    await fs.rm(filePath, options)
  }

  async cp(
    source: string,
    destination: string,
    options?: {recursive?: boolean},
  ): Promise<void> {
    await fs.cp(source, destination, options)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath)
  }

  async stat(filePath: string): Promise<{
    isDirectory(): boolean
    isFile(): boolean
  }> {
    const stats = await fs.stat(filePath)
    return {
      isDirectory: () => stats.isDirectory(),
      isFile: () => stats.isFile(),
    }
  }
}
