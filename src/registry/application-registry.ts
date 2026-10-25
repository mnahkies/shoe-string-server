import path from "node:path"
import {dump} from "js-yaml"
import type {z} from "zod"
import type {ServerConfig} from "../config.ts"
import type {FsAdaptor} from "../lib/file-system/types.ts"
import type {Wizard} from "../tui/wizard.ts"
import type {
  ContainerSpecVolume,
  ExtendedComposeSpecification,
} from "../types/docker-compose-extensions.ts"

export type {ContainerSpecVolume}

export type ApplicationWizardContext = {
  proxies: {
    name: string
    externalHostnames: string[]
    networkName: string
  }[]
}

export type InstallApplication<
  WizardContext extends ApplicationWizardContext,
  S extends z.ZodObject,
> = {
  application: RegisteredApplication<WizardContext, S>
  inputs: z.input<S>
}

/**
 * A registered application template can initialize an application inside a
 * server configuration repository.
 */
export type RegisteredApplication<
  WizardContext extends ApplicationWizardContext,
  S extends z.ZodObject,
> = {
  name: string
  description: string
  type: "service" | "proxy"

  /** The input schema; an install wizard returns a value matching its input type. */
  inputs: S

  installWizard?: {
    message: string
    wizard: Wizard<WizardContext, z.input<S>>
  }

  /**
   * Cross-field validation against the surrounding cluster, run before any
   * file is written. Use it to reject inputs that reference resources the
   * cluster does not define, such as an unknown proxy.
   */
  validate?: (inputs: z.output<S>, context: {proxyNames: string[]}) => void

  templates: {
    /**
     * Function to render the main compose file for the application. The
     * compose project name doubles as the compose file name inside the
     * applications directory.
     */
    compose?: (it: z.output<S>) => ExtendedComposeSpecification
    /**
     * Array of additional files to be rendered. These can be conditionally
     * rendered based on the input schema, and typically use a eta template.
     * File paths are relative to the cluster root.
     */
    files?: {
      name: (it: z.output<S>) => string
      shouldRender?: (it: z.output<S>) => boolean
      render: (it: z.output<S>) => string
    }[]
  }
}

export class ApplicationRegistry {
  applications: RegisteredApplication<ApplicationWizardContext, z.ZodObject>[] =
    []

  defineApplication<
    WizardContext extends ApplicationWizardContext,
    S extends z.ZodObject,
  >(
    application: RegisteredApplication<WizardContext, S>,
  ): RegisteredApplication<WizardContext, S> {
    this.applications.push(application)
    return application
  }

  listInstallableApplications(): RegisteredApplication<
    ApplicationWizardContext,
    z.ZodObject
  >[] {
    const installable: RegisteredApplication<
      ApplicationWizardContext,
      z.ZodObject
    >[] = []
    for (const application of this.applications) {
      if (application.installWizard && application.type === "service") {
        installable.push(application)
      }
    }
    return installable
  }

  /**
   * Renders the application's compose file as yaml; empty when the
   * application does not define a compose file.
   */
  renderApplicationCompose<S extends z.ZodObject>(
    application: RegisteredApplication<ApplicationWizardContext, S>,
    rawInput: z.input<S>,
  ): string {
    const compose = application.templates.compose?.(
      application.inputs.parse(rawInput),
    )
    return compose ? dump(compose) : ""
  }

  /**
   * Renders and writes the application into a cluster repository: the
   * compose file into `appsDir` and every auxiliary file relative to
   * `rootConfDir`. Returns the created file paths.
   */
  async renderApplication<S extends z.ZodObject>(
    application: RegisteredApplication<ApplicationWizardContext, S>,
    rawInput: z.input<S>,
    fs: FsAdaptor,
    config: Pick<ServerConfig, "rootConfDir" | "appsDir">,
  ): Promise<string[]> {
    const created: string[] = []
    const inputs = application.inputs.parse(rawInput)

    const compose = application.templates.compose?.(inputs)
    if (compose) {
      const filename = path.join(
        config.appsDir,
        `${compose.name || application.name}.yaml`,
      )
      await writeFile(filename, dump(compose), fs)
      created.push(filename)
    }

    for (const template of application.templates.files ?? []) {
      if (template.shouldRender && !template.shouldRender(inputs)) {
        continue
      }

      const relative = template.name(inputs)
      if (path.isAbsolute(relative)) {
        throw new Error(
          `application '${application.name}' file path must be relative to the cluster root: '${relative}'`,
        )
      }
      const filename = path.resolve(config.rootConfDir, relative)
      await writeFile(filename, template.render(inputs), fs)
      created.push(filename)
    }

    return created
  }

  async renderApplications(
    applications: InstallApplication<ApplicationWizardContext, z.ZodObject>[],
    fs: FsAdaptor,
    config: Pick<ServerConfig, "rootConfDir" | "appsDir">,
  ) {
    const created: string[] = []

    for (const {application, inputs} of applications) {
      created.push(
        ...(await this.renderApplication(application, inputs, fs, config)),
      )
    }

    return created
  }
}

async function writeFile(
  filename: string,
  content: string,
  fs: FsAdaptor,
): Promise<void> {
  await fs.mkdir(path.dirname(filename), {recursive: true})
  await fs.writeFile(filename, content)
}

export const applicationRegistry = new ApplicationRegistry()

/**
 * Resolves a conf/data volume source against the `${DATA_BASE_PATH}`
 * placeholder, keeping the `${DATA_BASE_PATH}/conf|data/...` convention that
 * overlay hashing and data-directory preparation rely on.
 */
function dataBaseSource(kind: "conf" | "data", source: string): string {
  if (path.isAbsolute(source)) {
    throw new Error(
      `${kind} volume source must be relative to the cluster root: '${source}'`,
    )
  }
  if (source.startsWith(`\${DATA_BASE_PATH}`)) {
    throw new Error(
      `${kind} volume source must not include the DATA_BASE_PATH prefix: '${source}'`,
    )
  }
  const normalized = path.normalize(source)
  if (!normalized.startsWith(`${kind}/`)) {
    throw new Error(
      `${kind} volume source must live under the '${kind}/' directory: '${source}'`,
    )
  }
  return `\${DATA_BASE_PATH}/${normalized}`
}

export const volume = {
  /**
   * Read-only bind mount of a path under the cluster's conf directory.
   * `source` is relative to the cluster root and must live under `conf/`.
   */
  conf(
    it: {source: string; target: string},
    overrides: Partial<ContainerSpecVolume> = {},
  ): ContainerSpecVolume {
    return {
      type: "bind",
      source: dataBaseSource("conf", it.source),
      target: it.target,
      bind: {selinux: "Z"},
      read_only: true,
      ...overrides,
    }
  },
  /**
   * Bind mount of a path under the cluster's data directory. `source` is
   * relative to the cluster root and must live under `data/`; writable
   * unless overridden.
   */
  data(
    it: {source: string; target: string},
    overrides: Partial<ContainerSpecVolume> = {},
  ): ContainerSpecVolume {
    return {
      type: "bind",
      source: dataBaseSource("data", it.source),
      target: it.target,
      bind: {selinux: "Z"},
      ...overrides,
    }
  },
}
