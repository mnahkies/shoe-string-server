import {load as loadYaml} from "js-yaml"
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {
  createPromptIo,
  type PromptTestIo,
} from "../../tui/clack.prompts.test-harness.ts"
import {resetPromptIo, setPromptIo} from "../../tui/clack.prompts.ts"
import {
  type ApplicationWizardContext,
  applicationRegistry,
} from "../application-registry.ts"
import {helloWorld} from "./hello-world.ts"

describe("registry/applications/hello-world", () => {
  it("attaches to the selected network and routes via the proxy name", async () => {
    const inputs = helloWorld.inputs.parse({
      name: "hello-world",
      proxyName: "public",
      networkName: "mesh-net",
      externalHostname: "hello-world.example.com",
    })

    const actual = loadYaml(
      await applicationRegistry.renderApplicationCompose(helloWorld, inputs),
    )

    expect(actual).toMatchObject({
      networks: {"mesh-net": {name: "mesh-net", external: true}},
      services: {
        "hello-world": {
          networks: ["mesh-net"],
          "x-ext-hostnames": [
            {
              name: "hello-world.example.com",
              "container-port": 80,
              "proxy-name": "public",
            },
          ],
        },
      },
    })
  })

  it("rejects inputs referencing an unknown proxy", () => {
    expect(() =>
      helloWorld.validate?.(
        helloWorld.inputs.parse({
          name: "hello-world",
          proxyName: "missing",
          networkName: "public",
          externalHostname: "hello-world.example.com",
        }),
        {proxyNames: ["public"]},
      ),
    ).toThrow("hello-world references unknown proxy: 'missing'")
  })

  describe("install wizard", () => {
    let io: PromptTestIo

    beforeEach(() => {
      io = createPromptIo()
      setPromptIo(io)
    })

    afterEach(() => {
      resetPromptIo()
    })

    const proxies: ApplicationWizardContext["proxies"] = [
      {
        name: "public",
        networkName: "public",
        externalHostnames: [],
        kind: "public",
      },
      {
        name: "internal",
        networkName: "mesh-net",
        externalHostnames: [],
        kind: "internal",
      },
    ]

    async function step(
      prompt: string,
      send: (io: PromptTestIo) => void,
    ): Promise<void> {
      await io.waitForPrompt(prompt)
      send(io)
    }

    it("collects defaults against the first proxy", async () => {
      const wizard = helloWorld.installWizard?.wizard.run({proxies})

      await step("hello-world application name", (io) => io.pressEnter())
      await step("proxy to route the hello-world through", (io) =>
        io.pressEnter(),
      )
      await step("hostname to route to the hello-world", (io) =>
        io.pressEnter(),
      )

      await expect(wizard).resolves.toEqual({
        name: "hello-world",
        proxyName: "public",
        externalHostname: "hello.example.com",
        networkName: "public",
      })
    })

    it("uses the selected proxy's network", async () => {
      const wizard = helloWorld.installWizard?.wizard.run({proxies})

      await step("hello-world application name", (io) => {
        io.type("whoami")
        io.pressEnter()
      })
      await step("proxy to route the hello-world through", (io) => {
        io.type("internal")
        io.pressEnter()
      })
      await step("hostname to route to the hello-world", (io) => {
        io.type("whoami.example.com")
        io.pressEnter()
      })

      await expect(wizard).resolves.toEqual({
        name: "whoami",
        proxyName: "internal",
        externalHostname: "whoami.example.com",
        networkName: "mesh-net",
      })
    })
  })
})
