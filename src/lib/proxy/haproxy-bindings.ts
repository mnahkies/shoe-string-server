import {z} from "zod"
import {
  extHostNameSchema,
  extProxyMarkSchema,
  extTcpPortSchema,
} from "../../types/docker-compose-extensions.ts"
import {forEachComposeService} from "../compose-files/compose-files.ts"

/** A compose service that acts as a reverse proxy (e.g. haproxy). */
export interface DiscoveredProxy {
  name: string
  containerName: string
  /** Compose file the proxy was discovered in. */
  appsFile: string
  /** Service key within the compose file. */
  serviceName: string
}

export interface HostnameBinding {
  name: string
  auth: boolean
  wss: boolean
  proxyName: string
}

export interface HttpBinding {
  hostnames: HostnameBinding[]
  externalPort: number
  containerPort: number
}

/** Hostnames of a binding that attach to the given proxy. */
export function hostnamesForProxy(
  binding: HttpBinding,
  proxyName: string,
): HostnameBinding[] {
  return binding.hostnames.filter((it) => it.proxyName === proxyName)
}

export interface TcpBinding {
  externalPort: number
  containerPort: number
  sendProxy: boolean
  proxyName: string
}
export interface ProxyBinding {
  containerHostname: string
  serviceName: string
  httpBindings: Record<string, HttpBinding>
  tcpBindings: Record<string, TcpBinding>
}

export interface DiscoveredBindings {
  proxies: DiscoveredProxy[]
  bindings: ProxyBinding[]
}

/**
 * Discovers reverse proxy services from compose files.
 *
 * A service counts as a proxy when it declares `x-ext-proxy`.
 * `x-ext-proxy.name` and `service.container_name` are required.
 */
export async function discoverProxies(
  applicationsDirectory: string,
): Promise<DiscoveredProxy[]> {
  const proxies: DiscoveredProxy[] = []
  const seenNames = new Map<string, {serviceName: string; file: string}>()
  const seenContainers = new Map<string, {serviceName: string; file: string}>()

  for await (const {serviceName, service, file} of forEachComposeService(
    applicationsDirectory,
  )) {
    if (!service["x-ext-proxy"]) {
      continue
    }

    const name = extProxyMarkSchema.parse(service["x-ext-proxy"]).name

    if (!name || !service.container_name) {
      throw new Error(
        `Invalid x-ext-proxy configuration for service ${serviceName} in ${file}`,
      )
    }

    const existingName = seenNames.get(name)
    if (existingName) {
      throw new Error(
        `Duplicate proxy name '${name}' found in service '${serviceName}' of file '${file}' (already defined in service '${existingName.serviceName}' of file '${existingName.file}')`,
      )
    }
    seenNames.set(name, {serviceName, file})

    const existingContainer = seenContainers.get(service.container_name)
    if (existingContainer) {
      throw new Error(
        `Duplicate container name '${service.container_name}' found in service '${serviceName}' of file '${file}' (already defined in service '${existingContainer.serviceName}' of file '${existingContainer.file}')`,
      )
    }
    seenContainers.set(service.container_name, {serviceName, file})

    proxies.push({
      name,
      serviceName,
      containerName: service.container_name,
      appsFile: file,
    })
  }

  return proxies.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Loads proxy bindings (x-ext-hostnames / x-ext-tcp-ports) from every compose
 * file in the applications directory, resolving which proxy each binding
 * attaches to. Also discovers the proxy services themselves so generation
 * does not depend on a fixed set of proxy names.
 */
export async function getHaproxyBindings(
  applicationsDirectory: string,
): Promise<DiscoveredBindings> {
  const proxies = await discoverProxies(applicationsDirectory)
  const proxyBindings: ProxyBinding[] = []

  const tcpPortsByProxy = new Map<
    string,
    Map<number, {serviceName: string; file: string}>
  >()
  const hostnamesByProxy = new Map<
    string,
    Map<string, {serviceName: string; file: string}>
  >()

  for await (const {serviceName, service, file} of forEachComposeService(
    applicationsDirectory,
  )) {
    const extHostnames = z
      .array(extHostNameSchema)
      .parse(service["x-ext-hostnames"] ?? [])

    const extTcpPorts = z
      .array(extTcpPortSchema)
      .parse(service["x-ext-tcp-ports"] ?? [])

    if (!extHostnames.length && !extTcpPorts.length) {
      continue
    }

    if (!service.hostname) {
      throw new Error(
        `Application '${file}' missing hostname on service '${serviceName}'`,
      )
    }

    const proxyBinding: ProxyBinding = {
      containerHostname: service.hostname,
      serviceName,
      httpBindings: {},
      tcpBindings: {},
    }

    for (const binding of extHostnames) {
      const name = `${service.hostname}-${binding["container-port"]}`

      if (!/^[a-zA-Z0-9_.-]+$/.test(binding.name)) {
        throw new Error(
          `Invalid hostname '${binding.name}' in service '${serviceName}' of file '${file}'`,
        )
      }

      const proxyName = binding["proxy-name"]
      const port = binding["proxy-port"]
      const routeKey = `${port}:${binding.name.toLowerCase()}`

      let hostnamesForThisProxy = hostnamesByProxy.get(proxyName)
      if (!hostnamesForThisProxy) {
        hostnamesForThisProxy = new Map()
        hostnamesByProxy.set(proxyName, hostnamesForThisProxy)
      }
      const existingRoute = hostnamesForThisProxy.get(routeKey)
      if (existingRoute) {
        throw new Error(
          `Conflicting route for hostname '${binding.name}' on port ${port} of proxy '${proxyName}': defined in service '${serviceName}' of '${file}' and service '${existingRoute.serviceName}' of '${existingRoute.file}'`,
        )
      }
      hostnamesForThisProxy.set(routeKey, {serviceName, file})

      proxyBinding.httpBindings[name] ??= {
        hostnames: [],
        externalPort: binding["proxy-port"],
        containerPort: binding["container-port"],
      }

      proxyBinding.httpBindings[name].hostnames.push({
        name: binding.name,
        auth: binding.auth,
        wss: binding.wss,
        proxyName: binding["proxy-name"],
      })
    }

    for (const binding of extTcpPorts) {
      const name = `${service.hostname}-${binding["container-port"]}`

      if (proxyBinding.tcpBindings[name]) {
        throw new Error(
          `Duplicate TCP binding for '${name}' in service '${serviceName}' of file '${file}'`,
        )
      }

      const proxyName = binding["proxy-name"]
      const port = binding["proxy-port"]

      let tcpPortsForThisProxy = tcpPortsByProxy.get(proxyName)
      if (!tcpPortsForThisProxy) {
        tcpPortsForThisProxy = new Map()
        tcpPortsByProxy.set(proxyName, tcpPortsForThisProxy)
      }
      const existingTcp = tcpPortsForThisProxy.get(port)
      if (existingTcp) {
        throw new Error(
          `Port conflict: external port ${port} on proxy '${proxyName}' is claimed by multiple TCP bindings: service '${serviceName}' in '${file}' and service '${existingTcp.serviceName}' in '${existingTcp.file}'`,
        )
      }
      tcpPortsForThisProxy.set(port, {serviceName, file})

      proxyBinding.tcpBindings[name] = {
        externalPort: binding["proxy-port"],
        containerPort: binding["container-port"],
        sendProxy: binding["send-proxy"],
        proxyName: binding["proxy-name"],
      }
    }

    proxyBindings.push(proxyBinding)
  }

  return {proxies, bindings: proxyBindings}
}

/** Returns bindings for a ProxyBinding that attach to the given proxy. */
export function bindingAttachesToProxy(
  binding: ProxyBinding,
  proxyName: string,
): boolean {
  const hasHttp = Object.values(binding.httpBindings).some((b) =>
    b.hostnames.some((h) => h.proxyName === proxyName),
  )
  const hasTcp = Object.values(binding.tcpBindings).some(
    (b) => b.proxyName === proxyName,
  )
  return hasHttp || hasTcp
}
