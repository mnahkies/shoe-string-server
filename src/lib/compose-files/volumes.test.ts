import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import type {ExtendedService} from "../../types/docker-compose-extensions.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {
  ensureDataDirectories,
  getConfVolumes,
  getDataVolumes,
  resolveVolumeSource,
} from "./volumes.ts"

describe("volumes", () => {
  let fsAdaptor: InMemoryFsAdaptor

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  describe("getDataVolumes", () => {
    it("filters and returns data volumes", () => {
      const service: ExtendedService = {
        image: "test:latest",
        volumes: [
          {
            type: "bind",
            source: "${" + "DATA_BASE_PATH}/data/app",
            target: "/data",
          },
          {
            type: "bind",
            source: "${" + "DATA_BASE_PATH}/conf/app",
            target: "/etc/app",
          },
          {type: "bind", source: "/host/path", target: "/container/path"},
        ],
      }

      const volumes = getDataVolumes(service)
      expect(volumes).toEqual([
        {
          type: "bind",
          source: "${" + "DATA_BASE_PATH}/data/app",
          target: "/data",
        },
      ])
    })
  })

  describe("getConfVolumes", () => {
    it("filters and returns conf volumes", () => {
      const service: ExtendedService = {
        image: "test:latest",
        volumes: [
          {
            type: "bind",
            source: "${" + "DATA_BASE_PATH}/data/app",
            target: "/data",
          },
          {
            type: "bind",
            source: "${" + "DATA_BASE_PATH}/conf/app/config.json",
            target: "/etc/app/config.json",
          },
          {type: "bind", source: "/host/path", target: "/container/path"},
        ],
      }

      const volumes = getConfVolumes(service)
      expect(volumes).toEqual([
        {
          type: "bind",
          source: "${" + "DATA_BASE_PATH}/conf/app/config.json",
          target: "/etc/app/config.json",
        },
      ])
    })
  })

  describe("resolveVolumeSource", () => {
    it("replaces DATA_BASE_PATH placeholder with rootConfDir", () => {
      const volume = {
        source: "${" + "DATA_BASE_PATH}/data/db",
        target: "/var/lib/db",
      }
      expect(resolveVolumeSource(volume, "/opt/cluster")).toBe(
        "/opt/cluster/data/db",
      )
    })
  })

  describe("ensureDataDirectories", () => {
    it("creates missing directories on filesystem", async () => {
      const rootDir = "/test/cluster"
      const composeFile = await createTestComposeFile(
        path.join(rootDir, "app.yaml"),
        {
          services: {
            db: {
              image: "postgres",
              volumes: [
                {
                  type: "bind",
                  source: "${" + "DATA_BASE_PATH}/data/db/data",
                  target: "/var/lib/postgresql/data",
                },
              ],
            },
          },
        },
      )

      await ensureDataDirectories(rootDir, composeFile)
      expect(
        await fsAdaptor.exists(path.join(rootDir, "data", "db", "data")),
      ).toBe(true)
    })
  })
})
