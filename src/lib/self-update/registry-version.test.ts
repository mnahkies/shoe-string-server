import {describe, expect, it, vi} from "vitest"
import {
  fetchLatestNpmVersion,
  getUpgradeInstructions,
} from "./registry-version.ts"

describe("getUpgradeInstructions", () => {
  it("formats upgrade cmd for package managers", () => {
    const instructions = getUpgradeInstructions("shoe-string-server")
    expect(instructions).toContain(
      "mise:   mise upgrade npm:shoe-string-server",
    )
    expect(instructions).toContain(
      "pnpm:   pnpm add -g shoe-string-server@latest",
    )
    expect(instructions).toContain(
      "npm:    npm install -g shoe-string-server@latest",
    )
    expect(instructions).toContain(
      "yarn:   yarn global add shoe-string-server@latest",
    )
  })
})

describe("fetchLatestNpmVersion", () => {
  it("returns latest version when registry responds successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({version: "0.2.0"}),
    } as Response)

    const version = await fetchLatestNpmVersion("shoe-string-server", mockFetch)
    expect(version).toBe("0.2.0")
    expect(mockFetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/shoe-string-server/latest",
      expect.objectContaining({
        headers: {Accept: "application/json"},
      }),
    )
  })

  it("throws error when registry returns non-ok status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response)

    await expect(
      fetchLatestNpmVersion("shoe-string-server", mockFetch),
    ).rejects.toThrow("HTTP 404 Not Found")
  })

  it("throws error when response is missing version", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    await expect(
      fetchLatestNpmVersion("shoe-string-server", mockFetch),
    ).rejects.toThrow("Invalid response from npm registry: missing version")
  })
})
