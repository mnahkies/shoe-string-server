import path from "node:path"
import {z} from "zod"
import {p} from "../../tui/clack.prompts.ts"
import {
  containerNameSchema,
  hostnameSchema,
  nameSchema,
  portSchema,
} from "../../tui/schemas.ts"
import {wizard} from "../../tui/wizard.ts"
import {
  type ApplicationWizardContext,
  applicationRegistry,
  type ContainerSpecVolume,
  volume,
} from "../application-registry.ts"
import {renderEtaTemplate} from "../file-templates.ts"

/**
 * The add-proxy wizard collects one proxy, with an auto-detected-IP shortcut
 * that accepts defaults for every setting except the name.
 */
type ProxyWizardContext = {
  kind: string
  detectedIp: string | undefined
  takenNames: string[]
}

type ProxyStepContext = ProxyWizardContext & {
  name: string
  externalHostnames: string[]
}

export const haproxyInput = z.object({
  name: z.string(),
  containerName: z.string(),
  networkName: z.string(),
  externalHostnames: z.array(z.string()),
  image: z.string().default("docker.io/library/haproxy:3.4-alpine"),
  confDir: z.string(),
  ports: z.array(
    z.object({
      ip: z.string(),
      hostPort: z.number(),
      containerPort: z.number(),
    }),
  ),
  staticDirectory: z.boolean().default(false),
})

export type HaproxyInput = z.input<typeof haproxyInput>

export const haproxy = applicationRegistry.defineApplication({
  name: "haproxy",
  type: "proxy",
  description: "haproxy is the reverse proxy supported by shoe-string",

  inputs: haproxyInput,

  installWizard: {
    message: "Add a HAProxy for ingress",
    wizard: wizard<
      ApplicationWizardContext & {
        detectPublicIp: () => Promise<string | undefined>
        detectPrivateIp: () => Promise<string | undefined>
      }
    >()
      .question("kind", async () => {
        return p.select({
          message: "Select proxy kind",
          options: [{value: "public"}, {value: "internal"}],
        })
      })
      .question(
        "detectedIp",
        async ({kind, detectPublicIp, detectPrivateIp}) => {
          const detectedIp = await (kind === "public"
            ? detectPublicIp()
            : detectPrivateIp())

          if (detectedIp) {
            p.log.info(`auto-detected ${kind} IP: ${detectedIp}`)
          } else {
            p.log.warn(
              `could not auto-detect a ${kind} IP, it will need to be entered manually`,
            )
          }

          return detectedIp
        },
      )
      .question("name", ({kind, proxies}) =>
        p.text({
          message: `${kind} proxy name`,
          placeholder: `haproxy-${kind}`,
          defaultValue: `haproxy-${kind}`,
          validate: nameSchema
            .optional()
            .refine(
              (value) => !value || !proxies.find((it) => it.name === value),
              "a proxy with this name already exists",
            ),
        }),
      )
      .question("externalHostnames", async () => {
        const hostnames: string[] = []

        if (
          !(await p.confirm({message: "Add hostnames?", initialValue: true}))
        ) {
          return hostnames
        }

        do {
          const hostname = await p.text({
            message: "Hostname",
            placeholder: "example.com",
            validate: hostnameSchema.optional(),
          })
          hostnames.push(hostname)
        } while (
          await p.confirm({message: "Add another?", initialValue: false})
        )

        return hostnames
      })
      .question("useDefaults", async ({detectedIp, name}) => {
        if (!detectedIp) {
          return false
        }

        return p.confirm({
          message: `Use defaults for the ${name} proxy (container name, conf directory, ports 80/443, ip ${detectedIp})?`,
          initialValue: true,
        })
      })
      .when(({useDefaults}) => useDefaults, {
        match: () =>
          wizard<ProxyStepContext>().transform(({detectedIp, name}) => {
            if (!detectedIp) {
              throw new Error(
                "default proxy settings require an auto-detected IP",
              )
            }

            return {
              containerName: name,
              networkName: name,
              confDir: `./conf/${name}`,
              httpPort: 80,
              httpsPort: 443,
              ip: detectedIp,
              staticDirectory: false,
            }
          }),
        otherwise: () =>
          wizard<ProxyStepContext>()
            .question("containerName", ({name}) =>
              p.text({
                message: `${name} proxy container name`,
                placeholder: `haproxy-${name}`,
                defaultValue: `haproxy-${name}`,
                validate: containerNameSchema,
              }),
            )
            .question("networkName", ({name}) =>
              p.text({
                message: `${name} proxy network name`,
                placeholder: name,
                defaultValue: name,
                validate: nameSchema.optional(),
              }),
            )
            .question("confDir", ({name}) =>
              p.text({
                message: `${name} proxy conf directory (relative to the data directory)`,
                placeholder: `./conf/haproxy-${name}`,
                defaultValue: `./conf/haproxy-${name}`,
                validate: z.string().trim().optional(),
              }),
            )
            .question("httpPort", ({name}) =>
              p
                .text({
                  message: `${name} HTTP port`,
                  placeholder: "80",
                  defaultValue: "80",
                  validate: portSchema,
                })
                .then(Number),
            )
            .question("httpsPort", ({name}) =>
              p
                .text({
                  message: `${name} HTTPS port`,
                  placeholder: "443",
                  defaultValue: "443",
                  validate: portSchema,
                })
                .then(Number),
            )
            .question("ip", ({detectedIp, name}) => {
              const ipHint = detectedIp
                ? `auto-detected: ${detectedIp}`
                : "auto-detection failed, please enter manually"

              return p.text({
                message: `${name} IP address (${ipHint})`,
                placeholder: detectedIp ?? "e.g. 203.0.113.10",
                defaultValue: detectedIp ?? "",
                validate: (value) => {
                  const effective = value || detectedIp
                  return effective && z.ipv4().safeParse(effective).success
                    ? undefined
                    : "must be a valid IPv4 address"
                },
              })
            })
            .question("staticDirectory", ({name}) =>
              p.confirm({
                message: `Serve a static directory page from the ${name} proxy?`,
                initialValue: false,
              }),
            ),
      })
      .transform((answers) => {
        return {
          name: answers.name,
          containerName: answers.containerName ?? answers.name,
          confDir: answers.confDir ?? `./conf/${answers.name}`,
          networkName: answers.networkName ?? answers.name,
          externalHostnames: answers.externalHostnames ?? [],
          staticDirectory: answers.staticDirectory ?? false,
          ports: [
            {
              ip: answers.ip ?? "",
              hostPort: answers.httpPort ?? 80,
              containerPort: 80,
            },
            {
              ip: answers.ip ?? "",
              hostPort: answers.httpsPort ?? 443,
              containerPort: 443,
            },
          ],
        }
      }),
  },

  templates: {
    compose: (it) => {
      const confVolume = volume.conf({
        source: it.confDir,
        target: "/usr/local/etc/haproxy",
      })

      // todo: get hostname from wizard...
      const certificateVolumes: ContainerSpecVolume[] = [
        volume.data(
          {
            source: "data/lego/certificates/example.com.crt",
            target: "/etc/haproxy/ssl/certs/example.com.crt",
          },
          {read_only: true},
        ),
        volume.data(
          {
            source: "data/lego/certificates/example.com.key",
            target: "/etc/haproxy/ssl/certs/example.com.key",
          },
          {read_only: true},
        ),
      ]

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
            hostname: it.containerName,
            container_name: it.containerName,
            "x-ext-proxy": {
              name: it.name,
              confDir: confVolume.source,
            },
            networks: [it.networkName],
            user: "99:99",
            ports: it.ports.map(
              ({ip, hostPort, containerPort}) =>
                `${ip}:${hostPort}:${containerPort}`,
            ),
            ulimits: {
              nofile: 10240,
            },
            sysctls: {
              "net.ipv4.ip_unprivileged_port_start": "53",
            },
            volumes: [confVolume, ...certificateVolumes],
          },
        },
      }
    },
    files: [
      {
        name: (it) => path.join(it.confDir, "haproxy.cfg.template"),
        render: (it) =>
          renderEtaTemplate("haproxy/haproxy.cfg.template.eta", {
            name: it.name,
            staticDirectory: it.staticDirectory,
          }),
      },
      {
        name: (it) => path.join(it.confDir, "directory.html"),
        shouldRender: (it) => it.staticDirectory,
        render: () => renderEtaTemplate("haproxy/directory.html.eta", {}),
      },
    ],
  },
})
