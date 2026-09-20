import {describe, expect, it} from "vitest"
import {filterSecrets, flattenSecrets, loadSecrets} from "./secrets.ts"

describe("secrets", () => {
  describe("flattenSecrets", () => {
    it("flattens nested objects into uppercase underscore keys", () => {
      const input = {
        authelia: {
          jwt_secret: "supersecret",
          storage: {
            encryption_key: "storagekey",
          },
        },
        postgres: {
          password: "pgpassword",
          port: 5432,
          ssl: true,
        },
      }

      const flattened = flattenSecrets(input)

      expect(flattened).toEqual({
        AUTHELIA_JWT_SECRET: "supersecret",
        AUTHELIA_STORAGE_ENCRYPTION_KEY: "storagekey",
        POSTGRES_PASSWORD: "pgpassword",
        POSTGRES_PORT: "5432",
        POSTGRES_SSL: "true",
      })
    })

    it("ignores null and undefined", () => {
      const input = {
        valid: "yes",
        empty: null,
        missing: undefined,
      }

      const flattened = flattenSecrets(input)

      expect(flattened).toEqual({
        VALID: "yes",
      })
    })

    it("throws error for array values in secrets", () => {
      const input = {
        list: ["item1", "item2"],
      }

      expect(() => flattenSecrets(input)).toThrow(
        /Unsupported secret shape at 'list': arrays are not supported in secrets/,
      )
    })

    it("throws error when nested keys collide", () => {
      const input = {
        a_b: {
          c: "first",
        },
        a: {
          b_c: "second",
        },
      }

      expect(() => flattenSecrets(input)).toThrow(
        /Collision in secret keys: 'a_b.c' and 'a.b_c' both map to 'A_B_C'/,
      )
    })

    it("throws error when secret key produces invalid identifier", () => {
      const input = {
        "invalid-key": "value",
      }

      expect(() => flattenSecrets(input)).toThrow(
        /Invalid secret key name 'INVALID-KEY' at 'invalid-key'/,
      )
    })

    it("returns empty object for non-object inputs", () => {
      expect(flattenSecrets(null)).toEqual({})
      expect(flattenSecrets(undefined)).toEqual({})
      expect(flattenSecrets("string")).toEqual({})
      expect(flattenSecrets(123)).toEqual({})
    })
  })

  describe("filterSecrets", () => {
    const secrets = {
      DOCKER_HUB_USERNAME: "user",
      DOCKER_HUB_TOKEN: "token",
      ZONOMI_API_KEY: "zonomi",
      AUTHELIA_JWT_SECRET: "jwt",
    }

    it("filters keys using pipe separator", () => {
      const filtered = filterSecrets(
        secrets,
        "DOCKER_HUB_USERNAME|DOCKER_HUB_TOKEN",
      )
      expect(filtered).toEqual({
        DOCKER_HUB_USERNAME: "user",
        DOCKER_HUB_TOKEN: "token",
      })
    })

    it("filters keys using comma separator", () => {
      const filtered = filterSecrets(
        secrets,
        "DOCKER_HUB_USERNAME, DOCKER_HUB_TOKEN",
      )
      expect(filtered).toEqual({
        DOCKER_HUB_USERNAME: "user",
        DOCKER_HUB_TOKEN: "token",
      })
    })

    it("filters keys using array of strings", () => {
      const filtered = filterSecrets(secrets, [
        "DOCKER_HUB_USERNAME",
        "DOCKER_HUB_TOKEN",
      ])
      expect(filtered).toEqual({
        DOCKER_HUB_USERNAME: "user",
        DOCKER_HUB_TOKEN: "token",
      })
    })

    it("filters keys case-insensitively", () => {
      const filtered = filterSecrets(secrets, "zonomi_api_key")
      expect(filtered).toEqual({
        ZONOMI_API_KEY: "zonomi",
      })
    })
  })

  describe("loadSecrets", () => {
    it("decrypts YAML and flattens secrets", async () => {
      const encryptedFile = "/test/cluster/secrets.encrypted.yaml"

      const mockDecrypt = async (filePath: string) => {
        expect(filePath).toBe(encryptedFile)
        return `
authelia:
  jwt_secret: testjwtsecret
postgres:
  users:
    gitea: giteapass
`
      }

      const secrets = await loadSecrets({
        file: encryptedFile,
        filter: undefined,
        decrypt: mockDecrypt,
      })

      expect(secrets).toEqual({
        AUTHELIA_JWT_SECRET: "testjwtsecret",
        POSTGRES_USERS_GITEA: "giteapass",
      })
    })

    it("applies string filter to decrypted secrets", async () => {
      const encryptedFile = "/test/cluster/secrets.encrypted.yaml"

      const mockDecrypt = async () => `
zonomi_api_key: secretkey
docker_hub_token: dckrtoken
`

      const secrets = await loadSecrets({
        file: encryptedFile,
        filter: "ZONOMI_API_KEY",
        decrypt: mockDecrypt,
      })

      expect(secrets).toEqual({
        ZONOMI_API_KEY: "secretkey",
      })
    })

    it("applies array filter to decrypted secrets", async () => {
      const encryptedFile = "/test/cluster/secrets.encrypted.yaml"

      const mockDecrypt = async () => `
zonomi_api_key: secretkey
docker_hub_token: dckrtoken
other_key: other
`

      const secrets = await loadSecrets({
        file: encryptedFile,
        filter: ["zonomi_api_key", "docker_hub_token"],
        decrypt: mockDecrypt,
      })

      expect(secrets).toEqual({
        ZONOMI_API_KEY: "secretkey",
        DOCKER_HUB_TOKEN: "dckrtoken",
      })
    })
  })
})
