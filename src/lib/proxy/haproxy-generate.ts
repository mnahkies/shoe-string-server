import * as path from "node:path"
import {$} from "zx"
import type {ProxyConfig} from "../../config.ts"
import {getFsAdaptor} from "../file-system/fs-adaptor.ts"
import {
  bindingAttachesToProxy,
  getHaproxyBindings,
  hostnamesForProxy,
  type ProxyBinding,
} from "./haproxy-bindings.ts"

export type {ProxyBinding}

export interface GeneratedHaproxyConfig {
  tcpListen: string
  useBackends: string
  authFrontends: string
  backends: string
}

/**
 * Templates may hand-author specialised blocks (e.g. tuned websocket backends)
 * by writing a block whose name collides with one we'd generate; those lines
 * are left to the template so generation never duplicates them.
 */
function templateSuppliesBlock(
  existingBlocks: Set<string>,
  blockType: string,
  name: string,
): boolean {
  return existingBlocks.has(`${blockType} ${name}`)
}

function collectTemplateBlocks(template: string): Set<string> {
  const blocks = new Set<string>()
  for (const match of template.matchAll(
    /^\s*(listen|frontend|backend)\s+(\S+)/gm,
  )) {
    blocks.add(`${match[1]} ${match[2]}`)
  }
  return blocks
}

export function generateTcpListen(
  applications: ProxyBinding[],
  proxyName: string,
  existingBlocks: Set<string>,
): string {
  const result: string[] = []

  for (const app of applications) {
    if (!bindingAttachesToProxy(app, proxyName)) {
      continue
    }
    for (const [name, binding] of Object.entries(app.tcpBindings)) {
      if (binding.proxyName !== proxyName) {
        continue
      }
      if (templateSuppliesBlock(existingBlocks, "listen", name)) {
        continue
      }
      result.push(
        [
          `listen ${name}`,
          `    bind *:${binding.externalPort}`,
          `    mode tcp`,
          `    option tcplog`,
          `    balance leastconn`,
          `    server ${name} ${app.containerHostname}:${binding.containerPort} resolvers dns_resolver${binding.sendProxy ? " send-proxy" : ""}`,
        ].join("\n"),
      )
    }
  }
  return result.join("\n\n")
}

export function generateUseBackends(
  applications: ProxyBinding[],
  proxyName: string,
  existingBlocks: Set<string>,
): string {
  // websocket-aware rules first so they win over plain host matching
  const lines: string[] = []

  for (const app of applications) {
    if (!bindingAttachesToProxy(app, proxyName)) {
      continue
    }
    for (const [name, binding] of Object.entries(app.httpBindings)) {
      const plainBlock = templateSuppliesBlock(existingBlocks, "backend", name)
      const wssBlock = templateSuppliesBlock(
        existingBlocks,
        "backend",
        `${name}-wss`,
      )

      for (const hostname of binding.hostnames) {
        if (hostname.proxyName !== proxyName) {
          continue
        }
        if (hostname.wss && !wssBlock) {
          lines.push(
            `    use_backend ${name}-wss if { hdr(host) -i ${hostname.name} } { hdr(Upgrade) -i websocket }`,
          )
        }
        if (!plainBlock) {
          lines.push(
            `    use_backend ${name} if { hdr(host) -i ${hostname.name} }`,
          )
        }
      }
    }
  }

  // stable order: websocket rules first, then plain host rules
  return lines
    .filter(Boolean)
    .sort(
      (a, b) =>
        (a.includes("websocket") ? 0 : 1) - (b.includes("websocket") ? 0 : 1),
    )
    .join("\n\n")
}

export function generateAuthFrontends(
  applications: ProxyBinding[],
  proxyName: string,
): string {
  const hostnames: string[] = []

  for (const app of applications) {
    if (!bindingAttachesToProxy(app, proxyName)) {
      continue
    }
    for (const binding of Object.values(app.httpBindings)) {
      for (const hostname of binding.hostnames) {
        if (hostname.proxyName !== proxyName) {
          continue
        }
        if (hostname.auth) {
          hostnames.push(hostname.name)
        }
      }
    }
  }

  if (hostnames.length === 0) {
    return ""
  }

  return [
    `    acl protected-frontends hdr(host) -i ${hostnames.sort().join(" -i ")}`,
    "",
    "    http-request lua.auth-intercept authelia /api/authz/forward-auth HEAD * remote-user,remote-groups,remote-name,remote-email - if protected-frontends",
    "",
    "    http-request deny if protected-frontends !{ var(txn.auth_response_successful) -m bool } { var(txn.auth_response_code) -m int 403 }",
    "    http-request redirect location %[var(txn.auth_response_location)] if protected-frontends !{ var(txn.auth_response_successful) -m bool }",
  ].join("\n")
}

export function generateBackends(
  applications: ProxyBinding[],
  proxyName: string,
  existingBlocks: Set<string>,
): string {
  const backends: string[] = []

  for (const app of applications) {
    if (!bindingAttachesToProxy(app, proxyName)) {
      continue
    }
    for (const [name, binding] of Object.entries(app.httpBindings)) {
      const matchingHostnames = hostnamesForProxy(binding, proxyName)
      if (matchingHostnames.length === 0) {
        continue
      }
      if (templateSuppliesBlock(existingBlocks, "backend", name)) {
        continue
      }
      backends.push(
        [
          `backend ${name}`,
          `    balance    roundrobin`,
          `    server     ${name} ${app.containerHostname}:${binding.containerPort} resolvers dns_resolver`,
        ].join("\n"),
      )

      const anyWss = matchingHostnames.some((it) => it.wss)
      const wssName = `${name}-wss`
      if (
        anyWss &&
        !templateSuppliesBlock(existingBlocks, "backend", wssName)
      ) {
        backends.push(
          [
            `backend ${wssName}`,
            `    balance    roundrobin`,
            `    server     ${wssName} ${app.containerHostname}:${binding.containerPort} resolvers dns_resolver`,
            `    option http-server-close`,
            `    option forwardfor`,
            `    http-reuse safe`,
            `    timeout tunnel 1h`,
            `    timeout server 5m`,
          ].join("\n"),
        )
      }
    }
  }

  return backends.join("\n\n")
}

export function renderConfig(
  applications: ProxyBinding[],
  proxyName: string,
  template: string,
): GeneratedHaproxyConfig {
  const existingBlocks = collectTemplateBlocks(template)

  return {
    tcpListen: generateTcpListen(applications, proxyName, existingBlocks),
    useBackends: generateUseBackends(applications, proxyName, existingBlocks),
    authFrontends: generateAuthFrontends(applications, proxyName),
    backends: generateBackends(applications, proxyName, existingBlocks),
  }
}

const REQUIRED_PLACEHOLDERS = [
  "{{TCP_LISTEN}}",
  "{{USE_BACKENDS}}",
  "{{AUTH_FRONTENDS}}",
  "{{BACKENDS}}",
] as const

export function validateTemplatePlaceholders(
  template: string,
  templatePath = "haproxy.cfg.template",
): void {
  for (const placeholder of REQUIRED_PLACEHOLDERS) {
    const escaped = placeholder.replace(/[{}]/g, "\\$&")
    const count = (template.match(new RegExp(escaped, "g")) || []).length
    if (count === 0) {
      throw new Error(
        `HAProxy template at '${templatePath}' is missing required placeholder '${placeholder}'`,
      )
    }
    if (count > 1) {
      throw new Error(
        `HAProxy template at '${templatePath}' contains duplicate placeholder '${placeholder}' (${count} occurrences)`,
      )
    }
  }
}

/**
 * Generates the haproxy.cfg for a single proxy (by name) from the template in
 * its config directory. Proxy names come from compose marks (`x-ext-proxy`),
 * so a cluster can run any number of proxies without code changes.
 *
 * Template placeholders:
 *  - {{TCP_LISTEN}}    tcp stream listeners
 *  - {{USE_BACKENDS}}  http use_backend rules (websocket variants first)
 *  - {{AUTH_FRONTENDS}} forward-auth intercept rules for auth-marked hostnames
 *  - {{BACKENDS}}      backend definitions
 */
export async function generateHaproxyConfig(
  applicationsDirectory: string,
  proxyConfig: ProxyConfig,
  dhparamBits = 2048,
): Promise<void> {
  const fs = getFsAdaptor()
  const {bindings: applications} = await getHaproxyBindings(
    applicationsDirectory,
  )
  const templatePath = path.join(proxyConfig.conf, "haproxy.cfg.template")
  const outputPath = path.join(proxyConfig.conf, "haproxy.cfg")
  const dhParamsPath = path.join(proxyConfig.conf, "dhparam")

  if (!(await fs.exists(templatePath))) {
    throw new Error(`Template file not found at '${templatePath}'`)
  }

  const template = await fs.readFile(templatePath)
  validateTemplatePlaceholders(template, templatePath)
  const generated = renderConfig(applications, proxyConfig.name, template)

  const output = [
    "#---------------------------------------------------------------------",
    "# WARNING: automatically generated, please edit the template file haproxy.cfg.template",
    `# proxy: ${proxyConfig.name}`,
    "#---------------------------------------------------------------------",
    "",
    template
      .replace("{{TCP_LISTEN}}", generated.tcpListen)
      .replace("{{USE_BACKENDS}}", generated.useBackends)
      .replace("{{AUTH_FRONTENDS}}", generated.authFrontends)
      .replace("{{BACKENDS}}", generated.backends),
  ].join("\n")

  const tempPath = path.join(
    proxyConfig.conf,
    `.haproxy.cfg.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`,
  )
  await fs.writeFile(tempPath, output)
  await fs.rename(tempPath, outputPath)

  if (output.includes("/dhparam") && !(await fs.exists(dhParamsPath))) {
    const dhParams = await $`openssl dhparam ${dhparamBits}`
    await fs.writeFile(dhParamsPath, dhParams.stdout)
  }

  console.log(`Generated HAProxy config: ${outputPath}`)
}
