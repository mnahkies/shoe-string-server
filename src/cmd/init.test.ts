import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {z} from "zod"
import {loadClusterConfigFile} from "../config.ts"
import {resetFsAdaptor, setFsAdaptor} from "../lib/file-system/fs-adaptor.ts"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import type {ApplicationWizardContext} from "../registry/application-registry.ts"
import {ApplicationRegistry} from "../registry/application-registry.ts"
import {
  createPromptIo,
  type PromptTestIo,
} from "../tui/clack.prompts.test-harness.ts"
import {p, resetPromptIo, setPromptIo} from "../tui/clack.prompts.ts"
import {wizard as defineWizard} from "../tui/wizard.ts"
import {action, runWizard, type WizardDeps} from "./init.ts"

const rootConfDir = "/test/cluster"

function startWizard(options: WizardDeps = {}) {
  return runWizard({
    detectPublicIp: async () => "203.0.113.7",
    detectPrivateIp: async () => "100.64.0.9",
    ...options,
  })
}

async function step(
  io: PromptTestIo,
  prompt: string,
  send: (io: PromptTestIo) => void,
): Promise<void> {
  await io.waitForPrompt(prompt)
  send(io)
}

describe("init wizard", () => {
  let fsAdaptor: InMemoryFsAdaptor
  let io: PromptTestIo
  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)

    io = createPromptIo()
    setPromptIo(io)
  })

  afterEach(() => {
    resetFsAdaptor()
    resetPromptIo()
    vi.restoreAllMocks()
  })

  it("collects both proxies and hello-world through typed wizards", async () => {
    const wizard = startWizard()

    await step(io, "Applications directory", (io) => io.pressEnter())

    await step(io, "Add Proxy?", (io) => io.pressEnter())
    await step(io, "Select proxy kind", (io) => io.pressEnter())
    await step(io, "public proxy name", (io) => io.pressEnter())
    await step(io, "Add hostnames?", (io) => io.type("n"))
    await step(io, "Use defaults for the haproxy-public proxy", (io) =>
      io.pressEnter(),
    )

    await step(io, "Add another Proxy?", (io) => io.type("y"))
    await step(io, "Select proxy kind", (io) => {
      io.type("internal")
      io.pressEnter()
    })
    await step(io, "internal proxy name", (io) => io.pressEnter())
    await step(io, "Add hostnames?", (io) => io.type("n"))
    await step(io, "Use defaults for the haproxy-internal proxy", (io) =>
      io.pressEnter(),
    )

    await step(io, "Add another Proxy?", (io) => io.type("n"))

    await step(io, "Add a hello-world application", (io) => io.type("y"))
    await step(io, "hello-world application name", (io) => io.pressEnter())
    await step(io, "proxy to route the hello-world through", (io) =>
      io.pressEnter(),
    )
    await step(io, "hostname to route to the hello-world", (io) =>
      io.pressEnter(),
    )

    const answers = await wizard
    expect(answers).toMatchObject({
      appsDir: "applications",
      proxies: [
        {
          name: "haproxy-public",
          containerName: "haproxy-public",
          confDir: "./conf/haproxy-public",
          ports: [
            {ip: "203.0.113.7", hostPort: 80, containerPort: 80},
            {ip: "203.0.113.7", hostPort: 443, containerPort: 443},
          ],
          networkName: "haproxy-public",
          externalHostnames: [],
          staticDirectory: false,
        },
        {
          name: "haproxy-internal",
          containerName: "haproxy-internal",
          confDir: "./conf/haproxy-internal",
          ports: [
            {ip: "100.64.0.9", hostPort: 80, containerPort: 80},
            {ip: "100.64.0.9", hostPort: 443, containerPort: 443},
          ],
          networkName: "haproxy-internal",
          externalHostnames: [],
          staticDirectory: false,
        },
      ],
      applications: [
        {
          application: {name: "hello-world"},
          inputs: {
            name: "hello-world",
            proxyName: "haproxy-public",
            networkName: "haproxy-public",
            externalHostname: "hello.example.com",
          },
        },
      ],
    })
    expect(io.frames()).toContain("auto-detected public IP: 203.0.113.7")
    expect(io.frames()).toContain("auto-detected internal IP: 100.64.0.9")
  })

  it("skips prompts for proxies that are declined", async () => {
    const wizard = startWizard()

    await step(io, "Applications directory", (io) => io.pressEnter())
    await step(io, "Add Proxy?", (io) => io.type("n"))
    await step(io, "Add a hello-world application", (io) => io.type("n"))

    await expect(wizard).resolves.toMatchObject({
      appsDir: "applications",
      proxies: [],
      applications: [],
    })
    expect(io.frames()).not.toContain("proxy name")
  })

  it("offers each registered install wizard and collects multiple apps", async () => {
    const registry = new ApplicationRegistry()

    registry.defineApplication({
      name: "proxy-template",
      description: "internal proxy template",
      type: "proxy",
      inputs: z.object({}),
      templates: {},
    })

    for (const name of ["first-app", "second-app"]) {
      registry.defineApplication({
        name,
        type: "service",
        description: `${name} fixture`,
        inputs: z.object({name: z.string()}),
        installWizard: {
          message: `Install ${name}?`,
          wizard: defineWizard<ApplicationWizardContext>().question(
            "name",
            () =>
              p.text({
                message: `${name} instance name`,
                defaultValue: name,
              }),
          ),
        },
        templates: {},
      })
    }

    const wizard = startWizard({registry})
    await step(io, "Applications directory", (io) => io.pressEnter())
    await step(io, "Add Proxy?", (io) => io.type("n"))
    await step(io, "Install first-app?", (io) => io.type("y"))
    await step(io, "first-app instance name", (io) => io.pressEnter())
    await step(io, "Install second-app?", (io) => io.type("y"))
    await step(io, "second-app instance name", (io) => io.pressEnter())

    const answers = await wizard
    expect(answers.applications).toMatchObject([
      {application: {name: "first-app"}, inputs: {name: "first-app"}},
      {application: {name: "second-app"}, inputs: {name: "second-app"}},
    ])
  })

  it("requires manual ip input when detection fails", async () => {
    const wizard = startWizard({
      detectPublicIp: async () => undefined,
      detectPrivateIp: async () => undefined,
    })

    await step(io, "Applications directory", (io) => io.pressEnter())
    await step(io, "Add Proxy?", (io) => io.pressEnter())
    await step(io, "Select proxy kind", (io) => io.pressEnter())
    await step(io, "public proxy name", (io) => io.pressEnter())
    await step(io, "Add hostnames?", (io) => io.type("n"))
    // no detected ip means no defaults shortcut; the screen prompts every setting
    await step(io, "haproxy-public proxy container name", (io) =>
      io.pressEnter(),
    )
    await step(io, "haproxy-public proxy network name", (io) => io.pressEnter())
    await step(io, "haproxy-public proxy conf directory", (io) =>
      io.pressEnter(),
    )
    await step(io, "haproxy-public HTTP port", (io) => io.pressEnter())
    await step(io, "haproxy-public HTTPS port", (io) => io.pressEnter())
    await step(io, "haproxy-public IP address", (io) => {
      io.type("203.0.113.7")
      io.pressEnter()
    })
    await step(io, "Serve a static directory page", (io) => {
      io.type("y")
      io.pressEnter()
    })
    await step(io, "Add another Proxy?", (io) => io.type("n"))
    await step(io, "Add a hello-world application", (io) => io.type("n"))

    const answers = await wizard
    expect(answers.proxies[0]?.ports[0]?.ip).toBe("203.0.113.7")
    expect(answers.proxies[0]?.staticDirectory).toBe(true)
    expect(io.frames()).toContain(
      "could not auto-detect a public IP, it will need to be entered manually",
    )
    expect(io.frames()).toContain(
      "auto-detection failed, please enter manually",
    )
  })

  it("surfaces validation errors from the port schema", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0)")
    })
    const wizard = startWizard()

    await step(io, "Applications directory", (io) => io.pressEnter())
    await step(io, "Add Proxy?", (io) => io.pressEnter())
    await step(io, "Select proxy kind", (io) => io.pressEnter())
    await step(io, "public proxy name", (io) => io.pressEnter())
    await step(io, "Add hostnames?", (io) => io.type("n"))
    await step(io, "Use defaults for the haproxy-public proxy", (io) => {
      io.type("n")
      io.pressEnter()
    })
    await step(io, "haproxy-public proxy container name", (io) =>
      io.pressEnter(),
    )
    await step(io, "haproxy-public proxy network name", (io) => io.pressEnter())
    await step(io, "haproxy-public proxy conf directory", (io) =>
      io.pressEnter(),
    )
    await step(io, "haproxy-public HTTP port", (io) => io.pressEnter())
    await step(io, "haproxy-public HTTPS port", (io) => {
      io.type("99999")
      io.pressEnter()
    })
    await vi.waitFor(() =>
      expect(io.frames()).toContain(
        "must be a port number between 1 and 65535",
      ),
    )
    // the prompt stays open for correction; cancelling from here exits cleanly
    await step(io, "haproxy-public HTTPS port", (io) => io.pressEscape())

    await expect(wizard).rejects.toThrow("process.exit(0)")
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it("configures the hello-world with typed values", async () => {
    const wizard = startWizard()

    await step(io, "Applications directory", (io) => io.pressEnter())
    await step(io, "Add Proxy?", (io) => io.pressEnter())
    await step(io, "Select proxy kind", (io) => io.pressEnter())
    await step(io, "public proxy name", (io) => io.pressEnter())
    await step(io, "Add hostnames?", (io) => io.type("n"))
    await step(io, "Use defaults for the haproxy-public proxy", (io) =>
      io.pressEnter(),
    )
    await step(io, "Add another Proxy?", (io) => io.type("n"))
    await step(io, "Add a hello-world application", (io) => io.type("y"))
    await step(io, "hello-world application name", (io) => io.pressEnter())
    await step(io, "proxy to route the hello-world through", (io) =>
      io.pressEnter(),
    )
    await step(io, "hostname to route to the hello-world", (io) => {
      io.type("whoami.example.com")
      io.pressEnter()
    })

    const answers = await wizard
    expect(answers).toMatchObject({
      appsDir: "applications",
      proxies: [
        {
          name: "haproxy-public",
          containerName: "haproxy-public",
          confDir: "./conf/haproxy-public",
          ports: [
            {ip: "203.0.113.7", hostPort: 80, containerPort: 80},
            {ip: "203.0.113.7", hostPort: 443, containerPort: 443},
          ],
        },
      ],
      applications: [
        {
          application: {name: "hello-world"},
          inputs: {
            name: "hello-world",
            proxyName: "haproxy-public",
            networkName: "haproxy-public",
            externalHostname: "whoami.example.com",
          },
        },
      ],
    })
  })

  it("exits via cancel handling when a prompt is cancelled", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0)")
    })
    const wizard = startWizard()

    await step(io, "Applications directory", (io) => io.pressEscape())

    await expect(wizard).rejects.toThrow("process.exit(0)")
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(io.frames()).toContain("Cancelled")
  })
})

describe("init action", () => {
  let fsAdaptor: InMemoryFsAdaptor
  let io: PromptTestIo

  beforeEach(() => {
    fsAdaptor = new InMemoryFsAdaptor()
    setFsAdaptor(fsAdaptor)

    io = createPromptIo()
    setPromptIo(io)
  })

  afterEach(() => {
    resetFsAdaptor()
    resetPromptIo()
    vi.restoreAllMocks()
  })

  it("refuses to initialize over a non-empty data directory", async () => {
    await fsAdaptor.writeFile("/occupied/cluster.yaml", "existing: true\n")

    await expect(
      action(undefined, {destinationDir: "/occupied"}, undefined),
    ).rejects.toThrow(/require \/occupied to be empty, but it has '1' entries./)
  })

  it("runs the wizard and writes the cluster to the requested data dir", async () => {
    const result = action(undefined, {destinationDir: rootConfDir}, undefined, {
      detectPublicIp: async () => "203.0.113.7",
      detectPrivateIp: async () => "100.64.0.9",
    })

    await step(io, "Applications directory", (io) => io.pressEnter())
    await step(io, "Add Proxy?", (io) => io.pressEnter())
    await step(io, "Select proxy kind", (io) => io.pressEnter())
    await step(io, "public proxy name", (io) => io.pressEnter())
    await step(io, "Add hostnames?", (io) => io.type("n"))
    await step(io, "Use defaults for the haproxy-public proxy", (io) =>
      io.pressEnter(),
    )
    await step(io, "Add another Proxy?", (io) => io.type("n"))
    await step(io, "Add a hello-world application", (io) => io.type("n"))

    await result

    const config = await loadClusterConfigFile(rootConfDir)
    expect(config.appsDir).toBe("applications")
    expect(
      await fsAdaptor.exists(`${rootConfDir}/applications/haproxy-public.yaml`),
    ).toBe(true)
    expect(io.frames()).toContain("next steps")
    expect(io.frames()).toContain(`initialized cluster at ${rootConfDir}`)
  })
})
