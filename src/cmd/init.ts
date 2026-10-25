import path from "node:path"
import type {Command} from "@bomb.sh/tab"
import type {z} from "zod"
import {resolveRootConfDir, type ServerConfig} from "../config.ts"
import {assertDirectoryEmptyOrMissing} from "../lib/file-system/fs-utils.ts"
import {
  type InitAnswers,
  validateAnswers,
  writeCluster,
} from "../lib/init/scaffold.ts"
import {
  type ApplicationRegistry,
  type ApplicationWizardContext,
  applicationRegistry,
  type InstallApplication,
} from "../registry/application-registry.ts"
import "../registry/applications/hello-world.ts"
import {type HaproxyInput, haproxy} from "../registry/applications/haproxy.ts"
import {p} from "../tui/clack.prompts.ts"
import {wizard} from "../tui/wizard.ts"
import {detectPrivateIp, detectPublicIp} from "../util/ip-addresses.ts"
import type {Cmd} from "./types.ts"

export interface WizardDeps {
  detectPublicIp?: () => Promise<string | undefined>
  detectPrivateIp?: () => Promise<string | undefined>
  registry?: ApplicationRegistry
}
type InitWizardContext = {
  detectPublicIp: () => Promise<string | undefined>
  detectPrivateIp: () => Promise<string | undefined>
  registry: ApplicationRegistry
}

const initWizard = wizard<InitWizardContext>()
  .question("appsDir", () =>
    p.text({
      message: "Applications directory (relative to the data directory)",
      placeholder: "applications",
      defaultValue: "applications",
    }),
  )
  .question("proxies", async ({detectPublicIp, detectPrivateIp}) => {
    const proxies: HaproxyInput[] = []

    if (!(await p.confirm({message: "Add Proxy?", initialValue: true}))) {
      return proxies
    }

    if (!haproxy.installWizard) {
      throw new Error("haproxy must define an install wizard")
    }

    do {
      const proxy = await haproxy.installWizard.wizard.run({
        proxies,
        detectPublicIp,
        detectPrivateIp,
      })
      proxies.push(proxy)
    } while (await p.confirm({message: "Add another Proxy?"}))

    return proxies
  })
  .question("applications", async ({registry, proxies}) => {
    const applications: InstallApplication<
      ApplicationWizardContext,
      z.ZodObject
    >[] = []
    for (const application of registry.listInstallableApplications()) {
      const installWizard = application.installWizard
      if (
        installWizard &&
        (await p.confirm({message: installWizard.message}))
      ) {
        applications.push({
          application,
          inputs: await installWizard.wizard.run({proxies}),
        })
      }
    }
    return applications
  })

export async function runWizard(
  options: WizardDeps = {},
): Promise<InitAnswers> {
  p.intro("shoe-string cluster init")
  const answers = await initWizard.run({
    detectPublicIp: options.detectPublicIp ?? detectPublicIp,
    detectPrivateIp: options.detectPrivateIp ?? detectPrivateIp,
    registry: options.registry ?? applicationRegistry,
  })

  return {
    appsDir: answers.appsDir || "applications",
    proxies: answers.proxies,
    applications: answers.applications,
  }
}

export type InitOptions = {
  destinationDir: string
}

export async function action(
  _: unknown,
  opts: InitOptions,
  _globalOpts: unknown,
  deps: WizardDeps = {},
): Promise<void> {
  const rootConfDir = resolveRootConfDir({
    dataDir: opts.destinationDir,
    secretsFile: undefined,
  })
  await assertDirectoryEmptyOrMissing(rootConfDir)

  const answers = await runWizard(deps)
  validateAnswers(answers)

  const created = await writeCluster(rootConfDir, answers)

  p.note(
    [
      "created:",
      ...created.map((file) => `  ${path.relative(rootConfDir, file)}`),
      "",
      "next steps:",
      "  1. set up sops/age and create secrets.encrypted.yaml",
      "     (see README: Secrets Management) - required before 'up'",
      "  2. review the HAProxy template in each proxy's conf directory;",
      "     the TLS bind line stays commented until certificates exist",
      "  3. add application compose files to the applications directory,",
      "     then run 'shoe-string up'",
    ].join("\n"),
    `initialized cluster at ${rootConfDir}`,
  )
  p.outro("done")
}

export async function registerCompletions(
  cmd: Command | undefined,
  _config: ServerConfig | undefined,
) {
  if (!cmd) {
    throw new Error("couldn't find command")
  }
}

export const initCmd = {
  action,
  registerCompletions,
} satisfies Cmd<InitOptions>
