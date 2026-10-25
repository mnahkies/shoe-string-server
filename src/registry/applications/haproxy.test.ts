import {load as loadYaml} from "js-yaml"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {
  createPromptIo,
  type PromptTestIo,
} from "../../tui/clack.prompts.test-harness.ts"
import {resetPromptIo, setPromptIo} from "../../tui/clack.prompts.ts"
import {applicationRegistry} from "../application-registry.ts"
import {haproxy} from "./haproxy.ts"

// biome-ignore lint/suspicious/noTemplateCurlyInString: Compose interpolation placeholder
const DATA_BASE_PATH = "${DATA_BASE_PATH}"

describe("registry/applications/haproxy", () => {
  it("generates an attached and discoverable proxy service", () => {
    const inputs = haproxy.inputs.parse({
      name: "internal",
      containerName: "haproxy-internal",
      networkName: "mesh-net",
      confDir: "./conf/haproxy/internal",
      externalHostnames: [],
      ports: [
        {ip: "192.168.1.1", hostPort: 8080, containerPort: 80},
        {ip: "192.168.1.2", hostPort: 8443, containerPort: 443},
      ],
    })

    const actual = loadYaml(
      applicationRegistry.renderApplicationCompose(haproxy, inputs),
    )

    expect(actual).toMatchObject({
      name: "internal",
      networks: {"mesh-net": {name: "mesh-net", external: true}},
      services: {
        internal: {
          container_name: "haproxy-internal",
          networks: ["mesh-net"],
          "x-ext-proxy": {name: "internal"},
          ports: ["192.168.1.1:8080:80", "192.168.1.2:8443:443"],
          volumes: [
            {
              source: `${DATA_BASE_PATH}/conf/haproxy/internal`,
              target: "/usr/local/etc/haproxy",
            },
            {
              source: `${DATA_BASE_PATH}/data/lego/certificates/example.com.crt`,
              target: "/etc/haproxy/ssl/certs/example.com.crt",
            },
            {
              source: `${DATA_BASE_PATH}/data/lego/certificates/example.com.key`,
              target: "/etc/haproxy/ssl/certs/example.com.key",
            },
          ],
        },
      },
    })
  })
})

const installWizard = haproxy.installWizard
if (!installWizard) {
  throw new Error("haproxy must define an install wizard")
}

describe("haproxy install wizard", () => {
  let io: PromptTestIo

  beforeEach(() => {
    io = createPromptIo()
    setPromptIo(io)
  })

  afterEach(() => {
    resetPromptIo()
    vi.restoreAllMocks()
  })

  async function step(
    prompt: string,
    send: (io: PromptTestIo) => void,
  ): Promise<void> {
    await io.waitForPrompt(prompt)
    send(io)
  }

  it("accepts defaults for everything but the name", async () => {
    const wizard = installWizard.wizard.run({
      proxies: [],
      detectPublicIp: async () => "203.0.113.7",
      detectPrivateIp: async () => "100.64.0.9",
    })

    await step("Select proxy kind", (io) => io.pressEnter())
    await step("public proxy name", (io) => io.pressEnter())
    await step("Add hostnames?", (io) => io.type("n"))
    await step("Use defaults for the haproxy-public proxy", (io) =>
      io.pressEnter(),
    )

    await expect(wizard).resolves.toEqual({
      name: "haproxy-public",
      containerName: "haproxy-public",
      confDir: "./conf/haproxy-public",
      networkName: "haproxy-public",
      externalHostnames: [],
      staticDirectory: false,
      ports: [
        {ip: "203.0.113.7", hostPort: 80, containerPort: 80},
        {ip: "203.0.113.7", hostPort: 443, containerPort: 443},
      ],
    })
    expect(io.frames()).not.toContain("static directory page")
  })

  it("collects typed values when defaults are declined", async () => {
    const wizard = installWizard.wizard.run({
      proxies: [],
      detectPublicIp: async () => "203.0.113.7",
      detectPrivateIp: async () => "100.64.0.9",
    })

    await step("Select proxy kind", (io) => io.pressEnter())
    await step("public proxy name", (io) => {
      io.type("edge")
      io.pressEnter()
    })
    await step("Add hostnames?", (io) => io.type("n"))
    await step("Use defaults for the edge proxy", (io) => {
      io.type("n")
      io.pressEnter()
    })
    await step("edge proxy container name", (io) => io.pressEnter())
    await step("edge proxy network name", (io) => io.pressEnter())
    await step("edge proxy conf directory", (io) => io.pressEnter())
    await step("edge HTTP port", (io) => io.pressEnter())
    await step("edge HTTPS port", (io) => {
      io.type("8443")
      io.pressEnter()
    })
    await step("edge IP address", (io) => io.pressEnter())
    await step("Serve a static directory page", (io) => {
      io.type("y")
      io.pressEnter()
    })

    await expect(wizard).resolves.toEqual({
      name: "edge",
      containerName: "haproxy-edge",
      confDir: "./conf/haproxy-edge",
      networkName: "edge",
      externalHostnames: [],
      staticDirectory: true,
      ports: [
        {ip: "203.0.113.7", hostPort: 80, containerPort: 80},
        {ip: "203.0.113.7", hostPort: 8443, containerPort: 443},
      ],
    })
  })

  it("prompts every setting when no ip was detected", async () => {
    const wizard = installWizard.wizard.run({
      proxies: [],
      detectPublicIp: async () => undefined,
      detectPrivateIp: async () => undefined,
    })

    await step("Select proxy kind", (io) => {
      io.type("internal")
      io.pressEnter()
    })
    await step("internal proxy name", (io) => io.pressEnter())
    await step("Add hostnames?", (io) => io.type("n"))
    // there is no default ip to accept, so the defaults shortcut is skipped
    expect(io.frames()).not.toContain("Use defaults for")
    await step("haproxy-internal proxy container name", (io) => io.pressEnter())
    await step("haproxy-internal proxy network name", (io) => io.pressEnter())
    await step("haproxy-internal proxy conf directory", (io) => io.pressEnter())
    await step("haproxy-internal HTTP port", (io) => io.pressEnter())
    await step("haproxy-internal HTTPS port", (io) => io.pressEnter())
    // the ip is required: an empty submit re-renders the prompt for correction
    await step("haproxy-internal IP address", (io) => io.pressEnter())
    await vi.waitFor(() =>
      expect(io.frames()).toContain("must be a valid IPv4 address"),
    )
    await step("haproxy-internal IP address", (io) => {
      io.type("100.64.0.9")
      io.pressEnter()
    })
    await step("Serve a static directory page", (io) => {
      io.type("n")
      io.pressEnter()
    })

    await expect(wizard).resolves.toEqual({
      name: "haproxy-internal",
      containerName: "haproxy-haproxy-internal",
      confDir: "./conf/haproxy-haproxy-internal",
      networkName: "haproxy-internal",
      externalHostnames: [],
      staticDirectory: false,
      ports: [
        {ip: "100.64.0.9", hostPort: 80, containerPort: 80},
        {ip: "100.64.0.9", hostPort: 443, containerPort: 443},
      ],
    })
    expect(io.frames()).toContain(
      "auto-detection failed, please enter manually",
    )
  })

  it("collects external hostnames when provided", async () => {
    const wizard = installWizard.wizard.run({
      proxies: [],
      detectPublicIp: async () => "203.0.113.7",
      detectPrivateIp: async () => "100.64.0.9",
    })

    await step("Select proxy kind", (io) => io.pressEnter())
    await step("public proxy name", (io) => io.pressEnter())
    await step("Add hostnames?", (io) => io.type("y"))
    await step("Hostname", (io) => {
      io.type("example.com")
      io.pressEnter()
    })
    await step("Add another?", (io) => io.type("n"))
    await step("Use defaults for the haproxy-public proxy", (io) =>
      io.pressEnter(),
    )

    await expect(wizard).resolves.toEqual({
      name: "haproxy-public",
      containerName: "haproxy-public",
      confDir: "./conf/haproxy-public",
      networkName: "haproxy-public",
      externalHostnames: ["example.com"],
      staticDirectory: false,
      ports: [
        {ip: "203.0.113.7", hostPort: 80, containerPort: 80},
        {ip: "203.0.113.7", hostPort: 443, containerPort: 443},
      ],
    })
  })

  it("rejects a name that is already taken", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0)")
    })
    const wizard = installWizard.wizard.run({
      proxies: [{name: "public", externalHostnames: [], networkName: "public"}],
      detectPublicIp: async () => "203.0.113.7",
      detectPrivateIp: async () => "100.64.0.9",
    })

    await step("Select proxy kind", (io) => io.pressEnter())
    await step("public proxy name", (io) => {
      io.type("public")
      io.pressEnter()
    })
    await vi.waitFor(() =>
      expect(io.frames()).toContain("a proxy with this name already exists"),
    )
    // the prompt stays open for correction; escape cancels out of the screen
    await step("public proxy name", (io) => io.pressEscape())

    await expect(wizard).rejects.toThrow("process.exit(0)")
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it("surfaces validation errors from the port schema", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0)")
    })
    const wizard = installWizard.wizard.run({
      proxies: [],
      detectPublicIp: async () => "203.0.113.7",
      detectPrivateIp: async () => "100.64.0.9",
    })

    await step("Select proxy kind", (io) => io.pressEnter())
    await step("public proxy name", (io) => io.pressEnter())
    await step("Add hostnames?", (io) => io.type("n"))
    await step("Use defaults for the haproxy-public proxy", (io) => {
      io.type("n")
      io.pressEnter()
    })
    await step("haproxy-public proxy container name", (io) => io.pressEnter())
    await step("haproxy-public proxy network name", (io) => io.pressEnter())
    await step("haproxy-public proxy conf directory", (io) => io.pressEnter())
    await step("haproxy-public HTTP port", (io) => io.pressEnter())
    await step("haproxy-public HTTPS port", (io) => {
      io.type("99999")
      io.pressEnter()
    })
    await vi.waitFor(() =>
      expect(io.frames()).toContain(
        "must be a port number between 1 and 65535",
      ),
    )
    // the prompt stays open for correction; cancelling from here exits cleanly
    await step("haproxy-public HTTPS port", (io) => io.pressEscape())

    await expect(wizard).rejects.toThrow("process.exit(0)")
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
