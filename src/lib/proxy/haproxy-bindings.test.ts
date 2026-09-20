import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import type {ExtHostnameConfig} from "../../types/docker-compose-extensions.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import {discoverProxies, getHaproxyBindings} from "./haproxy-bindings.ts"

describe("discoverProxies", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const dir = "/test/apps"

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("discovers services marked with x-ext-proxy", async () => {
    await createTestComposeFile(path.join(dir, "haproxy-internal.yaml"), {
      services: {
        "haproxy-internal": {
          image: "haproxy:3.4.4-alpine",
          hostname: "haproxy-internal",
          container_name: "haproxy-internal",
          "x-ext-proxy": {
            name: "internal",
          },
        },
      },
    })

    const proxies = await discoverProxies(dir)

    expect(proxies).toEqual([
      {
        name: "internal",
        containerName: "haproxy-internal",
        appsFile: path.join(dir, "haproxy-internal.yaml"),
        serviceName: "haproxy-internal",
      },
    ])
  })

  it("ignores services without x-ext-proxy even with haproxy image", async () => {
    await createTestComposeFile(path.join(dir, "haproxy-internal.yaml"), {
      services: {
        "haproxy-internal": {
          image: "haproxy:3.4.4-alpine",
          hostname: "haproxy-internal",
          container_name: "haproxy-internal",
        },
      },
    })

    const proxies = await discoverProxies(dir)

    expect(proxies).toEqual([])
  })

  it("throws error when container_name is missing on service with x-ext-proxy", async () => {
    await createTestComposeFile(path.join(dir, "edge.yaml"), {
      services: {
        edge: {
          hostname: "edge",
          "x-ext-proxy": {
            name: "edge",
          },
        },
      },
    })

    await expect(discoverProxies(dir)).rejects.toThrow(
      /Invalid x-ext-proxy configuration for service edge/,
    )
  })

  it("throws error when x-ext-proxy mark is invalid", async () => {
    await createTestComposeFile(path.join(dir, "edge.yaml"), {
      services: {
        edge: {
          container_name: "haproxy-edge",
          // @ts-expect-error invalid input test
          "x-ext-proxy": {},
        },
      },
    })

    await expect(discoverProxies(dir)).rejects.toThrow()
  })

  it("throws error on duplicate proxy names", async () => {
    await createTestComposeFile(path.join(dir, "proxy1.yaml"), {
      services: {
        proxy1: {
          container_name: "haproxy1",
          "x-ext-proxy": {name: "public"},
        },
      },
    })
    await createTestComposeFile(path.join(dir, "proxy2.yaml"), {
      services: {
        proxy2: {
          container_name: "haproxy2",
          "x-ext-proxy": {name: "public"},
        },
      },
    })

    await expect(discoverProxies(dir)).rejects.toThrow(
      /Duplicate proxy name 'public'/,
    )
  })

  it("throws error on duplicate container names", async () => {
    await createTestComposeFile(path.join(dir, "proxy1.yaml"), {
      services: {
        proxy1: {
          container_name: "shared-name",
          "x-ext-proxy": {name: "proxy1"},
        },
      },
    })
    await createTestComposeFile(path.join(dir, "proxy2.yaml"), {
      services: {
        proxy2: {
          container_name: "shared-name",
          "x-ext-proxy": {name: "proxy2"},
        },
      },
    })

    await expect(discoverProxies(dir)).rejects.toThrow(
      /Duplicate container name 'shared-name'/,
    )
  })
})

describe("getHaproxyBindings", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const dir = "/test/apps"

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("parses a single service with a single hostname/port", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        "monitoring-grafana": {
          hostname: "monitoring_grafana",
          "x-ext-hostnames": [
            {
              name: "grafana.server.internal.example.com",
              "container-port": 3000,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    const {bindings} = await getHaproxyBindings(dir)

    expect(bindings).toEqual([
      {
        containerHostname: "monitoring_grafana",
        serviceName: "monitoring-grafana",
        httpBindings: {
          "monitoring_grafana-3000": {
            hostnames: [
              {
                name: "grafana.server.internal.example.com",
                auth: false,
                wss: false,
                proxyName: "internal",
              },
            ],
            externalPort: 443,
            containerPort: 3000,
          },
        },
        tcpBindings: {},
      },
    ])
  })

  it("parses multiple hostnames with per-hostname proxy marks", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        web: {
          hostname: "web",
          "x-ext-hostnames": [
            {
              name: "example.com",
              "proxy-name": "public",
              "container-port": 80,
            },
            {
              name: "web.internal.example.com",
              "proxy-name": "internal",
              "container-port": 80,
            },
          ],
        },
      },
    })

    const {bindings} = await getHaproxyBindings(dir)

    expect(bindings[0]?.httpBindings["web-80"]?.hostnames).toEqual([
      {name: "example.com", auth: false, wss: false, proxyName: "public"},
      {
        name: "web.internal.example.com",
        auth: false,
        wss: false,
        proxyName: "internal",
      },
    ])
  })

  it("parses auth and wss hostname marks", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        chat: {
          hostname: "chat",
          "x-ext-hostnames": [
            {
              name: "chat.server.internal.example.com",
              "container-port": 8080,
              auth: true,
              wss: true,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    const {bindings} = await getHaproxyBindings(dir)

    expect(bindings[0]?.httpBindings["chat-8080"]?.hostnames).toEqual([
      {
        name: "chat.server.internal.example.com",
        auth: true,
        wss: true,
        proxyName: "internal",
      },
    ])
  })

  it("parses a service with multiple container ports into externalHostnames", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        garage: {
          hostname: "garage",
          "x-ext-hostnames": [
            {
              name: "garage-s3.server.internal.example.com",
              "container-port": 3900,
              "proxy-name": "internal",
            },
            {
              name: "garage-rpc.server.internal.example.com",
              "container-port": 3901,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    const {bindings} = await getHaproxyBindings(dir)

    expect(Object.keys(bindings[0]?.httpBindings ?? {}).sort()).toEqual([
      "garage-3900",
      "garage-3901",
    ])
  })

  it("ignores services without x-ext-hostnames", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        "internal-db": {
          hostname: "db",
        },
      },
    })

    const {bindings} = await getHaproxyBindings(dir)
    expect(bindings).toEqual([])
  })

  it("throws error when hostname is not set on a service with x-ext-hostnames", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        "my-service": {
          "x-ext-hostnames": [
            {
              name: "app.example.com",
              "container-port": 8080,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    await expect(getHaproxyBindings(dir)).rejects.toThrow(
      /missing hostname on service 'my-service'/,
    )
  })

  it("throws error when bindings declare no proxy at all", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        "my-service": {
          hostname: "my-service",
          "x-ext-hostnames": [
            {
              name: "app.example.com",
              "container-port": 8080,
            } as unknown as ExtHostnameConfig,
          ],
        },
      },
    })

    await expect(getHaproxyBindings(dir)).rejects.toThrow()
  })

  it("parses a service with x-ext-tcp-ports", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        postgres: {
          hostname: "postgres",
          "x-ext-tcp-ports": [
            {
              "proxy-port": 5432,
              "container-port": 5432,
              "send-proxy": false,
              "proxy-name": "internal",
            },
            {
              "proxy-port": 2222,
              "container-port": 22,
              "send-proxy": true,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    const {bindings} = await getHaproxyBindings(dir)

    expect(bindings[0]?.tcpBindings).toEqual({
      "postgres-5432": {
        externalPort: 5432,
        containerPort: 5432,
        sendProxy: false,
        proxyName: "internal",
      },
      "postgres-22": {
        externalPort: 2222,
        containerPort: 22,
        sendProxy: true,
        proxyName: "internal",
      },
    })
  })

  it("throws error on duplicate TCP binding on the same service", async () => {
    await createTestComposeFile(path.join(dir, "test-app.yaml"), {
      services: {
        postgres: {
          hostname: "postgres",
          "x-ext-tcp-ports": [
            {
              "proxy-port": 5432,
              "container-port": 5432,
              "proxy-name": "internal",
            },
            {
              "proxy-port": 5433,
              "container-port": 5432,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    await expect(getHaproxyBindings(dir)).rejects.toThrow(
      /Duplicate TCP binding for 'postgres-5432'/,
    )
  })

  it("throws error when multiple TCP bindings claim the same external port on the same proxy", async () => {
    await createTestComposeFile(path.join(dir, "app1.yaml"), {
      services: {
        service1: {
          hostname: "service1",
          "x-ext-tcp-ports": [
            {
              "proxy-port": 9000,
              "container-port": 9000,
              "proxy-name": "public",
            },
          ],
        },
      },
    })
    await createTestComposeFile(path.join(dir, "app2.yaml"), {
      services: {
        service2: {
          hostname: "service2",
          "x-ext-tcp-ports": [
            {
              "proxy-port": 9000,
              "container-port": 9001,
              "proxy-name": "public",
            },
          ],
        },
      },
    })

    await expect(getHaproxyBindings(dir)).rejects.toThrow(
      /Port conflict: external port 9000 on proxy 'public' is claimed by multiple TCP bindings/,
    )
  })

  it("throws error on conflicting hostname routes on same proxy and port", async () => {
    await createTestComposeFile(path.join(dir, "app1.yaml"), {
      services: {
        web1: {
          hostname: "web1",
          "x-ext-hostnames": [
            {
              name: "app.example.com",
              "container-port": 80,
              "proxy-name": "public",
              "proxy-port": 443,
            },
          ],
        },
      },
    })
    await createTestComposeFile(path.join(dir, "app2.yaml"), {
      services: {
        web2: {
          hostname: "web2",
          "x-ext-hostnames": [
            {
              name: "app.example.com",
              "container-port": 8080,
              "proxy-name": "public",
              "proxy-port": 443,
            },
          ],
        },
      },
    })

    await expect(getHaproxyBindings(dir)).rejects.toThrow(
      /Conflicting route for hostname 'app.example.com' on port 443 of proxy 'public'/,
    )
  })

  it("throws error for invalid DNS hostname format", async () => {
    await createTestComposeFile(path.join(dir, "app.yaml"), {
      services: {
        web: {
          hostname: "web",
          "x-ext-hostnames": [
            {
              name: "invalid hostname with spaces",
              "container-port": 80,
              "proxy-name": "public",
            },
          ],
        },
      },
    })

    await expect(getHaproxyBindings(dir)).rejects.toThrow(
      /Invalid hostname 'invalid hostname with spaces'/,
    )
  })

  it("returns empty array if directory does not exist", async () => {
    const {bindings, proxies} = await getHaproxyBindings(
      "/non/existent/path/that/should/never/exist",
    )
    expect(bindings).toEqual([])
    expect(proxies).toEqual([])
  })
})
