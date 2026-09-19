import path from "node:path"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {createTestComposeFile} from "../../testing/compose-fixture.ts"
import type {ExtHostnameConfig} from "../../types/docker-compose-extensions.ts"
import {resetFsAdaptor, setFsAdaptor} from "../file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../file-system/in-memory.fs-adaptor.ts"
import type {ProxyBinding} from "./haproxy-bindings.ts"
import {
  generateAuthFrontends,
  generateBackends,
  generateHaproxyConfig,
  generateTcpListen,
  generateUseBackends,
} from "./haproxy-generate.ts"

const grafana: ProxyBinding = {
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
}

const garage: ProxyBinding = {
  containerHostname: "garage",
  serviceName: "garage",
  httpBindings: {
    "garage-3900": {
      hostnames: [
        {
          name: "garage-s3.server.internal.example.com",
          auth: false,
          wss: false,
          proxyName: "internal",
        },
      ],
      externalPort: 443,
      containerPort: 3900,
    },
    "garage-3901": {
      hostnames: [
        {
          name: "garage-rpc.server.internal.example.com",
          auth: false,
          wss: false,
          proxyName: "internal",
        },
      ],
      externalPort: 443,
      containerPort: 3901,
    },
  },
  tcpBindings: {},
}

const postgres: ProxyBinding = {
  containerHostname: "postgres",
  serviceName: "postgres",
  httpBindings: {},
  tcpBindings: {
    "postgres-5432": {
      externalPort: 5432,
      containerPort: 5432,
      sendProxy: false,
      proxyName: "internal",
    },
  },
}

const gitea: ProxyBinding = {
  containerHostname: "gitea",
  serviceName: "gitea",
  httpBindings: {},
  tcpBindings: {
    "gitea-2222": {
      externalPort: 2222,
      containerPort: 2222,
      sendProxy: true,
      proxyName: "internal",
    },
  },
}

const openWebui: ProxyBinding = {
  containerHostname: "open-webui",
  serviceName: "open-webui",
  httpBindings: {
    "open-webui-8080": {
      hostnames: [
        {
          name: "chat.example.com",
          auth: true,
          wss: true,
          proxyName: "internal",
        },
      ],
      externalPort: 443,
      containerPort: 8080,
    },
  },
  tcpBindings: {},
}

const emptyBlocks = new Set<string>()

describe("generateUseBackends", () => {
  it("generates a single use_backend line for a simple application", () => {
    const result = generateUseBackends([grafana], "internal", emptyBlocks)
    expect(result).toBe(
      "    use_backend monitoring_grafana-3000 if { hdr(host) -i grafana.server.internal.example.com }",
    )
  })

  it("generates one use_backend line per external hostname", () => {
    const app: ProxyBinding = {
      containerHostname: "my_app",
      serviceName: "my-app",
      httpBindings: {
        "my_app-8080": {
          hostnames: [
            {
              name: "app.example.com",
              auth: false,
              wss: false,
              proxyName: "internal",
            },
            {
              name: "www.example.com",
              auth: false,
              wss: false,
              proxyName: "internal",
            },
          ],
          externalPort: 443,
          containerPort: 8080,
        },
      },
      tcpBindings: {},
    }
    const result = generateUseBackends([app], "internal", emptyBlocks)
    expect(result).toBe(
      [
        "    use_backend my_app-8080 if { hdr(host) -i app.example.com }",
        "",
        "    use_backend my_app-8080 if { hdr(host) -i www.example.com }",
      ].join("\n"),
    )
  })

  it("separates multiple applications and bindings with blank lines", () => {
    const result = generateUseBackends(
      [grafana, garage],
      "internal",
      emptyBlocks,
    )
    const lines = result.split("\n")
    expect(lines[0]).toBe(
      "    use_backend monitoring_grafana-3000 if { hdr(host) -i grafana.server.internal.example.com }",
    )
    expect(lines[1]).toBe("")
    expect(lines[2]).toBe(
      "    use_backend garage-3900 if { hdr(host) -i garage-s3.server.internal.example.com }",
    )
    expect(lines[3]).toBe("")
    expect(lines[4]).toBe(
      "    use_backend garage-3901 if { hdr(host) -i garage-rpc.server.internal.example.com }",
    )
  })

  it("returns an empty string for an empty application list", () => {
    expect(generateUseBackends([], "internal", emptyBlocks)).toBe("")
  })

  it("filters out applications attached to a different proxy", () => {
    const result = generateUseBackends([grafana], "public", emptyBlocks)
    expect(result).toBe("")
  })

  it("emits websocket rules before plain host rules and tunes a -wss backend", () => {
    const plain: ProxyBinding = {
      containerHostname: "plain",
      serviceName: "plain",
      httpBindings: {
        "plain-80": {
          hostnames: [
            {
              name: "plain.example.com",
              auth: false,
              wss: false,
              proxyName: "internal",
            },
          ],
          externalPort: 443,
          containerPort: 80,
        },
      },
      tcpBindings: {},
    }
    const use = generateUseBackends([openWebui, plain], "internal", emptyBlocks)
    const lines = use.split("\n\n")
    expect(lines[0]).toContain("use_backend open-webui-8080-wss")
    expect(lines[0]).toContain("websocket")
    expect(lines[1]).toContain(
      "use_backend open-webui-8080 if { hdr(host) -i chat.example.com }",
    )
    expect(lines[2]).toContain("plain.example.com")

    const backends = generateBackends([openWebui], "internal", emptyBlocks)
    expect(backends).toContain("backend open-webui-8080-wss")
    expect(backends).toContain("timeout tunnel 1h")
  })

  it("leaves blocks to the template when the backend section is authored there", () => {
    const result = generateUseBackends(
      [grafana],
      "internal",
      new Set(["backend monitoring_grafana-3000"]),
    )
    expect(result).toBe("")
  })
})

describe("generateTcpListen", () => {
  it("generates a tcp listen block for a simple application with tcp port", () => {
    const result = generateTcpListen([postgres], "internal", emptyBlocks)
    expect(result).toBe(
      [
        "listen postgres-5432",
        "    bind *:5432",
        "    mode tcp",
        "    option tcplog",
        "    balance leastconn",
        "    server postgres-5432 postgres:5432 resolvers dns_resolver",
      ].join("\n"),
    )
  })

  it("generates a tcp listen block with send-proxy enabled", () => {
    const result = generateTcpListen([gitea], "internal", emptyBlocks)
    expect(result).toBe(
      [
        "listen gitea-2222",
        "    bind *:2222",
        "    mode tcp",
        "    option tcplog",
        "    balance leastconn",
        "    server gitea-2222 gitea:2222 resolvers dns_resolver send-proxy",
      ].join("\n"),
    )
  })

  it("omits a tcp binding from non-target proxies", () => {
    expect(generateTcpListen([gitea], "public", emptyBlocks)).toBe("")
  })

  it("generates tcp listen blocks with custom externalPort", () => {
    const app: ProxyBinding = {
      containerHostname: "custom_app",
      serviceName: "custom-app",
      httpBindings: {},
      tcpBindings: {
        "custom_app-443": {
          externalPort: 8443,
          containerPort: 443,
          sendProxy: false,
          proxyName: "internal",
        },
      },
    }
    const result = generateTcpListen([app], "internal", emptyBlocks)
    expect(result).toBe(
      [
        "listen custom_app-443",
        "    bind *:8443",
        "    mode tcp",
        "    option tcplog",
        "    balance leastconn",
        "    server custom_app-443 custom_app:443 resolvers dns_resolver",
      ].join("\n"),
    )
  })

  it("returns an empty string for an empty application list or when no tcp ports are defined", () => {
    expect(generateTcpListen([], "internal", emptyBlocks)).toBe("")
    expect(generateTcpListen([grafana], "internal", emptyBlocks)).toBe("")
  })
})

describe("generateBackends", () => {
  it("generates a backend block for a simple application", () => {
    const result = generateBackends([grafana], "internal", emptyBlocks)
    expect(result).toBe(
      [
        "backend monitoring_grafana-3000",
        "    balance    roundrobin",
        "    server     monitoring_grafana-3000 monitoring_grafana:3000 resolvers dns_resolver",
      ].join("\n"),
    )
  })

  it("generates backend blocks for multi-port applications", () => {
    const result = generateBackends([garage], "internal", emptyBlocks)
    expect(result).toBe(
      [
        "backend garage-3900",
        "    balance    roundrobin",
        "    server     garage-3900 garage:3900 resolvers dns_resolver",
        "",
        "backend garage-3901",
        "    balance    roundrobin",
        "    server     garage-3901 garage:3901 resolvers dns_resolver",
      ].join("\n"),
    )
  })

  it("returns an empty string for an empty application list", () => {
    expect(generateBackends([], "internal", emptyBlocks)).toBe("")
  })
})

describe("generateAuthFrontends", () => {
  it("emits an acl and forward-auth intercept for auth-marked hostnames", () => {
    const result = generateAuthFrontends([openWebui], "internal")
    expect(result).toContain(
      "acl protected-frontends hdr(host) -i chat.example.com",
    )
    expect(result).toContain("lua.auth-intercept authelia")
    expect(result).toContain("http-request deny if protected-frontends")
  })

  it("returns an empty string when no hostnames are auth-marked", () => {
    expect(generateAuthFrontends([grafana], "internal")).toBe("")
  })
})

describe("generateHaproxyConfig", () => {
  let fsAdaptor: InMemoryFsAdaptor
  const appsDir = "/test/apps"
  const proxyDir = "/test/proxy"

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)
  })

  afterEach(() => {
    resetFsAdaptor()
  })

  it("generates haproxy.cfg by substituting template placeholders", async () => {
    await createTestComposeFile(path.join(appsDir, "grafana.yaml"), {
      services: {
        "monitoring-grafana": {
          image: "grafana/grafana:latest",
          hostname: "monitoring_grafana",
          "x-ext-hostnames": [
            {
              name: "grafana.example.com",
              "container-port": 3000,
              "proxy-name": "internal",
            },
          ],
          "x-ext-tcp-ports": [
            {
              "proxy-port": 5432,
              "container-port": 5432,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })

    await createTestComposeFile(path.join(appsDir, "haproxy.yaml"), {
      services: {
        "haproxy-internal": {
          image: "haproxy:3.4-alpine",
          hostname: "haproxy-internal",
        },
      },
    })

    await fsAdaptor.writeFile(
      path.join(proxyDir, "haproxy.cfg.template"),
      "{{TCP_LISTEN}}\n\nfrontend main\n{{FORWARD_AUTH_ACL}}\n{{USE_BACKENDS}}\n\n{{BACKENDS}}\n",
    )

    await generateHaproxyConfig(appsDir, {
      name: "internal",
      containerName: "internal",
      conf: proxyDir,
    })

    const generatedPath = path.join(proxyDir, "haproxy.cfg")
    expect(await fsAdaptor.exists(generatedPath)).toBe(true)
    const content = await fsAdaptor.readFile(generatedPath)
    expect(content).toContain("proxy: internal")
    expect(content).toContain("listen monitoring_grafana-5432")
    expect(content).toContain("bind *:5432")
    expect(content).toContain(
      "use_backend monitoring_grafana-3000 if { hdr(host) -i grafana.example.com }",
    )
    expect(content).toContain("backend monitoring_grafana-3000")
    expect(content).toContain(
      "server     monitoring_grafana-3000 monitoring_grafana:3000 resolvers dns_resolver",
    )
  })

  it("throws error when required placeholder is missing from template", async () => {
    await fsAdaptor.writeFile(
      path.join(proxyDir, "haproxy.cfg.template"),
      "{{USE_BACKENDS}}\n{{BACKENDS}}\n",
    )

    await expect(
      generateHaproxyConfig(appsDir, {
        name: "internal",
        containerName: "internal",
        conf: proxyDir,
      }),
    ).rejects.toThrow(/missing required placeholder '\{\{TCP_LISTEN\}\}'/)
  })

  it("throws error when placeholder is duplicated in template", async () => {
    await fsAdaptor.writeFile(
      path.join(proxyDir, "haproxy.cfg.template"),
      "{{TCP_LISTEN}}\n{{TCP_LISTEN}}\n{{USE_BACKENDS}}\n{{FORWARD_AUTH_ACL}}\n{{BACKENDS}}\n",
    )

    await expect(
      generateHaproxyConfig(appsDir, {
        name: "internal",
        containerName: "internal",
        conf: proxyDir,
      }),
    ).rejects.toThrow(/contains duplicate placeholder '\{\{TCP_LISTEN\}\}'/)
  })

  it("throws when a binding has no proxy mark and service has no x-ext-proxies", async () => {
    await createTestComposeFile(path.join(appsDir, "app.yaml"), {
      services: {
        web: {
          image: "nginx:latest",
          hostname: "web",
          "x-ext-hostnames": [
            {
              name: "app.example.com",
              "container-port": 80,
            } as unknown as ExtHostnameConfig,
          ],
        },
      },
    })

    await fsAdaptor.writeFile(
      path.join(proxyDir, "haproxy.cfg.template"),
      "{{USE_BACKENDS}}\n{{BACKENDS}}\n",
    )

    await expect(
      generateHaproxyConfig(appsDir, {
        name: "internal",
        containerName: "internal",
        conf: proxyDir,
      }),
    ).rejects.toThrow()
  })

  it("throws error when haproxy.cfg.template is missing", async () => {
    await expect(
      generateHaproxyConfig(appsDir, {
        name: "internal",
        containerName: "internal",
        conf: proxyDir,
      }),
    ).rejects.toThrow(/Template file not found/)
  })
})
