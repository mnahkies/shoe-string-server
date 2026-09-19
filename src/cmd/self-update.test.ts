import path from "node:path"
import {fileURLToPath} from "node:url"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {selfUpdate, selfUpdateCommand} from "./self-update.ts"

const commandCalls: string[] = []
let commandResults: Record<
  string,
  {exitCode: number; stdout?: string; stderr?: string}
> = {}

vi.mock("zx", () => {
  const $ = (pieces: TemplateStringsArray, ...args: unknown[]) => {
    let full = ""
    pieces.forEach((piece, i) => {
      full += piece
      if (i < args.length) {
        full += String(args[i])
      }
    })
    const cmd = full.trim()
    commandCalls.push(cmd)

    const match = commandResults[cmd] ?? {exitCode: 0, stdout: "", stderr: ""}
    const resultObj = {
      exitCode: match.exitCode,
      stdout: match.stdout ?? "",
      stderr: match.stderr ?? "",
    }

    // biome-ignore lint/suspicious/noExplicitAny: mock
    const promise: any = Promise.resolve(resultObj)
    promise.quiet = () => promise
    promise.nothrow = () => promise
    return promise
  }

  return {
    $,
    cd: vi.fn(),
  }
})

describe("self-update", () => {
  beforeEach(() => {
    commandCalls.length = 0
    commandResults = {}
  })

  describe("selfUpdate", () => {
    beforeEach(() => {
      const fs = new InMemoryFsAdaptor({
        "/opt/shoe-string-server/package.json": JSON.stringify({
          name: "shoe-string-server",
          version: "0.0.1",
        }),
        "/opt/shoe-string-server/.git/HEAD": "ref: refs/heads/main",
      })
      setFsAdaptor(fs)

      commandResults = {
        "git remote": {exitCode: 0, stdout: "origin"},
        "git pull": {exitCode: 0, stdout: "Already up to date."},
        "mise install": {exitCode: 0, stdout: ""},
        "mise exec -- pnpm install": {exitCode: 0, stdout: ""},
        "mise exec -- pnpm run build": {exitCode: 0, stdout: ""},
      }
    })

    it("executes the full update workflow in order", async () => {
      await selfUpdate({installationDir: "/opt/shoe-string-server"})

      expect(commandCalls).toEqual([
        "git remote",
        "git pull",
        "mise install",
        "mise exec -- pnpm install",
        "mise exec -- pnpm run build",
      ])
    })

    it("throws if git remote returns no remotes", async () => {
      commandResults["git remote"] = {exitCode: 0, stdout: ""}

      await expect(
        selfUpdate({installationDir: "/opt/shoe-string-server"}),
      ).rejects.toThrow("No git remote found in /opt/shoe-string-server")

      expect(commandCalls).toEqual(["git remote"])
    })

    it("throws if git remote command fails", async () => {
      commandResults["git remote"] = {
        exitCode: 128,
        stderr: "fatal: not a git repository",
      }

      await expect(
        selfUpdate({installationDir: "/opt/shoe-string-server"}),
      ).rejects.toThrow(
        "No git remote found in /opt/shoe-string-server: fatal: not a git repository",
      )

      expect(commandCalls).toEqual(["git remote"])
    })

    it("throws if git pull fails", async () => {
      commandResults["git pull"] = {
        exitCode: 1,
        stderr: "fatal: could not read from remote repository",
      }

      await expect(
        selfUpdate({installationDir: "/opt/shoe-string-server"}),
      ).rejects.toThrow(
        "Git pull failed in /opt/shoe-string-server: fatal: could not read from remote repository",
      )

      expect(commandCalls).toEqual(["git remote", "git pull"])
    })

    it("throws if mise install fails", async () => {
      commandResults["mise install"] = {
        exitCode: 1,
        stderr: "mise error: failed to install tool",
      }

      await expect(
        selfUpdate({installationDir: "/opt/shoe-string-server"}),
      ).rejects.toThrow(
        "mise install failed: mise error: failed to install tool",
      )

      expect(commandCalls).toEqual(["git remote", "git pull", "mise install"])
    })

    it("throws if pnpm install fails", async () => {
      commandResults["mise exec -- pnpm install"] = {
        exitCode: 1,
        stderr: "ERR_PNPM_FETCH_404",
      }

      await expect(
        selfUpdate({installationDir: "/opt/shoe-string-server"}),
      ).rejects.toThrow("pnpm install failed: ERR_PNPM_FETCH_404")

      expect(commandCalls).toEqual([
        "git remote",
        "git pull",
        "mise install",
        "mise exec -- pnpm install",
      ])
    })

    it("throws if pnpm run build fails", async () => {
      commandResults["mise exec -- pnpm run build"] = {
        exitCode: 1,
        stderr: "Build failed with errors",
      }

      await expect(
        selfUpdate({installationDir: "/opt/shoe-string-server"}),
      ).rejects.toThrow("pnpm run build failed: Build failed with errors")

      expect(commandCalls).toEqual([
        "git remote",
        "git pull",
        "mise install",
        "mise exec -- pnpm install",
        "mise exec -- pnpm run build",
      ])
    })

    describe("package installation mode", () => {
      beforeEach(() => {
        const fs = new InMemoryFsAdaptor({
          "/usr/local/lib/node_modules/shoe-string-server/package.json":
            JSON.stringify({
              name: "shoe-string-server",
              version: "0.0.1",
            }),
        })
        setFsAdaptor(fs)
      })

      it("displays upgrade instructions when a newer version is available in npm registry", async () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({version: "0.2.0"}),
        } as Response)

        await selfUpdate({
          installationDir: "/usr/local/lib/node_modules/shoe-string-server",
          fetchFn: mockFetch,
        })

        expect(commandCalls).toEqual([])
        expect(consoleSpy).toHaveBeenCalledWith("Current version: 0.0.1")
        expect(consoleSpy).toHaveBeenCalledWith("Latest version:  0.2.0")
        expect(
          consoleSpy.mock.calls.some((args) =>
            args[0]?.includes("mise:   mise upgrade npm:shoe-string-server"),
          ),
        ).toBe(true)

        consoleSpy.mockRestore()
      })

      it("notifies when current version is already up to date", async () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({version: "0.0.1"}),
        } as Response)

        await selfUpdate({
          installationDir: "/usr/local/lib/node_modules/shoe-string-server",
          fetchFn: mockFetch,
        })

        expect(commandCalls).toEqual([])
        expect(consoleSpy).toHaveBeenCalledWith("Current version: 0.0.1")
        expect(consoleSpy).toHaveBeenCalledWith("Latest version:  0.0.1")
        expect(
          consoleSpy.mock.calls.some((args) =>
            args[0]?.includes("shoe-string-server is already up to date"),
          ),
        ).toBe(true)

        consoleSpy.mockRestore()
      })

      it("logs warning and upgrade instructions when npm registry fetch fails", async () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response)

        await selfUpdate({
          installationDir: "/usr/local/lib/node_modules/shoe-string-server",
          fetchFn: mockFetch,
        })

        expect(commandCalls).toEqual([])
        expect(
          consoleSpy.mock.calls.some((args) =>
            args[0]?.includes(
              "Could not check latest version from npm registry",
            ),
          ),
        ).toBe(true)
        expect(
          consoleSpy.mock.calls.some((args) =>
            args[0]?.includes("mise:   mise upgrade npm:shoe-string-server"),
          ),
        ).toBe(true)

        consoleSpy.mockRestore()
      })
    })
  })

  describe("selfUpdateCommand", () => {
    afterEach(() => {
      resetFsAdaptor()
    })

    it("runs selfUpdate without requiring cluster config", async () => {
      const currentDir = path.dirname(fileURLToPath(import.meta.url))
      const rootDir = path.resolve(currentDir, "../..")
      const fs = new InMemoryFsAdaptor({
        [path.join(rootDir, "package.json")]: JSON.stringify({
          name: "shoe-string-server",
        }),
        [path.join(rootDir, ".git/HEAD")]: "ref: refs/heads/main",
      })
      setFsAdaptor(fs)

      commandResults = {
        "git remote": {exitCode: 0, stdout: "origin"},
        "git pull": {exitCode: 0},
        "mise install": {exitCode: 0},
        "mise exec -- pnpm install": {exitCode: 0},
        "mise exec -- pnpm run build": {exitCode: 0},
      }

      await selfUpdateCommand()
      expect(commandCalls).toContain("git remote")
    })
  })
})
