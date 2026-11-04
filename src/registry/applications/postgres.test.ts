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
import {postgres} from "./postgres.ts"

describe("registry/applications/postgres", () => {
  it("attaches to the configured networks and exposes tcp 5432 via the proxy", async () => {
    const actual = loadYaml(
      await applicationRegistry.renderApplicationCompose(postgres, {
        name: "postgres",
        networks: ["internal", "postgres"],
        proxyName: "internal",
        proxyPort: 5432,
      }),
    )

    expect(actual).toMatchObject({
      name: "postgres",
      secrets: {
        POSTGRES_PASSWORD: {environment: "POSTGRES_PASSWORD"},
      },
      networks: {
        internal: {name: "internal", external: true},
        postgres: {name: "postgres", external: true},
      },
      services: {
        postgres: {
          image: "docker.io/library/postgres:18.6",
          hostname: "postgres",
          container_name: "postgres",
          networks: ["internal", "postgres"],
          environment: {
            POSTGRES_PASSWORD_FILE: "/run/secrets/POSTGRES_PASSWORD",
          },
          secrets: ["POSTGRES_PASSWORD"],
          volumes: [
            {
              type: "bind",
              source: "${" + "DATA_BASE_PATH}/data/postgres",
              target: "/var/lib/postgresql",
              bind: {selinux: "Z"},
            },
          ],
          "x-ext-tcp-ports": [
            {
              "proxy-port": 5432,
              "container-port": 5432,
              "send-proxy": false,
              "proxy-name": "internal",
            },
          ],
        },
      },
    })
  })

  it("omits the proxy binding when not exposed through a proxy", async () => {
    const actual = loadYaml(
      await applicationRegistry.renderApplicationCompose(postgres, {
        name: "postgres",
        networks: ["internal"],
      }),
    ) as {services: {[key: string]: Record<string, unknown>}}

    expect(actual.services["postgres"]).not.toHaveProperty("x-ext-tcp-ports")
  })

  it("rejects inputs referencing an unknown proxy", () => {
    expect(() =>
      postgres.validate?.(
        postgres.inputs.parse({
          name: "postgres",
          networks: ["internal"],
          proxyName: "missing",
        }),
        {proxyNames: ["public"]},
      ),
    ).toThrow("postgres references unknown proxy: 'missing'")
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

    it("collects defaults: postgres on internal,postgres via the internal proxy", async () => {
      const wizard = postgres.installWizard?.wizard.run({proxies})

      await step("postgres application name", (io) => io.pressEnter())
      await step("networks to attach the database to", (io) => io.pressEnter())
      await step("Expose the database through an internal proxy", (io) =>
        io.pressEnter(),
      )
      await step("port to expose the database on", (io) => io.pressEnter())

      await expect(wizard).resolves.toEqual({
        name: "postgres",
        networks: ["internal", "postgres"],
        proxyName: "internal",
        proxyPort: 5432,
      })
    })

    it("supports a custom name, networks and skipping the proxy", async () => {
      const wizard = postgres.installWizard?.wizard.run({proxies})

      await step("postgres application name", (io) => {
        io.type("pg-main")
        io.pressEnter()
      })
      await step("networks to attach the database to", (io) => {
        io.type("internal, db")
        io.pressEnter()
      })
      await step("Expose the database through an internal proxy", (io) => {
        io.type("n")
        io.pressEnter()
      })

      await expect(wizard).resolves.toEqual({
        name: "pg-main",
        networks: ["internal", "db"],
        proxyName: undefined,
        proxyPort: 5432,
      })
    })

    it("skips proxy exposure when no proxies are configured", async () => {
      const wizard = postgres.installWizard?.wizard.run({proxies: []})

      await step("postgres application name", (io) => io.pressEnter())
      await step("networks to attach the database to", (io) => io.pressEnter())

      await expect(wizard).resolves.toEqual({
        name: "postgres",
        networks: ["internal", "postgres"],
        proxyName: undefined,
        proxyPort: 5432,
      })
    })

    it("skips proxy exposure when only public proxies are configured", async () => {
      const wizard = postgres.installWizard?.wizard.run({
        proxies: [
          {
            name: "public",
            networkName: "public",
            externalHostnames: [],
            kind: "public",
          },
        ],
      })

      await step("postgres application name", (io) => io.pressEnter())
      await step("networks to attach the database to", (io) => io.pressEnter())

      await expect(wizard).resolves.toEqual({
        name: "postgres",
        networks: ["internal", "postgres"],
        proxyName: undefined,
        proxyPort: 5432,
      })
    })
  })
})
