import {load} from "js-yaml"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import type {ExtendedComposeSpecification} from "../types/docker-compose-extensions.ts"
import {
  createTestComposeFile,
  createTestComposeSpec,
  createTestService,
} from "./compose-fixture.ts"

describe("compose-fixture", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  describe("createTestComposeSpec", () => {
    it("returns default spec with minimal app service", () => {
      const spec = createTestComposeSpec()
      expect(spec).toEqual({
        services: {
          app: {
            image: "test:latest",
          },
        },
      })
    })

    it("allows overriding specific fields while retaining defaults", () => {
      const spec = createTestComposeSpec({
        networks: {
          internal: {
            external: true,
          },
        },
      })
      expect(spec).toEqual({
        services: {
          app: {
            image: "test:latest",
          },
        },
        networks: {
          internal: {
            external: true,
          },
        },
      })
    })

    it("allows overriding services", () => {
      const spec = createTestComposeSpec({
        services: {
          custom: {
            image: "custom:1.0",
            hostname: "custom-host",
          },
        },
      })
      expect(spec.services?.custom?.image).toBe("custom:1.0")
      expect(spec.services?.custom?.hostname).toBe("custom-host")
      expect(spec.services?.app).toBeUndefined()
    })
  })

  describe("createTestService", () => {
    it("returns default service with test:latest image", () => {
      const service = createTestService()
      expect(service).toEqual({image: "test:latest"})
    })

    it("applies overrides to service", () => {
      const service = createTestService({
        hostname: "my-service",
        container_name: "my-container",
      })
      expect(service.image).toBe("test:latest")
      expect(service.hostname).toBe("my-service")
      expect(service.container_name).toBe("my-container")
    })
  })

  describe("createTestComposeFile", () => {
    it("writes serialized compose YAML to in-memory filesystem", async () => {
      const filePath = "/test/apps/app.yaml"
      const resultPath = await createTestComposeFile(filePath, {
        networks: {
          postgres: {external: true},
        },
      })

      expect(resultPath).toBe(filePath)
      expect(await fsAdaptor.exists(filePath)).toBe(true)

      const content = await fsAdaptor.readFile(filePath)
      const parsed = load(content) as ExtendedComposeSpecification
      expect(parsed.networks?.postgres).toBeDefined()
      expect(parsed.services?.app?.image).toBe("test:latest")
    })
  })
})
