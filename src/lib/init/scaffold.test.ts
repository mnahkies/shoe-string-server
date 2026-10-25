import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {loadClusterConfigFile, resolveConfig} from "../../config.ts"
import {loadComposeFile} from "../../lib/compose-files/compose-files.ts"
import {resetFsAdaptor, setFsAdaptor} from "../../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../../lib/file-system/in-memory.fs-adaptor.ts"
import type {HaproxyInput} from "../../registry/applications/haproxy.ts"
import {helloWorld as helloWorldApplication} from "../../registry/applications/hello-world.ts"
import {
  type InitAnswers,
  renderClusterYaml,
  validateAnswers,
  validateProxies,
  writeCluster,
} from "./scaffold.ts"

describe("init cluster scaffold", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const rootConfDir = "/test/cluster"

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  const publicProxy: HaproxyInput = {
    name: "public",
    containerName: "haproxy-public",
    confDir: "./conf/haproxy/public",
    ports: [
      {ip: "203.0.113.7", hostPort: 80, containerPort: 80},
      {ip: "203.0.113.7", hostPort: 443, containerPort: 443},
    ],
    networkName: "public",
    externalHostnames: ["example.com"],
    staticDirectory: false,
  }

  const internalProxy: HaproxyInput = {
    name: "internal",
    containerName: "haproxy-internal",
    confDir: "./conf/haproxy/internal",
    ports: [
      {ip: "100.64.0.9", hostPort: 8080, containerPort: 80},
      {ip: "100.64.0.9", hostPort: 8443, containerPort: 443},
    ],
    networkName: "internal",
    externalHostnames: [],
    staticDirectory: true,
  }

  const helloWorldInputs = {
    name: "hello-world",
    proxyName: "public",
    networkName: "public",
    externalHostname: "hello.public",
  }

  const twoProxyAnswers: InitAnswers = {
    appsDir: "applications",
    proxies: [publicProxy, internalProxy],
    applications: [
      {application: helloWorldApplication, inputs: helloWorldInputs},
    ],
  }

  describe("renderClusterYaml", () => {
    it("renders yaml that parses back into the cluster config schema", async () => {
      fsAdaptor = new InMemoryFsAdaptor({
        "/test/cluster/cluster.yaml": renderClusterYaml(twoProxyAnswers),
      })
      setFsAdaptor(fsAdaptor)

      const config = await loadClusterConfigFile("/test/cluster")
      expect(config.appsDir).toBe("applications")
      expect(config.environment).toEqual({})
    })
  })

  describe("validateProxies", () => {
    it("rejects duplicate proxy names, container names, and conf dirs", () => {
      expect(() => validateProxies(twoProxyAnswers.proxies)).not.toThrow()

      expect(() =>
        validateProxies([publicProxy, {...internalProxy, name: "public"}]),
      ).toThrow("duplicate proxy name: 'public'")

      expect(() =>
        validateProxies([
          publicProxy,
          {...internalProxy, containerName: "haproxy-public"},
        ]),
      ).toThrow("duplicate proxy containerName: 'haproxy-public'")

      expect(() =>
        validateProxies([
          publicProxy,
          {...internalProxy, confDir: "./conf/haproxy/public"},
        ]),
      ).toThrow("duplicate proxy confDir: './conf/haproxy/public'")
    })
  })

  describe("validateAnswers", () => {
    it("rejects apps that reference unknown proxies and duplicate app names", () => {
      expect(() => validateAnswers(twoProxyAnswers)).not.toThrow()

      expect(() =>
        validateAnswers({
          ...twoProxyAnswers,
          applications: [
            {
              application: helloWorldApplication,
              inputs: {...helloWorldInputs, proxyName: "missing"},
            },
          ],
        }),
      ).toThrow("hello-world references unknown proxy: 'missing'")

      expect(() =>
        validateAnswers({
          ...twoProxyAnswers,
          applications: [
            ...twoProxyAnswers.applications,
            ...twoProxyAnswers.applications,
          ],
        }),
      ).toThrow("duplicate application name: 'hello-world'")
    })
  })

  describe("writeCluster", () => {
    it("creates the cluster files under the configured data directory", async () => {
      const created = await writeCluster(rootConfDir, twoProxyAnswers)

      expect(created).toEqual([
        "/test/cluster/cluster.yaml",
        "/test/cluster/applications/public.yaml",
        "/test/cluster/conf/haproxy/public/haproxy.cfg.template",
        "/test/cluster/applications/internal.yaml",
        "/test/cluster/conf/haproxy/internal/haproxy.cfg.template",
        "/test/cluster/conf/haproxy/internal/directory.html",
        "/test/cluster/applications/hello-world.yaml",
      ])

      for (const dir of [
        "/test/cluster/data",
        "/test/cluster/conf",
        "/test/cluster/applications",
      ]) {
        expect(await fsAdaptor.exists(dir)).toBe(true)
      }

      expect(
        await fsAdaptor.readFile("/test/cluster/applications/public.yaml"),
      ).toContain("x-ext-proxy:")
      expect(
        await fsAdaptor.readFile(
          "/test/cluster/conf/haproxy/public/haproxy.cfg.template",
        ),
      ).toContain("frontend public")
    })

    it("renders a proxy compose file that loads against the compose schema", async () => {
      await writeCluster(rootConfDir, twoProxyAnswers)

      const spec = await loadComposeFile(
        "/test/cluster/applications/public.yaml",
      )
      expect(spec.name).toBe("public")
      const service = spec.services?.["public"]
      expect(service).toBeDefined()
      expect(service?.["x-ext-proxy"]).toEqual({
        name: "public",
        confDir: `$\{DATA_BASE_PATH}/conf/haproxy/public`,
      })
      expect(service?.networks).toEqual(["public"])
      expect(service?.ports).toEqual([
        "203.0.113.7:80:80",
        "203.0.113.7:443:443",
      ])

      expect(service?.volumes?.[0]).toMatchObject({
        source: `$\{DATA_BASE_PATH}/conf/haproxy/public`,
      })
    })

    it("binds configurable host ports to the fixed container ports 80/443", async () => {
      await writeCluster(rootConfDir, twoProxyAnswers)

      const internal = await loadComposeFile(
        "/test/cluster/applications/internal.yaml",
      )
      expect(internal.services?.["internal"]?.ports).toEqual([
        "100.64.0.9:8080:80",
        "100.64.0.9:8443:443",
      ])

      const publicTemplate = await fsAdaptor.readFile(
        "/test/cluster/conf/haproxy/public/haproxy.cfg.template",
      )
      const internalTemplate = await fsAdaptor.readFile(
        "/test/cluster/conf/haproxy/internal/haproxy.cfg.template",
      )
      expect(publicTemplate).not.toContain("use_backend directory")
      expect(internalTemplate).toContain("use_backend directory")
      expect(
        await fsAdaptor.exists(
          "/test/cluster/conf/haproxy/public/directory.html",
        ),
      ).toBe(false)
      expect(
        await fsAdaptor.readFile(
          "/test/cluster/conf/haproxy/internal/directory.html",
        ),
      ).toContain("service directory")
    })

    it("produces a cluster the existing config resolution accepts", async () => {
      // secrets setup is out of scope for init, but resolution requires the file
      fsAdaptor = new InMemoryFsAdaptor({
        "/test/cluster/secrets.encrypted.yaml": "",
      })
      setFsAdaptor(fsAdaptor)

      await writeCluster(rootConfDir, twoProxyAnswers)

      const config = await resolveConfig({
        dataDir: rootConfDir,
        secretsFile: undefined,
      })
      expect(config.rootConfDir).toBe(rootConfDir)
      expect(config.appsDir).toBe(`${rootConfDir}/applications`)
    })
  })
})
