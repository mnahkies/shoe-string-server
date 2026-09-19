import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createProgram} from "../cli.ts"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {
  escapeShellValue,
  formatExports,
  formatKeys,
  loadSecretsCommand,
} from "./secrets.ts"

describe("load-secrets command", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  describe("escapeShellValue", () => {
    it("wraps value in single quotes", () => {
      expect(escapeShellValue("hello world")).toBe("'hello world'")
    })

    it("escapes single quotes correctly for shell evaluation", () => {
      expect(escapeShellValue("it's a test")).toBe("'it'\\''s a test'")
    })

    it('handles special characters like $, ", and newlines safely', () => {
      expect(escapeShellValue('var=$FOO\n"quote"')).toBe(
        "'var=$FOO\n\"quote\"'",
      )
    })
  })

  describe("formatExports", () => {
    it("formats valid environment variables as export statements", () => {
      const secrets = {
        API_KEY: "secret123",
        DB_PASS: "pass'word",
      }

      const lines = formatExports(secrets)

      expect(lines).toEqual([
        "export API_KEY='secret123'",
        "export DB_PASS='pass'\\''word'",
      ])
    })

    it("skips invalid shell identifiers", () => {
      const secrets = {
        VALID_KEY: "valid",
        "invalid-key-with-dash": "invalid",
        "123_starts_with_number": "invalid",
      }

      const lines = formatExports(secrets)

      expect(lines).toEqual(["export VALID_KEY='valid'"])
    })
  })

  describe("formatKeys", () => {
    it("returns all secret keys", () => {
      const secrets = {
        FOO: "1",
        BAR: "2",
      }

      expect(formatKeys(secrets)).toEqual(["FOO", "BAR"])
    })
  })

  describe("loadSecretsCommand", () => {
    beforeEach(async () => {
      await fsAdaptor.writeFile("/test/cluster/cluster.yaml", "{}\n")
      await fsAdaptor.mkdir("/test/cluster/applications", {recursive: true})
    })

    it("prints export statements for loaded secrets", async () => {
      const secretsFile = "/test/cluster/secrets.encrypted.yaml"
      await fsAdaptor.writeFile(secretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await loadSecretsCommand({
          dataDir: "/test/cluster",
          decrypt: async () => "key: value\nother: secret",
        })

        expect(logs).toEqual(["export KEY='value'", "export OTHER='secret'"])
      } finally {
        console.log = originalLog
      }
    })

    it("prints secret keys when list option is true", async () => {
      const secretsFile = "/test/cluster/secrets.encrypted.yaml"
      await fsAdaptor.writeFile(secretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await loadSecretsCommand({
          dataDir: "/test/cluster",
          list: true,
          decrypt: async () => "key: value\nother: secret",
        })

        expect(logs).toEqual(["KEY", "OTHER"])
      } finally {
        console.log = originalLog
      }
    })

    it("filters secrets when filter option is provided", async () => {
      const secretsFile = "/test/cluster/secrets.encrypted.yaml"
      await fsAdaptor.writeFile(secretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await loadSecretsCommand({
          dataDir: "/test/cluster",
          filter: "KEY",
          decrypt: async () => "key: value\nother: secret",
        })

        expect(logs).toEqual(["export KEY='value'"])
      } finally {
        console.log = originalLog
      }
    })

    it("loads secrets from custom file specified via file option", async () => {
      const customSecretsFile = "/test/cluster/custom-secrets.yaml"
      await fsAdaptor.writeFile(customSecretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await loadSecretsCommand({
          dataDir: "/test/cluster",
          secretsFile: "custom-secrets.yaml",
          decrypt: async (filePath) => {
            expect(filePath).toBe(customSecretsFile)
            return "custom_key: custom_val"
          },
        })

        expect(logs).toEqual(["export CUSTOM_KEY='custom_val'"])
      } finally {
        console.log = originalLog
      }
    })

    it("throws error when secrets file does not exist", async () => {
      await fsAdaptor.writeFile("/test/empty/cluster.yaml", "{}\n")
      await fsAdaptor.mkdir("/test/empty/applications", {recursive: true})

      await expect(
        loadSecretsCommand({
          dataDir: "/test/empty",
          decrypt: async () => "",
        }),
      ).rejects.toThrow(
        /secretsFile must exist, got: \/test\/empty\/secrets.encrypted.yaml/,
      )
    })
  })

  describe("CLI program integration", () => {
    it("creates program with load-secrets command and aliases", () => {
      const program = createProgram()
      const loadSecretsCmd = program.commands.find(
        (cmd) => cmd.name() === "secrets",
      )

      expect(loadSecretsCmd).toBeDefined()
    })
  })
})
