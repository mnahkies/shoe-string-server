import {afterEach, beforeEach, describe, expect, it} from "vitest"
import type {ServerConfig} from "../config.ts"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {action, escapeShellValue, formatExports, formatKeys} from "./secrets.ts"

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
    const baseConfig: ServerConfig = {
      rootConfDir: "/test/cluster",
      secretsFile: "/test/cluster/secrets.encrypted.yaml",
      appsDir: "/test/cluster/applications",
      proxies: [],
      environment: {},
    }

    it("prints export statements for loaded secrets", async () => {
      await fsAdaptor.writeFile(baseConfig.secretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await action(baseConfig, {}, undefined, {
          decrypt: async () => "key: value\nother: secret",
        })

        expect(logs).toEqual(["export KEY='value'", "export OTHER='secret'"])
      } finally {
        console.log = originalLog
      }
    })

    it("prints secret keys when list option is true", async () => {
      await fsAdaptor.writeFile(baseConfig.secretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await action(
          baseConfig,
          {
            list: true,
          },
          undefined,
          {decrypt: async () => "key: value\nother: secret"},
        )

        expect(logs).toEqual(["KEY", "OTHER"])
      } finally {
        console.log = originalLog
      }
    })

    it("filters secrets when filter option is provided", async () => {
      await fsAdaptor.writeFile(baseConfig.secretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await action(
          baseConfig,
          {
            filter: "KEY",
          },
          undefined,
          {decrypt: async () => "key: value\nother: secret"},
        )

        expect(logs).toEqual(["export KEY='value'"])
      } finally {
        console.log = originalLog
      }
    })

    it("loads secrets from custom file specified in config", async () => {
      const customSecretsFile = "/test/cluster/custom-secrets.yaml"
      await fsAdaptor.writeFile(customSecretsFile, "dummy")

      const logs: string[] = []
      const originalLog = console.log
      console.log = (msg: string) => logs.push(msg)

      try {
        await action(
          {
            ...baseConfig,
            secretsFile: customSecretsFile,
          },
          {},
          {},
          {
            decrypt: async (filePath) => {
              expect(filePath).toBe(customSecretsFile)
              return "custom_key: custom_val"
            },
          },
        )

        expect(logs).toEqual(["export CUSTOM_KEY='custom_val'"])
      } finally {
        console.log = originalLog
      }
    })
  })
})
