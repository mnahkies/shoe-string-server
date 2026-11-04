import {z} from "zod"
import {p} from "../../tui/clack.prompts.ts"
import {nameSchema} from "../../tui/schemas.ts"
import {wizard} from "../../tui/wizard.ts"
import {
  type ApplicationWizardContext,
  applicationRegistry,
  volume,
} from "../application-registry.ts"

export const postgresInput = z.object({
  name: z.string(),
  networks: z.array(z.string()).min(1),
  // todo: most recent image / pin to sha
  image: z.string().default("docker.io/library/postgres:18.6"),
  /** data directory, relative to the cluster root */
  dataDir: z.string().default("data/postgres"),
  proxyName: z.string().optional(),
  proxyPort: z.number().default(5432),
})

export type PostgresInput = z.input<typeof postgresInput>

export const postgres = applicationRegistry.defineApplication({
  name: "postgres",
  type: "service",
  description: "Postgresql database host",

  inputs: postgresInput,

  validate: (it, {proxyNames}) => {
    if (it.proxyName && !proxyNames.includes(it.proxyName)) {
      throw new Error(`postgres references unknown proxy: '${it.proxyName}'`)
    }
  },

  installWizard: {
    message: "Add a Postgres database?",
    wizard: wizard<ApplicationWizardContext>()
      .question("name", () =>
        p.text({
          message: "postgres application name",
          placeholder: "postgres",
          defaultValue: "postgres",
          validate: nameSchema.optional(),
        }),
      )
      .question("networks", () =>
        p
          .text({
            message: "networks to attach the database to (comma separated)",
            placeholder: "internal,postgres",
            defaultValue: "internal,postgres",
            validate: (value) => {
              const trimmed = (value ?? "").trim()

              // an empty submit falls through to the defaultValue
              if (trimmed === "") {
                return undefined
              }

              return trimmed.split(",").some((it) => it.trim())
                ? undefined
                : "at least one network is required"
            },
          })
          .then((value) =>
            value
              .split(",")
              .map((it) => it.trim())
              .filter(Boolean),
          ),
      )
      .question("exposeViaProxy", ({proxies}) => {
        const internalProxies = proxies.filter((it) => it.kind === "internal")

        if (internalProxies.length === 0) {
          p.log.warn(
            "no internal proxies configured, the database will not be exposed",
          )
          return false
        }

        return p.confirm({
          message: "Expose the database through an internal proxy (tcp 5432)?",
          initialValue: true,
        })
      })
      .when(({exposeViaProxy}) => exposeViaProxy, {
        match: ({proxies}) =>
          wizard<ApplicationWizardContext>()
            .question("proxyName", () => {
              const internalProxies = proxies.filter(
                (it) => it.kind === "internal",
              )
              const proxy = internalProxies[0]

              if (internalProxies.length === 1 && proxy) {
                return proxy.name
              }

              return p.select({
                message: "internal proxy to expose the database through",
                options: internalProxies.map((proxy) => ({
                  value: proxy.name,
                })),
              })
            })
            .question("proxyPort", () =>
              p
                .text({
                  message: "port to expose the database on",
                  placeholder: "5432",
                  defaultValue: "5432",
                })
                .then(Number),
            ),
        otherwise: () => wizard<Record<never, never>>().transform(() => ({})),
      })
      .transform((answers) => ({
        name: answers.name,
        networks: answers.networks,
        proxyName: answers.proxyName,
        proxyPort: answers.proxyPort ?? 5432,
      })),
  },

  templates: {
    compose: (it) => {
      return {
        name: it.name,
        secrets: {
          POSTGRES_PASSWORD: {environment: "POSTGRES_PASSWORD"},
        },
        networks: Object.fromEntries(
          it.networks.map((networkName) => [
            networkName,
            {name: networkName, external: true},
          ]),
        ),
        services: {
          [it.name]: {
            image: it.image,
            hostname: it.name,
            container_name: it.name,
            user: "1000:1000",
            networks: it.networks,
            // only used on first boot, then managed by the administrator
            environment: {
              POSTGRES_PASSWORD_FILE: "/run/secrets/POSTGRES_PASSWORD",
            },
            secrets: ["POSTGRES_PASSWORD"],
            volumes: [
              volume.data({
                source: it.dataDir,
                target: "/var/lib/postgresql",
              }),
            ],
            ...(it.proxyName
              ? {
                  "x-ext-tcp-ports": [
                    {
                      "proxy-port": it.proxyPort,
                      "container-port": 5432,
                      "send-proxy": false,
                      "proxy-name": it.proxyName,
                    },
                  ],
                }
              : {}),
          },
        },
      }
    },
    files: [],
  },
})
