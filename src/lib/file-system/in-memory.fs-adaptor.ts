import path from "node:path"
import type {FsAdaptor} from "./types.ts"

export class InMemoryFsAdaptor implements FsAdaptor {
  private readonly files: Map<string, string>
  private readonly directories: Set<string>

  constructor(initialFiles: Record<string, string> | Map<string, string> = {}) {
    this.files = new Map<string, string>()
    this.directories = new Set<string>()

    const entries =
      initialFiles instanceof Map
        ? initialFiles.entries()
        : Object.entries(initialFiles)

    for (const [filePath, content] of entries) {
      const normalized = this.normalize(filePath)
      this.files.set(normalized, content)
      this.ensureParentDirs(normalized)
    }
  }

  private normalize(p: string): string {
    return path.resolve(p)
  }

  private ensureParentDirs(filePath: string): void {
    let parent = path.dirname(filePath)
    while (parent !== path.dirname(parent)) {
      this.directories.add(parent)
      parent = path.dirname(parent)
    }
    this.directories.add(parent)
  }

  async readFile(
    filePath: string,
    _encoding: BufferEncoding = "utf-8",
  ): Promise<string> {
    const normalized = this.normalize(filePath)
    if (this.directories.has(normalized)) {
      const err = new Error(
        `EISDIR: illegal operation on a directory, read '${filePath}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "EISDIR"
      throw err
    }
    const content = this.files.get(normalized)
    if (content === undefined) {
      const err = new Error(
        `ENOENT: no such file or directory, open '${filePath}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "ENOENT"
      throw err
    }
    return content
  }

  async writeFile(
    filePath: string,
    content: string,
    _encoding: BufferEncoding = "utf-8",
  ): Promise<void> {
    const normalized = this.normalize(filePath)
    if (this.directories.has(normalized)) {
      const err = new Error(
        `EISDIR: illegal operation on a directory, write '${filePath}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "EISDIR"
      throw err
    }
    this.files.set(normalized, content)
    this.ensureParentDirs(normalized)
  }

  async exists(filePath: string): Promise<boolean> {
    const normalized = this.normalize(filePath)
    return this.files.has(normalized) || this.directories.has(normalized)
  }

  async mkdir(dirPath: string, options?: {recursive?: boolean}): Promise<void> {
    const normalized = this.normalize(dirPath)
    if (this.files.has(normalized)) {
      const err = new Error(`EEXIST: file already exists, mkdir '${dirPath}'`)
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "EEXIST"
      throw err
    }

    if (options?.recursive) {
      this.directories.add(normalized)
      this.ensureParentDirs(normalized)
    } else {
      const parent = path.dirname(normalized)
      if (parent !== normalized && !this.directories.has(parent)) {
        const err = new Error(
          `ENOENT: no such file or directory, mkdir '${dirPath}'`,
        )
        // biome-ignore lint/suspicious/noExplicitAny: stdlib
        ;(err as any).code = "ENOENT"
        throw err
      }
      if (this.directories.has(normalized)) {
        const err = new Error(`EEXIST: file already exists, mkdir '${dirPath}'`)
        // biome-ignore lint/suspicious/noExplicitAny: stdlib
        ;(err as any).code = "EEXIST"
        throw err
      }
      this.directories.add(normalized)
    }
  }

  async readdir(dirPath: string): Promise<string[]> {
    const normalized = this.normalize(dirPath)
    if (!this.directories.has(normalized) && !this.files.has(normalized)) {
      const err = new Error(
        `ENOENT: no such file or directory, scandir '${dirPath}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "ENOENT"
      throw err
    }
    if (this.files.has(normalized)) {
      const err = new Error(`ENOTDIR: not a directory, scandir '${dirPath}'`)
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "ENOTDIR"
      throw err
    }

    const entries = new Set<string>()
    const prefix = normalized.endsWith(path.sep)
      ? normalized
      : normalized + path.sep

    for (const f of this.files.keys()) {
      if (f.startsWith(prefix)) {
        const rel = f.slice(prefix.length)
        const name = rel.split(path.sep)[0]
        if (name) {
          entries.add(name)
        }
      }
    }

    for (const d of this.directories) {
      if (d.startsWith(prefix) && d !== normalized) {
        const rel = d.slice(prefix.length)
        const name = rel.split(path.sep)[0]
        if (name) {
          entries.add(name)
        }
      }
    }

    return Array.from(entries).sort()
  }

  async rm(
    filePath: string,
    options?: {recursive?: boolean; force?: boolean},
  ): Promise<void> {
    const normalized = this.normalize(filePath)
    const exists =
      this.files.has(normalized) || this.directories.has(normalized)

    if (!exists) {
      if (options?.force) {
        return
      }
      const err = new Error(
        `ENOENT: no such file or directory, rm '${filePath}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "ENOENT"
      throw err
    }

    if (this.files.has(normalized)) {
      this.files.delete(normalized)
      return
    }

    if (this.directories.has(normalized)) {
      const prefix = normalized.endsWith(path.sep)
        ? normalized
        : normalized + path.sep

      if (!options?.recursive) {
        const children = await this.readdir(normalized)
        if (children.length > 0) {
          const err = new Error(
            `ENOTEMPTY: directory not empty, rm '${filePath}'`,
          )
          // biome-ignore lint/suspicious/noExplicitAny: stdlib
          ;(err as any).code = "ENOTEMPTY"
          throw err
        }
        this.directories.delete(normalized)
        return
      }

      this.directories.delete(normalized)
      for (const f of Array.from(this.files.keys())) {
        if (f.startsWith(prefix)) {
          this.files.delete(f)
        }
      }
      for (const d of Array.from(this.directories)) {
        if (d.startsWith(prefix)) {
          this.directories.delete(d)
        }
      }
    }
  }

  async cp(
    source: string,
    destination: string,
    options?: {recursive?: boolean},
  ): Promise<void> {
    const normSrc = this.normalize(source)
    const normDest = this.normalize(destination)

    if (!this.files.has(normSrc) && !this.directories.has(normSrc)) {
      const err = new Error(
        `ENOENT: no such file or directory, cp '${source}' -> '${destination}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "ENOENT"
      throw err
    }

    const fileContent = this.files.get(normSrc)
    if (fileContent !== undefined) {
      this.files.set(normDest, fileContent)
      this.ensureParentDirs(normDest)
      return
    }

    if (this.directories.has(normSrc)) {
      if (!options?.recursive) {
        const err = new Error(
          `EISDIR: is a directory, cp without recursive '${source}'`,
        )
        // biome-ignore lint/suspicious/noExplicitAny: stdlib
        ;(err as any).code = "EISDIR"
        throw err
      }

      this.directories.add(normDest)
      this.ensureParentDirs(normDest)

      const srcPrefix = normSrc.endsWith(path.sep)
        ? normSrc
        : normSrc + path.sep

      for (const [f, content] of Array.from(this.files.entries())) {
        if (f.startsWith(srcPrefix)) {
          const rel = f.slice(srcPrefix.length)
          const targetFile = path.join(normDest, rel)
          this.files.set(targetFile, content)
          this.ensureParentDirs(targetFile)
        }
      }

      for (const d of Array.from(this.directories)) {
        if (d.startsWith(srcPrefix) && d !== normSrc) {
          const rel = d.slice(srcPrefix.length)
          const targetDir = path.join(normDest, rel)
          this.directories.add(targetDir)
        }
      }
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const normOld = this.normalize(oldPath)
    const normNew = this.normalize(newPath)

    if (!this.files.has(normOld) && !this.directories.has(normOld)) {
      const err = new Error(
        `ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`,
      )
      // biome-ignore lint/suspicious/noExplicitAny: stdlib
      ;(err as any).code = "ENOENT"
      throw err
    }

    const fileContent = this.files.get(normOld)
    if (fileContent !== undefined) {
      this.files.delete(normOld)
      this.files.set(normNew, fileContent)
      this.ensureParentDirs(normNew)
      return
    }

    if (this.directories.has(normOld)) {
      this.directories.delete(normOld)
      this.directories.add(normNew)
      this.ensureParentDirs(normNew)

      const oldPrefix = normOld.endsWith(path.sep)
        ? normOld
        : normOld + path.sep

      for (const [f, content] of Array.from(this.files.entries())) {
        if (f.startsWith(oldPrefix)) {
          const rel = f.slice(oldPrefix.length)
          const targetFile = path.join(normNew, rel)
          this.files.delete(f)
          this.files.set(targetFile, content)
          this.ensureParentDirs(targetFile)
        }
      }

      for (const d of Array.from(this.directories)) {
        if (d.startsWith(oldPrefix) && d !== normOld) {
          const rel = d.slice(oldPrefix.length)
          const targetDir = path.join(normNew, rel)
          this.directories.delete(d)
          this.directories.add(targetDir)
        }
      }
    }
  }

  async stat(filePath: string): Promise<{
    isDirectory(): boolean
    isFile(): boolean
  }> {
    const normalized = this.normalize(filePath)
    if (this.files.has(normalized)) {
      return {
        isDirectory: () => false,
        isFile: () => true,
      }
    }
    if (this.directories.has(normalized)) {
      return {
        isDirectory: () => true,
        isFile: () => false,
      }
    }
    const err = new Error(
      `ENOENT: no such file or directory, stat '${filePath}'`,
    )
    // biome-ignore lint/suspicious/noExplicitAny: stdlib
    ;(err as any).code = "ENOENT"
    throw err
  }
}
