import {z} from "zod"
import {p} from "../../tui/clack.prompts.ts"
import {hostnameSchema, nameSchema} from "../../tui/schemas.ts"
import {wizard} from "../../tui/wizard.ts"
import {
  type ApplicationWizardContext,
  applicationRegistry,
} from "../application-registry.ts"

export const helloWorld = applicationRegistry.defineApplication({
  name: "hello-world",
  type: "service",
  description:
    "a hello-world application to demonstrate reverse proxy functionality",

  inputs: z.object({
    name: z.string(),
    image: z.string().default("docker.io/traefik/whoami:v1.12.0"),
    proxyName: z.string(),
    networkName: z.string(),
    externalHostname: z.string(),
  }),

  validate: (it, {proxyNames}) => {
    if (!proxyNames.includes(it.proxyName)) {
      throw new Error(`hello-world references unknown proxy: '${it.proxyName}'`)
    }
  },

  installWizard: {
    message: "Add a hello-world application (traefik/whoami)?",
    wizard: wizard<ApplicationWizardContext>()
      .question("name", () =>
        p.text({
          message: "hello-world application name",
          placeholder: "hello-world",
          defaultValue: "hello-world",
          validate: nameSchema.optional(),
        }),
      )
      .question("proxyName", ({proxies}) => {
        const defaultProxy = proxies[0]?.name

        if (!defaultProxy) {
          throw new Error("hello-world requires a configured proxy")
        }

        return p.select({
          message: "proxy to route the hello-world through",
          options: proxies.map((proxy) => ({value: proxy.name})),
        })
      })
      .question("externalHostname", ({proxies, proxyName}) => {
        const selectedProxy = proxies.find((it) => it.name === proxyName)

        if (!selectedProxy) {
          throw new Error("hello-world requires a configured proxy")
        }

        return p.text({
          message: "hostname to route to the hello-world",
          placeholder: `hello.${selectedProxy.externalHostnames[0] || "example.com"}`,
          defaultValue: `hello.${selectedProxy.externalHostnames[0] || "example.com"}`,
          validate: hostnameSchema.optional(),
        })
      })
      .question("networkName", ({proxies, proxyName}) => {
        const selectedProxy = proxies.find((proxy) => proxy.name === proxyName)

        if (!selectedProxy) {
          throw new Error("hello-world requires a configured proxy")
        }

        return selectedProxy.networkName
      }),
  },
  templates: {
    compose: (it) => {
      return {
        name: it.name,
        networks: {
          [it.networkName]: {
            name: it.networkName,
            external: true,
          },
        },
        services: {
          [it.name]: {
            image: it.image,
            hostname: it.name,
            container_name: it.name,
            networks: [it.networkName],
            "x-ext-hostnames": [
              {
                name: it.externalHostname,
                "container-port": 80,
                "proxy-name": it.proxyName,
              },
            ],
          },
        },
      }
    },
    files: [],
  },
})
