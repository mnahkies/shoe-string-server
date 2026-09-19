export interface FsAdaptor {
  readFile(filePath: string, encoding?: BufferEncoding): Promise<string>
  writeFile(
    filePath: string,
    content: string,
    encoding?: BufferEncoding,
  ): Promise<void>
  exists(filePath: string): Promise<boolean>
  mkdir(filePath: string, options?: {recursive?: boolean}): Promise<void>
  readdir(filePath: string): Promise<string[]>
  rm(
    filePath: string,
    options?: {recursive?: boolean; force?: boolean},
  ): Promise<void>
  cp(
    source: string,
    destination: string,
    options?: {recursive?: boolean},
  ): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  stat(filePath: string): Promise<{
    isDirectory(): boolean
    isFile(): boolean
  }>
}
